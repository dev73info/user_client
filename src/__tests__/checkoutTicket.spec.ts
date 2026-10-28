import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'

import ApiResourceCheckoutView from '@/views/ApiResourceCheckoutView.vue'
import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(),
  getOrder: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}))

const route = reactive({ query: {} as Record<string, string> })
const auth = reactive({
  token: '',
  isAuthed: false,
  hydrate: vi.fn(),
  applyExternalSession: vi.fn(),
})

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}))

vi.mock('@/api/resourcePurchase', () => ({
  exchangeCheckoutTicket: mocks.exchange,
  getMyResourcePurchase: mocks.getOrder,
}))

vi.mock('@/api/adapay', () => ({
  getAdapayClientPlatform: () => 'pc',
}))

// 支付面（二维码 / 轮询）有自己的单测口径，这里只验证换票与订单展示。
vi.mock('@/composables/useResourcePayment', async () => {
  const { ref } = await import('vue')
  return {
    useResourcePayment: () => ({
      qrDataUrl: ref(''),
      renderQr: vi.fn(),
      startPoll: vi.fn(),
      stopPoll: vi.fn(),
    }),
  }
})

vi.mock('ui_73info', () => ({
  TButton: { template: '<button><slot /></button>' },
  TMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

const ticket = 'a'.repeat(64)

function makeOrder(overrides: Partial<ResourcePurchaseOrder> = {}): ResourcePurchaseOrder {
  return {
    order_no: 'RPO20261019153000001',
    buyer: 'shop_owner',
    client_id: 'u_9f2c',
    buyer_external_id: 'shop-user-10086',
    source_kind: 'oauth',
    resource_id: 12,
    resource_title: '短信发送接口',
    seller: 'shop_owner',
    amount_fen: 990,
    platform_fee_fen: 99,
    seller_net_fen: 891,
    platform_fee_bps: 1000,
    amount_points: 0,
    platform_fee_points: 0,
    seller_net_points: 0,
    status: 'pending',
    pay_channel: 'alipay',
    provider_payment_id: null,
    provider_confirm_id: null,
    pay_url: 'https://pay.example.com/qr',
    split_status: 'none',
    api_callback_attempts: 0,
    api_callback_status: 'none',
    first_downloaded_at: null,
    paid_at: null,
    refunded_at: null,
    created_at: '2026-10-19 15:30:00',
    updated_at: '2026-10-19 15:30:00',
    refunded_amount_fen: 0,
    refundable_amount_fen: 990,
    within_refund_window: true,
    entitlement_revoked: false,
    refund_reason: null,
    refund_initiator: null,
    refund_operator: null,
    last_refund_at: null,
    ...overrides,
  }
}

let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.clearAllMocks()
  route.query = {}
  auth.token = ''
  auth.isAuthed = false
  auth.applyExternalSession.mockResolvedValue(undefined)
  mocks.replace.mockResolvedValue(undefined)
  mocks.push.mockResolvedValue(undefined)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

async function mountCheckout() {
  wrapper = mount(ApiResourceCheckoutView)
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('接口资源收银台票据登录', () => {
  it('有票据时换票、落会话、地址栏去掉 ticket，并展示订单摘要', async () => {
    route.query = { ticket, order_no: 'RPO20261019153000001' }
    mocks.exchange.mockResolvedValue({
      token: 'checkout-jwt',
      username: 'u_9f2c',
      order_no: 'RPO20261019153000001',
    })
    mocks.getOrder.mockResolvedValue(makeOrder())
    auth.token = 'checkout-jwt'

    const view = await mountCheckout()

    expect(mocks.exchange).toHaveBeenCalledWith(ticket)
    expect(auth.applyExternalSession).toHaveBeenCalledWith({
      token: 'checkout-jwt',
      username: 'u_9f2c',
    })
    // 票据只能换一次：换完立刻用不带 ticket 的地址替换（刷新 / 返回都不会再换）。
    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'api-resource-checkout',
      query: { order_no: 'RPO20261019153000001' },
    })
    expect(mocks.getOrder).toHaveBeenCalledWith('checkout-jwt', 'RPO20261019153000001')
    expect(view.text()).toContain('短信发送接口')
    expect(view.text()).toContain('RPO20261019153000001')
    expect(view.text()).toContain('¥9.90')
  })

  it('票据已使用或过期时展示后端文案，不拉订单', async () => {
    route.query = { ticket }
    mocks.exchange.mockRejectedValue(new Error('票据已使用或已过期'))

    const view = await mountCheckout()

    expect(mocks.getOrder).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(view.text()).toContain('票据已使用或已过期')
  })

  it('无票据且未登录时只渲染错误态，不发起换票', async () => {
    route.query = {}

    const view = await mountCheckout()

    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.getOrder).not.toHaveBeenCalled()
    expect(view.text()).toContain('登录状态已失效')
  })

  it('已支付订单直接展示支付成功、金额、订单号与后续入口', async () => {
    route.query = { ticket, order_no: 'RPO20261019153000001' }
    mocks.exchange.mockResolvedValue({
      token: 'checkout-jwt',
      username: 'u_9f2c',
      order_no: 'RPO20261019153000001',
    })
    mocks.getOrder.mockResolvedValue(makeOrder({ status: 'paid' }))
    auth.token = 'checkout-jwt'

    const view = await mountCheckout()

    expect(view.text()).toContain('支付成功')
    expect(view.text()).toContain('¥9.90')
    // 2.0 没有「微信绑定」相关端点（契约里没有二维码 / 授权地址那一组），收银台只留「我的已购」
    expect(view.text()).not.toContain('绑定微信')
    expect(view.text()).toContain('查看我的已购')
  })
})
