import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'

import MyResourcePurchasesView from '@/views/MyResourcePurchasesView.vue'
import { isApiResourcePurchaseOrder } from '@/shared/resourceSale'
import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'

const mocks = vi.hoisted(() => ({
  listPage: vi.fn(),
  count: vi.fn(),
  push: vi.fn(),
}))

const auth = reactive({ token: 'buyer-token', hydrate: vi.fn() })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/api/resourceTags', () => ({ getResourceDetailSlug: () => 'resource--1' }))
vi.mock('@/api/resourcePurchase', () => ({
  listMyResourcePurchasesPage: mocks.listPage,
  countMyResourcePurchases: mocks.count,
}))
vi.mock('ui_73info', () => ({
  Refresh: { template: '<span />' },
  RefreshLeft: { template: '<span />' },
  Search: { template: '<span />' },
  TIcon: { template: '<span><slot /></span>' },
  TButton: { template: '<button><slot /></button>' },
  TDialog: { props: ['open'], template: '<div v-if="open"><slot /></div>' },
  TInput: { template: '<input />' },
  TSelect: { template: '<div><slot /></div>' },
  TOption: { template: '<span />' },
  TPagination: { template: '<div />' },
  TMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

function makeOrder(overrides: Partial<ResourcePurchaseOrder>): ResourcePurchaseOrder {
  return {
    order_no: 'RPO-1',
    buyer: 'shop_owner',
    resource_id: 1,
    resource_title: '接口资源订单',
    seller: 'shop_owner',
    amount_fen: 990,
    platform_fee_fen: 99,
    seller_net_fen: 891,
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
    paid_at: '2026-10-19 15:32:10',
    refunded_at: null,
    created_at: '2026-10-19 15:30:00',
    updated_at: '2026-10-19 15:32:10',
    refunded_amount_fen: 0,
    refundable_amount_fen: 990,
    within_refund_window: true,
    entitlement_revoked: false,
    refund_reason: null,
    refund_initiator: null,
    refund_operator: null,
    last_refund_at: null,
    promoter: null,
    promo_code: null,
    promo_share_bps: 0,
    promoter_fee_fen: 0,
    promoter_split_status: 'none',
    promo_reject_reason: null,
    ...overrides,
  }
}

let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.clearAllMocks()
  mocks.count.mockResolvedValue(0)
  mocks.listPage.mockResolvedValue({
    items: [
      makeOrder({
        order_no: 'RPO-API',
        resource_title: '短信发送接口',
        source_kind: 'api',
        buyer_account: 'u_9f2c',
        buyer_external_id: 'shop-user-10086',
      }),
      makeOrder({ order_no: 'RPO-NORMAL', resource_title: '设计素材包', source_kind: 'normal' }),
    ],
    total: 2,
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('我的已购资源：接口资源订单标签', () => {
  it('isApiResourcePurchaseOrder 只认 source_kind=api 或已记录平台买家', () => {
    expect(isApiResourcePurchaseOrder({ source_kind: 'api' })).toBe(true)
    expect(isApiResourcePurchaseOrder({ source_kind: ' API ' })).toBe(true)
    expect(isApiResourcePurchaseOrder({ buyer_account: 'u_9f2c' })).toBe(true)
    expect(isApiResourcePurchaseOrder({ source_kind: 'normal', buyer_account: null })).toBe(false)
    expect(isApiResourcePurchaseOrder({})).toBe(false)
  })

  it('只给接口资源订单加「接口资源」标签，普通单不受影响', async () => {
    wrapper = mount(MyResourcePurchasesView)
    await flushPromises()
    await flushPromises()

    expect(mocks.listPage).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('短信发送接口')
    expect(wrapper.text()).toContain('设计素材包')

    const tags = wrapper.findAll('.purchases__tag')
    expect(tags).toHaveLength(1)
    expect(tags[0]?.text()).toBe('接口资源')
  })
})
