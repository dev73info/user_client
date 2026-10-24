import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import PaymentView from '@/views/PaymentView.vue'
import { isWechatPaymentHandoff } from '@/utils/wechatPayment'

const mocks = vi.hoisted(() => ({
  createRequirement: vi.fn(),
  getRequirement: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  qr: vi.fn(),
  invoke: vi.fn(),
}))
const route = reactive({ query: {} as Record<string, string> })
const auth = reactive({ token: '', isAuthed: false, hydrate: vi.fn() })
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  }
})
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({
    replace: mocks.replace,
    back: mocks.back,
    push: mocks.push,
    resolve: ({ query }: { query: Record<string, string> }) => ({
      href: `/payment?${new URLSearchParams(
        Object.entries(query).filter(([, value]) => value !== undefined),
      )}`,
    }),
  }),
}))
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.qr } }))
/**
 * 「旧一步下单」（`/payments/alipay|wechat/create|confirm`）与「预付保证金」
 * （`/adapay/developer-deposits`）都已不在契约里，支付页只剩一条下单接口与一条查单接口。
 */
vi.mock('@/api/adapay', () => ({
  createAdapayPayment: mocks.createRequirement,
  getAdapayPayment: mocks.getRequirement,
  getAdapayClientPlatform: () => 'desktop',
}))
vi.mock('@/api/payments', () => ({
  getPaymentOrder: vi.fn(),
  listPaymentOrders: vi.fn(),
}))

const paymentInfo = {
  appId: 'wx-test',
  timeStamp: '1234567890',
  nonceStr: 'nonce-test',
  package: 'prepay_id=test',
  signType: 'RSA',
  paySign: 'test-signature',
}

/** 定金下单回执（契约 `DepositPaymentResponse`）。 */
const deposit = {
  payment_id: 'deposit-test',
  requirement_id: '2026-900000000301',
  milestone: 'deposit',
  pay_channel: 'wechat',
  pay_mode: 'escrow',
  amount_cny: '1.00',
  amount_fen: 100,
  status: 'created',
  pay_url: JSON.stringify(paymentInfo),
}

/** 查单回执（契约 `PaymentOrderResponse`）。 */
function paymentOrder(patch: Record<string, unknown> = {}) {
  return {
    order_no: 'deposit-test',
    biz_type: 'requirement_deposit',
    biz_no: '2026-900000000301',
    payer: 'client_view',
    amount: 1,
    amount_fen: 100,
    channel: 'wechat',
    status: 'created',
    status_label: '待发起',
    subject: '需求定金',
    created_time: '2026-10-25 10:00:00',
    client_action: JSON.stringify(paymentInfo),
    ...patch,
  }
}

const handoff = {
  adapay: '1',
  payment_handoff: '1',
  payment_id: deposit.payment_id,
  requirement_id: deposit.requirement_id,
  channel: 'wechat',
  client_platform: 'mobile',
  amount_cny: '1.00',
  qr_content: deposit.pay_url,
}

/** 意图模式：手机端点了「支付」但订单还没建，页面自己下单。 */
const intentQuery = {
  adapay: '1',
  intent: '1',
  requirement_id: deposit.requirement_id,
  milestone: 'deposit',
  channel: 'wechat',
  client_platform: 'pc',
  amount_cny: '1.00',
}

let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.resetAllMocks()
  auth.token = 'desktop-session'
  auth.isAuthed = true
  route.query = { ...intentQuery }
  mocks.createRequirement.mockResolvedValue(deposit)
  mocks.getRequirement.mockResolvedValue(paymentOrder())
  mocks.replace.mockImplementation(async ({ query }) => {
    route.query = query
  })
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
    expect(mocks.getRequirement).not.toHaveBeenCalled()
    expect(mocks.createRequirement).not.toHaveBeenCalled()
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
    mocks.getRequirement.mockResolvedValue(paymentOrder({ status: 'paid' }))
    wrapper = mount(PaymentView)
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('平台已确认收款')
    expect(wrapper.find('.qr-code').exists()).toBe(false)
  })

  it('counts down 3 seconds on the paid page and goes back automatically', async () => {
    vi.useFakeTimers()
    try {
      route.query = { ...handoff, payment_handoff: '0', client_platform: 'pc' }
      mocks.getRequirement.mockResolvedValue(paymentOrder({ status: 'paid' }))
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

  it('never reopens WeChat for an already paid deposit on mobile', async () => {
    route.query = { ...handoff, payment_handoff: '0' }
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mobile MicroMessenger')
    mocks.getRequirement.mockResolvedValue(paymentOrder({ status: 'paid' }))
    wrapper = mount(PaymentView)
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('平台已确认收款')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('refreshes on focus, handles temporary errors and recovers to confirmed payment', async () => {
    route.query = { ...handoff, payment_handoff: '0', client_platform: 'pc' }
    wrapper = mount(PaymentView)
    await flushPromises()
    mocks.getRequirement.mockRejectedValueOnce(new Error('Temporary query failure'))
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.text()).toContain('Temporary query failure')
    mocks.getRequirement.mockResolvedValue(paymentOrder({ status: 'paid' }))
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('平台已确认收款')
    expect(wrapper.text()).not.toContain('Temporary query failure')
  })

  it('creates the desktop owner order once before generating the handoff QR', async () => {
    wrapper = mount(PaymentView)
    await flushPromises()
    await flushPromises()
    // 请求体只发 pay_channel / client_platform，契约里的客户端形态是 `desktop`（不是 `pc`）
    expect(mocks.createRequirement).toHaveBeenCalledExactlyOnceWith(
      'desktop-session',
      deposit.requirement_id,
      'deposit',
      'wechat',
      'desktop',
    )
    const qrUrl = new URL(mocks.qr.mock.lastCall![0])
    const query = Object.fromEntries(qrUrl.searchParams)
    expect(isWechatPaymentHandoff(query)).toBe(true)
    expect(query.payment_id).toBe(deposit.payment_id)
    expect(qrUrl.toString()).not.toContain('desktop-session')
    expect(wrapper.text()).toContain(deposit.payment_id)
  })

  it.each(['', 'different-mobile-session'])(
    'invokes WeChat without login or order APIs: %s',
    async (token) => {
      auth.token = token
      auth.isAuthed = Boolean(token)
      route.query = { ...handoff }
      vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mobile MicroMessenger')
      wrapper = mount(PaymentView)
      await flushPromises()
      expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(
        'getBrandWCPayRequest',
        paymentInfo,
        expect.any(Function),
      )
      expect(mocks.createRequirement).not.toHaveBeenCalled()
      expect(mocks.getRequirement).not.toHaveBeenCalled()
    },
  )

  it('does not generate an intent QR or retry indefinitely after creation fails', async () => {
    mocks.createRequirement.mockRejectedValue(new Error('Payment provider unavailable'))
    wrapper = mount(PaymentView)
    await flushPromises()
    expect(mocks.createRequirement).toHaveBeenCalledTimes(1)
    expect(mocks.qr).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Payment provider unavailable')
    await wrapper.get('.payment-launch-panel__button').trigger('click')
    await flushPromises()
    expect(mocks.createRequirement).toHaveBeenCalledTimes(2)
  })
})
