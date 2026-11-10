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
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push }),
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
}))
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

describe('我的积分', () => {
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

  it('读数条只报读数，签到与打赏入口收在卡头右侧，打赏在弹窗里打开', async () => {
    wrapper = mount(PointsCenterView, {
      global: { stubs: { WorkbenchBarSlot: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()
    const strip = wrapper.get('.wb-strip')
    expect(strip.text()).toContain('积分记录')
    expect(strip.text()).toContain('含打赏 0 笔')
    expect(strip.text()).not.toContain('每日签到')
    expect(strip.text()).not.toContain('发起积分打赏')
    const actions = wrapper.get('.points-records__actions')
    expect(actions.text()).toContain('每日签到')
    expect(actions.text()).toContain('发起积分打赏')
    expect(wrapper.text()).not.toContain('导出 CSV')
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="接收方用户名"]').exists()).toBe(false)
    // 读数格只报读数（余额与记录数都不是可筛维度），页脚与解释性 hint 已按 ui-copy 删除
    expect(strip.find('[aria-pressed]').exists()).toBe(false)
    expect(wrapper.find('.points-foot').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('签到、打赏与兑换都会记入同一份积分流水')

    await button('发起积分打赏').trigger('click')
    await flushPromises()
    expect(wrapper.find('[aria-label="接收方用户名"]').exists()).toBe(true)
  })

  it('积分明细与打赏合并为一个积分记录列表', async () => {
    mocks.me.mockResolvedValueOnce({
      username: 'tester',
      points_balance: 100,
      logs: [
        {
          id: 2,
          username: 'tester',
          delta: -10,
          balance_after: 90,
          reason: '打赏给 receiver',
          source_type: null,
          source_id: null,
          operator: null,
          created_at: '2026-10-27 12:00:00',
        },
        {
          id: 1,
          username: 'tester',
          delta: 5,
          balance_after: 100,
          reason: '每日签到',
          source_type: null,
          source_id: null,
          operator: null,
          created_at: '2026-10-27 09:00:00',
        },
      ],
      logs_total: 2,
      logs_page: 1,
      logs_page_size: 10,
      username_gradient_owned: false,
      username_gradient: false,
      perks: [],
    })
    wrapper = mount(PointsCenterView, {
      global: { stubs: { WorkbenchBarSlot: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    expect(wrapper.get('.wb-card-head__title').text()).toBe('我的积分')
    expect(wrapper.get('table').attributes('aria-label')).toBe('积分记录')
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.text()).toContain('打赏给 receiver')
    expect(wrapper.text()).toContain('每日签到')
    // 分页从记录组件移到页面，用统一表尾分页器
    expect(wrapper.get('.wb-pager').text()).toContain('共 2 条记录')
  })

  it('没有积分记录时展示统一空态', async () => {
    wrapper = mount(PointsCenterView, {
      global: { stubs: { WorkbenchBarSlot: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()
    expect(wrapper.get('.wb-empty').text()).toContain('暂无积分记录')
    expect(wrapper.find('.wb-pager').exists()).toBe(false)
  })

  it('打赏提交真实接收方、金额和附言', async () => {
    wrapper = mount(PointsCenterView, {
      global: { stubs: { WorkbenchBarSlot: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()
    await button('发起积分打赏').trigger('click')
    await wrapper.get('[aria-label="接收方用户名"]').setValue('receiver')
    await wrapper.get('[aria-label="打赏金额"]').setValue(10)
    await wrapper.get('[aria-label="打赏附言"]').setValue('感谢')
    await button('确认打赏').trigger('click')
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
