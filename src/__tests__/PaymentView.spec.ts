import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import PaymentView from '@/views/PaymentView.vue'
import { isWechatPaymentHandoff } from '@/utils/wechatPayment'

const mocks = vi.hoisted(() => ({
  create: vi.fn(), get: vi.fn(), createRequirement: vi.fn(), getRequirement: vi.fn(),
  replace: vi.fn(), push: vi.fn(), back: vi.fn(), qr: vi.fn(), invoke: vi.fn(),
  authorize: vi.fn(), authorized: vi.fn(),
}))
const route = reactive({ query: {} as Record<string, string> })
const auth = reactive({ token: '', isAuthed: false, hydrate: vi.fn() })
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({
    replace: mocks.replace, back: mocks.back, push: mocks.push,
    resolve: ({ query }: { query: Record<string, string> }) => ({
      href: `/payment?${new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined))}`,
    }),
  }),
}))
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.qr } }))
vi.mock('@/api/adapay', () => ({
  createAdapayDeveloperDepositPayment: mocks.create,
  getAdapayDeveloperDepositPayment: mocks.get,
  createAdapayPayment: mocks.createRequirement,
  getAdapayPayment: mocks.getRequirement,
  getAdapayClientPlatform: () => 'pc',
}))
vi.mock('@/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth')>()),
  getWechatPaymentAuthorizationStatus: mocks.authorized,
  getWechatPaymentAuthorizeUrl: mocks.authorize,
}))
vi.mock('@/api/payments', () => ({
  confirmPayment: vi.fn(), getAlipayPageHtml: vi.fn(), listPaymentOrders: vi.fn(),
}))

const paymentInfo = {
  appId: 'wx-test', timeStamp: '1234567890', nonceStr: 'nonce-test',
  package: 'prepay_id=test', signType: 'RSA', paySign: 'test-signature',
}
const payment = {
  paymentId: 'deposit-test', payChannel: 'wechat', amountCny: '1.00',
  status: 'created', payUrl: JSON.stringify(paymentInfo),
}
const handoff = {
  adapay: '1', developer_deposit: '1', payment_handoff: '1', payment_id: payment.paymentId,
  channel: 'wechat', client_platform: 'mobile', amount_cny: '1.00', qr_content: payment.payUrl,
}
let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.resetAllMocks()
  auth.token = 'desktop-session'
  auth.isAuthed = true
  route.query = {
    adapay: '1', developer_deposit: '1', intent: '1', channel: 'wechat',
    client_platform: 'pc', amount_cny: '1',
  }
  mocks.create.mockResolvedValue(payment)
  mocks.get.mockResolvedValue(payment)
  mocks.replace.mockImplementation(async ({ query }) => { route.query = query })
  mocks.qr.mockResolvedValue('data:image/png;base64,test')
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Desktop Chrome')
  vi.stubGlobal('WeixinJSBridge', { invoke: mocks.invoke })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PaymentView WeChat cross-device flow', () => {
  it('replaces the handoff pay button with a persistent result after WeChat succeeds', async () => {
    auth.token = ''
    auth.isAuthed = false
    route.query = { ...handoff }
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mobile MicroMessenger')
    wrapper = mount(PaymentView)
    await flushPromises()
    mocks.invoke.mock.lastCall![2]({ err_msg: 'get_brand_wcpay_request:ok' })
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('微信已返回支付成功')
    expect(wrapper.text()).toContain('平台到账状态以电脑端订单为准')
    expect(wrapper.text()).not.toContain('发起微信支付')
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('retains a retry button after cancellation instead of reporting success', async () => {
    auth.token = ''
    auth.isAuthed = false
    route.query = { ...handoff }
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mobile MicroMessenger')
    wrapper = mount(PaymentView)
    await flushPromises()
    mocks.invoke.mock.lastCall![2]({ err_msg: 'get_brand_wcpay_request:cancel' })
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('你已取消微信支付')
    await wrapper.get('.payment-launch-panel__button').trigger('click')
    expect(mocks.invoke).toHaveBeenCalledTimes(2)
  })

  it('shows confirmed payment immediately when loading an already paid order', async () => {
    route.query = { ...handoff, payment_handoff: '0', client_platform: 'pc' }
    mocks.get.mockResolvedValue({ ...payment, status: 'paid' })
    wrapper = mount(PaymentView)
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('平台已确认收款')
    expect(wrapper.find('.qr-code').exists()).toBe(false)
  })

  it('counts down 3 seconds on the paid page and goes back automatically', async () => {
    vi.useFakeTimers()
    try {
      route.query = { ...handoff, payment_handoff: '0', client_platform: 'pc' }
      mocks.get.mockResolvedValue({ ...payment, status: 'paid' })
      wrapper = mount(PaymentView)
      // 假定时器下不能用 flushPromises（它靠真实 setTimeout 兑现），用推进 0ms 代替。
      await vi.advanceTimersByTimeAsync(0)
      expect(wrapper.text()).toContain('平台已确认收款')
      expect(wrapper.text()).toContain('3 秒后自动返回…')
      // 原来这里是个「返回工作台」按钮，现在只靠倒计时，按钮不该再出现。
      expect(wrapper.find('.payment-result .top-back').exists()).toBe(false)

      await vi.advanceTimersByTimeAsync(3000)
      // 自动返回 = 顶部「返回」按钮同一个动作，不再跳到工作台。
      expect(mocks.back).toHaveBeenCalledTimes(1)
      expect(mocks.push).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('never reopens WeChat for an already paid developer deposit on mobile', async () => {
    route.query = { ...handoff, payment_handoff: '0' }
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mobile MicroMessenger')
    mocks.authorized.mockResolvedValue({ authorized: true })
    mocks.get.mockResolvedValue({ ...payment, status: 'paid' })
    wrapper = mount(PaymentView)
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('平台已确认收款')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('refreshes on focus, handles temporary errors and recovers to confirmed payment', async () => {
    route.query = { ...handoff, payment_handoff: '0', client_platform: 'pc' }
    wrapper = mount(PaymentView)
    await flushPromises()
    mocks.get.mockRejectedValueOnce(new Error('Temporary query failure'))
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.text()).toContain('Temporary query failure')
    mocks.get.mockResolvedValue({ ...payment, status: 'paid' })
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('平台已确认收款')
    expect(wrapper.text()).not.toContain('Temporary query failure')
  })

  it('creates the desktop owner order once before generating the handoff QR', async () => {
    wrapper = mount(PaymentView)
    await flushPromises()
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith('desktop-session', 1, 'wechat', 'pc')
    expect(mocks.authorize).not.toHaveBeenCalled()
    const qrUrl = new URL(mocks.qr.mock.lastCall![0])
    const query = Object.fromEntries(qrUrl.searchParams)
    expect(isWechatPaymentHandoff(query)).toBe(true)
    expect(query.payment_id).toBe('deposit-test')
    expect(qrUrl.toString()).not.toContain('desktop-session')
    expect(wrapper.text()).toContain('deposit-test')
  })

  it.each(['', 'different-mobile-session'])('invokes WeChat without login or order APIs: %s', async (token) => {
    auth.token = token
    auth.isAuthed = Boolean(token)
    route.query = { ...handoff }
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mobile MicroMessenger')
    wrapper = mount(PaymentView)
    await flushPromises()
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('getBrandWCPayRequest', paymentInfo, expect.any(Function))
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.createRequirement).not.toHaveBeenCalled()
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.getRequirement).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
    expect(mocks.authorized).not.toHaveBeenCalled()
  })

  it('does not generate an intent QR or retry indefinitely after creation fails', async () => {
    mocks.create.mockRejectedValue(new Error('Payment provider unavailable'))
    wrapper = mount(PaymentView)
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.qr).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Payment provider unavailable')
    await wrapper.get('.payment-launch-panel__button').trigger('click')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })
})
