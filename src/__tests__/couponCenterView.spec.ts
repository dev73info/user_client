import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import type { CouponItem } from '@/api/coupons'
import CouponCenterView from '@/views/CouponCenterView.vue'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  replace: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  writeText: vi.fn(),
}))
const auth = reactive({ token: 'user-token', isAuthed: true, hydrate: vi.fn() })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/api/coupons', () => ({ listAvailableCoupons: mocks.list }))
vi.mock('ui_73info', () => ({
  Refresh: { template: '<span />' },
  TIcon: { template: '<span><slot /></span>' },
  TButton: {
    props: ['disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
  },
  TMessage: { success: mocks.success, error: mocks.error },
}))

function coupon(overrides: Partial<CouponItem> = {}): CouponItem {
  return {
    code: 'MOCK-COUPON-10',
    name: '新需求立减 10 元',
    discount_type: 'amount',
    amount_off_fen: 1000,
    min_amount_fen: 10000,
    max_discount_fen: null,
    discount_bps: null,
    starts_at: '2026-11-01 00:00:00',
    ends_at: '2026-12-01 23:59:59',
    active: true,
    status: 'pending_use',
    ...overrides,
  } as CouponItem
}

const amountCoupon = coupon()
const usedCoupon = coupon({ code: 'MOCK-COUPON-USED', status: 'used' })
const percentCoupon = coupon({
  code: 'MOCK-COUPON-5P',
  name: '定金支付 95 折',
  discount_type: 'percent',
  amount_off_fen: null,
  min_amount_fen: 50000,
  max_discount_fen: 20000,
  discount_bps: 500,
})

let wrapper: VueWrapper | undefined

async function render(items: CouponItem[] = [amountCoupon, usedCoupon, percentCoupon]) {
  mocks.list.mockResolvedValue(items)
  wrapper = mount(CouponCenterView, {
    global: { stubs: { WorkbenchBarSlot: { template: '<div><slot /></div>' } } },
  })
  await flushPromises()
  return wrapper
}

function stripItem(label: string) {
  const found = wrapper!
    .findAll('.wb-strip__item--filter')
    .find((item) => item.text().startsWith(label))
  expect(found).toBeDefined()
  return found!
}

function rowCodes() {
  return wrapper!.findAll('.wb-item .wb-item__title').map((item) => item.text())
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mocks.writeText.mockResolvedValue(undefined) },
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('优惠券中心', () => {
  it('读数格可点筛选，分组计数保持本组总数', async () => {
    await render()

    expect(wrapper!.findAll('.wb-strip__item--filter')).toHaveLength(4)
    expect(stripItem('全部').text()).toContain('3')
    expect(stripItem('可用优惠券').text()).toContain('2')
    expect(stripItem('满减券').text()).toContain('2')
    expect(stripItem('折扣券').text()).toContain('1')
    expect(rowCodes()).toEqual(['MOCK-COUPON-10', 'MOCK-COUPON-USED', 'MOCK-COUPON-5P'])

    await stripItem('满减券').trigger('click')
    expect(stripItem('满减券').attributes('aria-pressed')).toBe('true')
    expect(rowCodes()).toEqual(['MOCK-COUPON-10', 'MOCK-COUPON-USED'])
    expect(wrapper!.text()).not.toContain('MOCK-COUPON-5P')

    await stripItem('折扣券').trigger('click')
    expect(rowCodes()).toEqual(['MOCK-COUPON-5P'])
    expect(wrapper!.text()).not.toContain('满减优惠券')

    await stripItem('可用优惠券').trigger('click')
    expect(rowCodes()).toEqual(['MOCK-COUPON-10', 'MOCK-COUPON-5P'])
    expect(wrapper!.text()).not.toContain('MOCK-COUPON-USED')
    // 读数与分组徽标不随筛选变化：满减组徽标仍是本组总数 2。
    expect(stripItem('全部').text()).toContain('3')
    expect(stripItem('满减券').text()).toContain('2')
    const amountGroupBadge = wrapper!
      .findAll('.coupon-group')
      .find((group) => group.text().includes('满减优惠券'))!
      .get('.coupon-group__head .wb-badge')
    expect(amountGroupBadge.text()).toBe('2')

    await stripItem('全部').trigger('click')
    expect(rowCodes()).toEqual(['MOCK-COUPON-10', 'MOCK-COUPON-USED', 'MOCK-COUPON-5P'])
  })

  it('点券行或「复制券码」都复制券码', async () => {
    await render()

    await wrapper!.findAll('.wb-item')[0]!.trigger('click')
    expect(mocks.writeText).toHaveBeenLastCalledWith('MOCK-COUPON-10')
    expect(mocks.success).toHaveBeenCalledWith('券码已复制')

    const copyButton = wrapper!.findAll('.wb-item__side button')[1]!
    await copyButton.trigger('click')
    expect(mocks.writeText).toHaveBeenLastCalledWith('MOCK-COUPON-USED')
    expect(mocks.writeText).toHaveBeenCalledTimes(2)
  })

  it('某一组没有券时该组就地给空态', async () => {
    await render([amountCoupon])

    expect(rowCodes()).toEqual(['MOCK-COUPON-10'])
    expect(wrapper!.text()).toContain('暂无折扣优惠券')
    expect(wrapper!.text()).not.toContain('暂无满减优惠券')
  })
})
