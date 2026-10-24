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
  initiate: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
  messageWarning: vi.fn(),
}))

const auth = reactive({ token: 'buyer-token', hydrate: vi.fn() })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/api/resourceTags', () => ({ getResourceDetailSlug: () => 'resource--1' }))
vi.mock('@/api/resourcePurchase', () => ({
  listMyResourcePurchasesPage: mocks.listPage,
  countMyResourcePurchases: mocks.count,
}))
vi.mock('@/api/resourcePurchaseTransfers', () => ({
  initiatePurchaseTransfer: mocks.initiate,
}))
vi.mock('ui_73info', () => ({
  Refresh: { template: '<span />' },
  RefreshLeft: { template: '<span />' },
  Search: { template: '<span />' },
  TIcon: { template: '<span><slot /></span>' },
  TButton: {
    emits: ['click'],
    template: '<button @click="$emit(\'click\')"><slot /></button>',
  },
  TDialog: { props: ['open'], template: '<div v-if="open"><slot /></div>' },
  // TInput 要把 v-model 打通，转移弹窗的用户名 / 留言才落得进组件状态。
  TInput: {
    props: ['modelValue', 'maxlength'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" :maxlength="maxlength" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  TSelect: { template: '<div><slot /></div>' },
  TOption: { template: '<span />' },
  TPagination: { template: '<div />' },
  TMessage: {
    success: mocks.messageSuccess,
    error: mocks.messageError,
    warning: mocks.messageWarning,
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

describe('我的已购资源：发起使用权转移', () => {
  it('只有接口资源的已支付订单出现「转移使用权」', async () => {
    mocks.listPage.mockResolvedValue({
      items: [
        makeOrder({ order_no: 'RPO-API', source_kind: 'api', buyer_account: 'u_9f2c' }),
        makeOrder({ order_no: 'RPO-NORMAL', source_kind: 'normal' }),
        // 接口资源但未支付：不该出现入口
        makeOrder({ order_no: 'RPO-PENDING', source_kind: 'api', status: 'pending' }),
      ],
      total: 3,
    })
    wrapper = mount(MyResourcePurchasesView)
    await flushPromises()
    await flushPromises()

    const transferButtons = wrapper
      .findAll('button')
      .filter((button) => button.text() === '转移使用权')
    expect(transferButtons).toHaveLength(1)
  })

  it('接收方用户名为空时不发请求并提示', async () => {
    wrapper = mount(MyResourcePurchasesView)
    await flushPromises()
    await flushPromises()

    const openButton = wrapper.findAll('button').find((button) => button.text() === '转移使用权')
    expect(openButton).toBeTruthy()
    await openButton!.trigger('click')

    const submitButton = wrapper.findAll('button').find((button) => button.text() === '发送申请')
    expect(submitButton).toBeTruthy()
    await submitButton!.trigger('click')
    await flushPromises()

    expect(mocks.initiate).not.toHaveBeenCalled()
    expect(mocks.messageWarning).toHaveBeenCalledWith('请填写接收方用户名')
  })

  it('提交成功后关闭弹窗、提示并跳到转移处理页', async () => {
    mocks.initiate.mockResolvedValue({ transfer_id: 7, status: 'pending' })
    wrapper = mount(MyResourcePurchasesView)
    await flushPromises()
    await flushPromises()

    const openButton = wrapper.findAll('button').find((button) => button.text() === '转移使用权')
    await openButton!.trigger('click')

    const inputs = wrapper.findAll('.purchases-transfer input')
    // 弹窗里两个输入框：接收方用户名、留言
    await inputs[0]!.setValue(' support_dev ')
    await inputs[1]!.setValue('  请帮我接收  ')
    const submitButton = wrapper.findAll('button').find((button) => button.text() === '发送申请')
    await submitButton!.trigger('click')
    await flushPromises()

    expect(mocks.initiate).toHaveBeenCalledWith('buyer-token', 'RPO-API', {
      to_username: 'support_dev',
      message: '请帮我接收',
    })
    expect(mocks.messageSuccess).toHaveBeenCalledWith('转移申请已发送，等待对方确认')
    expect(mocks.push).toHaveBeenCalledWith({ name: 'workbench-purchase-transfers' })
  })

  it('后端拒绝（冷却中 / 已有待处理）时透出后端文案', async () => {
    mocks.initiate.mockRejectedValue(new Error('该订单在冷却期内，剩余 5 天才能再次转移'))
    wrapper = mount(MyResourcePurchasesView)
    await flushPromises()
    await flushPromises()

    const openButton = wrapper.findAll('button').find((button) => button.text() === '转移使用权')
    await openButton!.trigger('click')

    const inputs = wrapper.findAll('.purchases-transfer input')
    await inputs[0]!.setValue('support_dev')
    const submitButton = wrapper.findAll('button').find((button) => button.text() === '发送申请')
    await submitButton!.trigger('click')
    await flushPromises()

    expect(mocks.messageError).toHaveBeenCalledWith('该订单在冷却期内，剩余 5 天才能再次转移')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('留言框带 200 字上限，与后端一致', async () => {
    wrapper = mount(MyResourcePurchasesView)
    await flushPromises()
    await flushPromises()

    const openButton = wrapper.findAll('button').find((button) => button.text() === '转移使用权')
    await openButton!.trigger('click')

    const inputs = wrapper.findAll('.purchases-transfer input')
    expect(inputs[1]?.attributes('maxlength')).toBe('200')
  })
})
