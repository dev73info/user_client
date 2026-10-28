import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PaymentView from '@/views/PaymentView.vue'

const mocks = vi.hoisted(() => ({
  getOrder: vi.fn(),
  refreshOrder: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  qr: vi.fn(),
}))
const route = reactive({ query: {} as Record<string, string> })
const auth = reactive({ token: 'desktop-session', isAuthed: true, hydrate: vi.fn() })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ back: mocks.back, replace: mocks.replace, push: mocks.push }),
}))
vi.mock('@/api/adapay', () => ({
  getAdapayPayment: mocks.getOrder,
  getAdapayClientPlatform: () => 'desktop',
}))
vi.mock('@/api/payments', () => ({
  getPaymentOrder: mocks.getOrder,
  listPaymentOrders: vi.fn(),
  refreshPaymentOrder: mocks.refreshOrder,
}))
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.qr } }))
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

const baseQuery = {
  adapay: '1',
  payment_handoff: '0',
  payment_id: 'PAY-TEST-1',
  requirement_id: 'REQ-TEST-1',
  channel: 'alipay',
  client_platform: 'desktop',
  amount_cny: '0.20',
  qr_content: 'https://qr.alipay.com/test',
}

function paymentOrder(patch: Record<string, unknown> = {}) {
  return {
    order_no: 'PAY-TEST-1',
    biz_type: 'requirement_deposit',
    biz_no: 'REQ-TEST-1',
    payer: 'client_flow_test',
    amount_fen: 20,
    channel: 'alipay',
    status: 'pending',
    status_label: '待支付',
    subject: '需求定金',
    created_time: '2026-10-28 00:00:00',
    client_action: 'https://qr.alipay.com/test',
    ...patch,
  }
}

let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.resetAllMocks()
  route.query = { ...baseQuery }
  auth.token = 'desktop-session'
  auth.isAuthed = true
  mocks.getOrder.mockResolvedValue(paymentOrder())
  mocks.refreshOrder.mockResolvedValue(paymentOrder())
  mocks.qr.mockResolvedValue('data:image/png;base64,test')
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Desktop Chrome')
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function queryButton(target: VueWrapper) {
  const button = target.findAll('button').find((item) => item.text().includes('查询支付结果'))
  if (!button) throw new Error('找不到查询支付结果按钮')
  return button
}

describe('支付结果主动刷新', () => {
  it('点击查询真正请求渠道刷新，未成功时显示原因而不是成功', async () => {
    mocks.refreshOrder.mockRejectedValue(new Error('渠道侧这笔单的状态是 Pending，尚未支付成功'))
    wrapper = mount(PaymentView)
    await flushPromises()
    expect(mocks.refreshOrder).not.toHaveBeenCalled()

    await queryButton(wrapper).trigger('click')
    await flushPromises()

    expect(mocks.refreshOrder).toHaveBeenCalledExactlyOnceWith('desktop-session', 'PAY-TEST-1')
    expect(wrapper.text()).toContain('尚未支付成功')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('查询返回已支付后才显示平台确认收款', async () => {
    mocks.refreshOrder.mockResolvedValue(paymentOrder({ status: 'paid' }))
    wrapper = mount(PaymentView)
    await flushPromises()
    await queryButton(wrapper).trigger('click')
    await flushPromises()

    expect(mocks.refreshOrder).toHaveBeenCalledExactlyOnceWith('desktop-session', 'PAY-TEST-1')
    expect(wrapper.get('[role="status"]').text()).toContain('平台已确认收款')
  })

  it('8 秒轮询返回已支付后自动切换结果页', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    mocks.refreshOrder.mockResolvedValue(paymentOrder({ status: 'paid' }))
    wrapper = mount(PaymentView)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.refreshOrder).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(8000)

    expect(mocks.refreshOrder).toHaveBeenCalledExactlyOnceWith('desktop-session', 'PAY-TEST-1')
    expect(wrapper.get('[role="status"]').text()).toContain('平台已确认收款')
  })
})

describe('支付动作取值', () => {
  /** 后端 `client_action` 是对象（`redirect_url` / `qr_code` / `sdk_payload`），不是字符串。 */
  const objectAction = {
    qr_code: null,
    redirect_url: 'https://qr.alipay.com/object-action',
    sdk_payload: { pay_info: 'https://qr.alipay.com/object-action' },
  }

  it('订单里 client_action 是对象时也能渲染二维码', async () => {
    mocks.getOrder.mockResolvedValue(paymentOrder({ client_action: objectAction }))
    mocks.refreshOrder.mockResolvedValue(paymentOrder({ client_action: objectAction }))
    route.query = { ...baseQuery, qr_content: '' }
    wrapper = mount(PaymentView)
    await flushPromises()

    expect(mocks.qr).toHaveBeenCalledWith('https://qr.alipay.com/object-action', expect.anything())
  })

  it('历史遗留的 JSON 字符串形态同样能解析', async () => {
    mocks.getOrder.mockResolvedValue(
      paymentOrder({ client_action: JSON.stringify(objectAction) }),
    )
    mocks.refreshOrder.mockResolvedValue(
      paymentOrder({ client_action: JSON.stringify(objectAction) }),
    )
    route.query = { ...baseQuery, qr_content: '' }
    wrapper = mount(PaymentView)
    await flushPromises()

    expect(mocks.qr).toHaveBeenCalledWith('https://qr.alipay.com/object-action', expect.anything())
  })
})
