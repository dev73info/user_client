import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import PaymentView from '@/views/PaymentView.vue'

/**
 * 支付页中间页（资源购买 `resource_wechat=1` / 打赏 `tip_wechat=1`）与支付宝扫码的用例。
 *
 * 这两条中间页原来在视图里是两份各 ~120 行的同构代码，拆成一套引擎后必须证明：
 * 接口实参没串味（资源只打资源接口、打赏只打打赏接口）、建单后真的调起 JSAPI、
 * 已支付的单不再重复调起。断的都是「点一下 → 接口实参」这个层级，不是渲染快照。
 */

const mocks = vi.hoisted(() => ({
  resourceStatus: vi.fn(),
  resourceAuthUrl: vi.fn(),
  resourceJsapi: vi.fn(),
  tipStatus: vi.fn(),
  tipAuthUrl: vi.fn(),
  tipJsapi: vi.fn(),
  alipayHtml: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  invoke: vi.fn(),
  qr: vi.fn(),
}))

const route = reactive({ query: {} as Record<string, string> })
const auth = reactive({ token: '', isAuthed: false, hydrate: vi.fn(), fetchProfile: vi.fn() })

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

vi.mock('@/api/adapay', () => ({
  createAdapayDeveloperDepositPayment: vi.fn(),
  getAdapayDeveloperDepositPayment: vi.fn(),
  createAdapayPayment: vi.fn(),
  getAdapayPayment: vi.fn(),
  getAdapayClientPlatform: () => 'pc',
}))

vi.mock('@/api/payments', () => ({
  confirmPayment: vi.fn(),
  getAlipayPageHtml: mocks.alipayHtml,
  listPaymentOrders: vi.fn(),
}))

vi.mock('@/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth')>()),
  getWechatPaymentAuthorizationStatus: vi.fn(),
  getWechatPaymentAuthorizeUrl: vi.fn(),
}))

vi.mock('@/api/resourcePurchase', () => ({
  getResourceWechatStatus: mocks.resourceStatus,
  getResourceWechatAuthUrl: mocks.resourceAuthUrl,
  completeResourceWechatJsapi: mocks.resourceJsapi,
}))

vi.mock('@/api/tips', () => ({
  getTipWechatStatus: mocks.tipStatus,
  getTipWechatAuthUrl: mocks.tipAuthUrl,
  completeTipWechatJsapi: mocks.tipJsapi,
}))

const paymentInfo = {
  appId: 'wx-tip',
  timeStamp: '1700000000',
  nonceStr: 'nonce-tip',
  package: 'prepay_id=tip',
  signType: 'RSA',
  paySign: 'sign-tip',
}

const resourceOrder = {
  order_no: 'RS-1',
  amount_fen: 1234,
  resource_id: 77,
  resource_title: '接口资源',
  buyer: 'buyer-a',
  seller: 'seller-a',
  platform_fee_fen: 0,
  seller_net_fen: 1234,
  status: 'pending',
  created_at: '2026-10-22 06:00:00',
}

const tipOrder = {
  order_no: 'TP-1',
  tipper: 'buyer-b',
  developer: 'dev-b',
  pay_method: 'wechat',
  amount_fen: 500,
  amount_points: 0,
  platform_fee_fen: 0,
  developer_net_fen: 500,
  platform_fee_points: 0,
  developer_net_points: 0,
  platform_fee_bps: 0,
  message: '谢谢',
  status: 'pending',
  created_at: '2026-10-22 06:00:00',
}

let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.resetAllMocks()
  auth.token = ''
  auth.isAuthed = false
  mocks.qr.mockResolvedValue('data:image/png;base64,qr')
  mocks.resourceStatus.mockResolvedValue({ order: resourceOrder, authorized: true })
  mocks.resourceJsapi.mockResolvedValue({
    order: resourceOrder,
    pay_info: JSON.stringify(paymentInfo),
  })
  mocks.tipStatus.mockResolvedValue({ order: tipOrder, authorized: true })
  mocks.tipJsapi.mockResolvedValue({ order: tipOrder, pay_info: JSON.stringify(paymentInfo) })
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mobile MicroMessenger')
  vi.stubGlobal('WeixinJSBridge', { invoke: mocks.invoke })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PaymentView 资源购买中间页', () => {
  it('微信内用 order token 查单、建单并自动调起 JSAPI，不碰打赏接口', async () => {
    route.query = { resource_wechat: '1', order_no: 'RS-1', token: 'tk-resource' }
    wrapper = mount(PaymentView)
    await flushPromises()

    expect(mocks.resourceStatus).toHaveBeenCalledWith('RS-1', 'tk-resource')
    expect(mocks.resourceJsapi).toHaveBeenCalledExactlyOnceWith('RS-1', 'tk-resource')
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(
      'getBrandWCPayRequest',
      paymentInfo,
      expect.any(Function),
    )
    expect(mocks.tipStatus).not.toHaveBeenCalled()
    expect(mocks.tipJsapi).not.toHaveBeenCalled()
    // 中间页的「资源号 / 金额」来自回填订单，不是 query（query 里没有金额）
    expect(wrapper.text()).toContain('资源号')
    expect(wrapper.text()).toContain('77')
    expect(wrapper.text()).toContain('¥12.34')
  })

  it('回填订单已是 paid 时直接进支付结果区，不再建单也不再调起支付', async () => {
    route.query = { resource_wechat: '1', order_no: 'RS-2', token: 'tk-paid' }
    mocks.resourceStatus.mockResolvedValue({
      order: { ...resourceOrder, order_no: 'RS-2', status: 'paid' },
      authorized: true,
    })
    wrapper = mount(PaymentView)
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain('平台已确认收款')
    expect(mocks.resourceJsapi).not.toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})

describe('PaymentView 打赏中间页', () => {
  it('走打赏接口建单并调起 JSAPI，不碰资源接口', async () => {
    route.query = { tip_wechat: '1', order_no: 'TP-1', token: 'tk-tip' }
    wrapper = mount(PaymentView)
    await flushPromises()

    expect(mocks.tipStatus).toHaveBeenCalledWith('TP-1', 'tk-tip')
    expect(mocks.tipJsapi).toHaveBeenCalledExactlyOnceWith('TP-1', 'tk-tip')
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(
      'getBrandWCPayRequest',
      paymentInfo,
      expect.any(Function),
    )
    expect(mocks.resourceStatus).not.toHaveBeenCalled()
    expect(mocks.resourceJsapi).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('打赏给')
    expect(wrapper.text()).toContain('dev-b')
  })

  it('不在微信内时给扫码提示，宁可不出按钮也不重复建单', async () => {
    route.query = { tip_wechat: '1', order_no: 'TP-2', token: 'tk-tip2' }
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Desktop Chrome')
    wrapper = mount(PaymentView)
    await flushPromises()

    expect(wrapper.text()).toContain('请用手机微信扫码打开本页后再完成支付。')
    expect(mocks.tipJsapi).not.toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})

describe('PaymentView 支付宝扫码与支付信息栏', () => {
  it('内嵌支付宝收银台并展示需求号 / 金额 / 优惠券 / 剩余时间', async () => {
    route.query = {
      payment_id: 'P-9',
      channel: 'alipay',
      client_platform: 'pc',
      requirement_id: 'RQ-9',
      amount_cny: '12.34',
      coupon_code: 'C10',
      expires_at: '2099-01-01 00:00:00',
    }
    auth.token = 'pc-session'
    auth.isAuthed = true
    mocks.alipayHtml.mockResolvedValue('<html><body>alipay</body></html>')
    wrapper = mount(PaymentView)
    await flushPromises()

    expect(mocks.alipayHtml).toHaveBeenCalledWith('pc-session', 'P-9')
    const frame = wrapper.get('.alipay-frame')
    expect(frame.attributes('srcdoc')).toContain('alipay')

    const text = wrapper.text()
    expect(text).toContain('RQ-9')
    expect(text).toContain('¥12.34')
    expect(text).toContain('C10')
    expect(text).toContain('支付截止：2099-01-01 00:00:00')
    // 剩余时间按 hh:mm:ss 展示，未过期就不该标「已过期」
    expect(text).not.toContain('已过期')
    expect(wrapper.find('.meta-list strong.expired').exists()).toBe(false)
    expect(wrapper.get('.meta-list').text()).toMatch(/\d+:\d{2}:\d{2}/)
  })
})
