import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'

import { useDevSoldResourcePurchases } from '@/composables/useDevSoldResourcePurchases'
import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'

const mocks = vi.hoisted(() => ({
  listSeller: vi.fn(),
  messageError: vi.fn(),
}))

const route = reactive<{ query: Record<string, string> }>({ query: {} })
const auth = reactive({ token: 'seller-token', hydrate: vi.fn() })

vi.mock('vue-router', () => ({ useRoute: () => route }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/api/resourcePurchase', () => ({ listSellerResourcePurchases: mocks.listSeller }))
vi.mock('ui_73info', () => ({ TMessage: { error: mocks.messageError } }))

function makeOrder(
  orderNo: string,
  resourceId: number,
  resourceTitle: string,
): ResourcePurchaseOrder {
  return {
    order_no: orderNo,
    buyer: 'buyer',
    resource_id: resourceId,
    resource_title: resourceTitle,
    seller: 'seller',
    amount_fen: 1000,
    platform_fee_fen: 100,
    seller_net_fen: 900,
    platform_fee_bps: 1000,
    amount_points: 0,
    platform_fee_points: 0,
    seller_net_points: 0,
    status: 'paid',
    pay_channel: 'alipay',
    provider_payment_id: null,
    provider_confirm_id: null,
    pay_url: null,
    split_status: 'none',
    first_downloaded_at: null,
    paid_at: '2026-11-20 10:00:00',
    refunded_at: null,
    created_at: '2026-11-20 09:55:00',
    updated_at: '2026-11-20 10:00:00',
    refunded_amount_fen: 0,
    refundable_amount_fen: 1000,
    within_refund_window: true,
    entitlement_revoked: false,
    refund_reason: null,
    refund_initiator: null,
    refund_operator: null,
    last_refund_at: null,
    source_kind: 'platform',
    client_id: null,
    buyer_external_id: null,
    buyer_origin: null,
    api_callback_status: 'none',
    api_callback_attempts: 0,
    api_callback_at: null,
  } as ResourcePurchaseOrder
}

const Harness = defineComponent({
  setup() {
    return { ...useDevSoldResourcePurchases() }
  },
  template: `
    <div>
      <span class="count">{{ scopedOrders.length }}</span>
      <span class="resource">{{ filters.resourceId }}</span>
      <span class="empty">{{ emptyText }}</span>
      <span class="options">{{ resourceOptions.map((item) => item.label).join('|') }}</span>
      <button class="pick-second" @click="filters.resourceId = '2'">pick</button>
    </div>
  `,
})

function render() {
  return mount(Harness)
}

describe('售出订单：资源入口与筛选', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.query = {}
    mocks.listSeller.mockResolvedValue([
      makeOrder('RPO-1', 1, '订单同步插件'),
      makeOrder('RPO-2', 2, '短信发送接口'),
    ])
  })

  it('没有 resourceId 时展示全部售出订单，不再跳回资源列表', async () => {
    const wrapper = render()
    await flushPromises()

    expect(mocks.listSeller).toHaveBeenCalledWith('seller-token', { limit: 100 })
    expect(wrapper.get('.count').text()).toBe('2')
    expect(wrapper.get('.resource').text()).toBe('')
    expect(wrapper.get('.options').text()).toBe('订单同步插件|短信发送接口')

    wrapper.unmount()
  })

  it('路由带 resourceId 时预选该资源', async () => {
    route.query = { resourceId: '2' }
    const wrapper = render()
    await flushPromises()

    expect(wrapper.get('.resource').text()).toBe('2')
    expect(wrapper.get('.count').text()).toBe('1')

    wrapper.unmount()
  })

  it('resourceId 不存在时回落全部资源', async () => {
    route.query = { resourceId: '999' }
    const wrapper = render()
    await flushPromises()

    expect(wrapper.get('.resource').text()).toBe('')
    expect(wrapper.get('.count').text()).toBe('2')

    wrapper.unmount()
  })

  it('手动选择资源后只保留该资源的订单', async () => {
    const wrapper = render()
    await flushPromises()

    await wrapper.get('.pick-second').trigger('click')

    expect(wrapper.get('.resource').text()).toBe('2')
    expect(wrapper.get('.count').text()).toBe('1')

    wrapper.unmount()
  })

  it('卖家没有售出订单时给出明确空态', async () => {
    mocks.listSeller.mockResolvedValue([])
    const wrapper = render()
    await flushPromises()

    expect(wrapper.get('.empty').text()).toBe('还没有售出订单')

    wrapper.unmount()
  })
})
