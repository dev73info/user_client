import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import PointsCenterView from '@/views/PointsCenterView.vue'

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  checkin: vi.fn(),
  status: vi.fn(),
  meta: vi.fn(),
  transfers: vi.fn(),
  transfer: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}))
const auth = reactive({ token: 'user-token', username: 'tester', isAuthed: true, hydrate: vi.fn() })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/api/points', () => ({
  getMyPoints: mocks.me,
  doCheckin: mocks.checkin,
  getCheckinStatus: mocks.status,
  getTransferMeta: mocks.meta,
  listMyTransfers: mocks.transfers,
  transferPoints: mocks.transfer,
}))
vi.mock('ui_73info', () => ({
  Promotion: { template: '<span />' },
  Refresh: { template: '<span />' },
  RefreshLeft: { template: '<span />' },
  Search: { template: '<span />' },
  TIcon: { template: '<span><slot /></span>' },
  TButton: {
    props: ['disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  TInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  TInputNumber: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input type="number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
  },
  TDialog: {
    props: ['open'],
    template: '<div v-if="open"><slot /><slot name="footer" /></div>',
  },
  TSelect: { template: '<div><slot /></div>' },
  TOption: { template: '<span />' },
  TPagination: { template: '<div />' },
  TMessage: { success: mocks.success, error: mocks.error, warning: mocks.warning },
}))

let wrapper: VueWrapper | undefined

function button(text: string) {
  const found = wrapper!.findAll('button').find((item) => item.text() === text)
  expect(found).toBeDefined()
  return found!
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.me.mockResolvedValue({
    username: 'tester',
    points_balance: 100,
    logs: [],
    logs_total: 0,
    logs_page: 1,
    logs_page_size: 10,
    username_gradient_owned: false,
    username_gradient: false,
    perks: [],
  })
  mocks.status.mockResolvedValue({
    username: 'tester',
    today_checked_in: false,
    streak_count: 1,
    today_potential: 10,
  })
  mocks.meta.mockResolvedValue({
    fee_rate: 20,
    daily_cap: 1000,
    receive_daily_cap: 1000,
    new_user_cap: 100,
    new_user_min_days: 7,
    manual_review_threshold: 5000,
  })
  mocks.transfers.mockResolvedValue([])
  mocks.checkin.mockResolvedValue({
    username: 'tester',
    checkin_date: '2026-10-27',
    streak_count: 1,
    points_awarded: 10,
    streak_bonus: 0,
    week_bonus: 0,
    month_bonus: 0,
    total_awarded: 10,
    already_checked_in: false,
  })
  mocks.transfer.mockResolvedValue({
    id: 1,
    from_username: 'tester',
    to_username: 'receiver',
    amount: 10,
    fee: 2,
    received: 8,
    balance_after: 90,
    note: null,
    status: 'completed',
    pending_review: false,
    cycle_flag: false,
    review_reason: null,
    review_note: null,
    reviewed_at: null,
    reviewed_by: null,
    created_at: '2026-10-27 12:00:00',
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('积分中心', () => {
  it('签到后更新状态并刷新积分余额', async () => {
    wrapper = mount(PointsCenterView, {
      global: { stubs: { WorkbenchBarSlot: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()
    await button('每日签到').trigger('click')
    await flushPromises()
    expect(mocks.checkin).toHaveBeenCalledWith('user-token')
    expect(wrapper.text()).toContain('今日已签到')
    expect(mocks.me).toHaveBeenCalledTimes(2)
  })

  it('打赏提交真实接收方、金额和附言', async () => {
    wrapper = mount(PointsCenterView, {
      global: { stubs: { WorkbenchBarSlot: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()
    await button('积分打赏').trigger('click')
    await wrapper.get('[aria-label="接收方用户名"]').setValue('receiver')
    await wrapper.get('[aria-label="打赏金额"]').setValue(10)
    await wrapper.get('[aria-label="打赏附言"]').setValue('感谢')
    await button('打赏').trigger('click')
    await flushPromises()
    expect(mocks.transfer).toHaveBeenCalledWith('user-token', {
      to_username: 'receiver',
      amount: 10,
      note: '感谢',
    })
    expect(mocks.transfers).toHaveBeenCalledTimes(2)
    expect(mocks.success).toHaveBeenCalledWith('打赏成功')
  })

  it('规则加载失败时可重试', async () => {
    mocks.meta.mockRejectedValueOnce(new Error('规则暂不可用'))
    wrapper = mount(PointsCenterView, {
      global: { stubs: { WorkbenchBarSlot: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('规则暂不可用')
    await button('重试').trigger('click')
    await flushPromises()
    expect(mocks.meta).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
