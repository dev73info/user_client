import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import type { PointsProduct, UserPerk } from '@/api/points'
import MallView from '@/views/MallView.vue'
import PerksCenterView from '@/views/PerksCenterView.vue'

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  products: vi.fn(),
  orders: vi.fn(),
  cards: vi.fn(),
  redeem: vi.fn(),
  appearance: vi.fn(),
  perk: vi.fn(),
  confirm: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))
const auth = reactive({ token: 'user-token', username: 'tester', isAuthed: true, hydrate: vi.fn() })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))
vi.mock('@/api/points', () => ({
  getMyPoints: mocks.me,
  listMallProducts: mocks.products,
  listMyRedeemOrders: mocks.orders,
  listMyPromoCards: mocks.cards,
  redeemMallProduct: mocks.redeem,
  setUsernameAppearance: mocks.appearance,
  setPerkEquipped: mocks.perk,
}))
vi.mock('ui_73info', () => ({
  Refresh: { template: '<span />' },
  TIcon: { template: '<span><slot /></span>' },
  TButton: {
    props: ['disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  TEmpty: { template: '<p />' },
  TTable: { template: '<div><slot /></div>' },
  TTableColumn: { template: '<div />' },
  TTag: { template: '<span><slot /></span>' },
  TSwitch: {
    props: ['modelValue'],
    emits: ['change'],
    template: '<button @click="$emit(\'change\', !modelValue)"><slot /></button>',
  },
  TRadio: { template: '<span><slot /></span>' },
  TRadioGroup: { template: '<div><slot /></div>' },
  TSelect: { template: '<div><slot /></div>' },
  TOption: { template: '<span><slot /></span>' },
  TMessage: {
    success: mocks.success,
    error: mocks.error,
    info: mocks.info,
    warning: mocks.warning,
  },
  TMessageBox: { confirm: mocks.confirm },
}))

const product: PointsProduct = {
  id: 1,
  name: '测试静态背景',
  points_cost: 10,
  stock: 1,
  kind: 'permission',
  payload: null,
  enabled: true,
  duration_days: -1,
  perk_code: 'home_background_static',
  created_at: '2026-10-27 12:00:00',
  updated_at: '2026-10-27 12:00:00',
}

function perk(code: string): UserPerk {
  return { perk_code: code, owned: true, equipped: false, expires_at: null, created_at: null }
}

function points(perks: UserPerk[] = []) {
  return {
    username: 'tester',
    points_balance: 100,
    logs: [],
    logs_total: 0,
    logs_page: 1,
    logs_page_size: 10,
    username_gradient_owned: false,
    username_gradient: false,
    perks,
  }
}

let wrapper: VueWrapper | undefined

function button(text: string) {
  const found = wrapper!.findAll('button').find((item) => item.text() === text)
  expect(found).toBeDefined()
  return found!
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.isAuthed = true
  mocks.me.mockResolvedValue(points())
  mocks.products.mockResolvedValue([product])
  mocks.orders.mockResolvedValue([])
  mocks.cards.mockResolvedValue([])
  mocks.redeem.mockResolvedValue({
    id: 1,
    username: 'tester',
    product_id: 1,
    product_name: product.name,
    product_kind: 'permission',
    points_cost: 10,
    status: 'fulfilled',
    handle_note: null,
    handled_by: null,
    handled_at: null,
    created_at: '2026-10-27 12:00:00',
    perk_code: 'home_background_static',
  })
  mocks.appearance.mockResolvedValue({
    username: 'tester',
    username_gradient_owned: true,
    username_gradient: true,
    appearance: 'gradient',
    color: null,
  })
  mocks.perk.mockImplementation((_token, code, equipped) =>
    Promise.resolve({ perk_code: code, owned: true, equipped, expires_at: null, created_at: null }),
  )
  mocks.confirm.mockResolvedValue(true)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('积分商城与权益', () => {
  it('兑换调用真实商品编号并刷新商城', async () => {
    wrapper = mount(MallView)
    await flushPromises()
    await button('立即兑换').trigger('click')
    await flushPromises()
    expect(mocks.confirm).toHaveBeenCalled()
    expect(mocks.redeem).toHaveBeenCalledWith('user-token', 1)
    expect(mocks.products).toHaveBeenCalledTimes(2)
    expect(mocks.me).toHaveBeenCalledTimes(2)
  })

  it('佩戴权益和保存用户名渐变都调用真实接口', async () => {
    mocks.me.mockResolvedValue(
      points([
        perk('home_background_static'),
        perk('home_background_dynamic'),
        perk('username_gradient'),
        perk('username_color:7c3aed'),
      ]),
    )
    wrapper = mount(PerksCenterView, {
      global: { stubs: { WorkbenchBarSlot: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()
    const switches = wrapper.findAll('button[aria-label="佩戴权益"]')
    expect(switches.length).toBe(2)
    await switches[0]!.trigger('click')
    await flushPromises()
    expect(mocks.perk).toHaveBeenCalledWith('user-token', 'home_background_static', true)
    await button('保存').trigger('click')
    await flushPromises()
    expect(mocks.appearance).toHaveBeenCalledWith('user-token', 'gradient')
  })

  it('权益加载失败显示错误并允许重试', async () => {
    mocks.me.mockRejectedValueOnce(new Error('权益服务暂不可用'))
    wrapper = mount(PerksCenterView, {
      global: { stubs: { WorkbenchBarSlot: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('权益服务暂不可用')
    mocks.me.mockResolvedValue(points([perk('username_gradient')]))
    await button('重新加载').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('用户名颜色设置')
  })
})
