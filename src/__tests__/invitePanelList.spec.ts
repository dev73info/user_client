import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InvitePanel from '@/components/InvitePanel.vue'
import type { Invitee } from '@/api/invite'

const mocks = vi.hoisted(() => ({
  code: vi.fn(),
  stats: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ token: 'test-token', hydrate: vi.fn() }) }))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast =
    (type: 'success' | 'error' | 'warning' | 'info') =>
    (message: string): void =>
      mocks.toast(message, type)
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: toast('success'),
      error: toast('error'),
      warning: toast('warning'),
      info: toast('info'),
    },
  }
})
vi.mock('@/api/invite', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/invite')>(),
  getMyInviteCode: mocks.code,
  getMyInviteStats: mocks.stats,
}))

/** 加入时间用「距今 N 天」造：时间档筛的是相对于今天的窗口，写死日期会随运行时间失效。 */
function invitee(username: string, daysAgo: number): Invitee {
  return {
    username,
    joined_at: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
  }
}

// 25 条：12 条在近 7 天内，20 条在近 30 天内，5 条更早——三个时间档的计数各不相同，能看出筛没生效。
const INVITEES: Invitee[] = [
  ...Array.from({ length: 12 }, (_, index) => invitee(`week_user_${index}`, index % 7)),
  ...Array.from({ length: 8 }, (_, index) => invitee(`month_user_${index}`, 10 + index)),
  ...Array.from({ length: 5 }, (_, index) => invitee(`old_user_${index}`, 60 + index)),
]

function mountPanel() {
  return shallowMount(InvitePanel, { global: { config: { warnHandler: () => {} } } })
}

type InvitePanelState = {
  joinedScope: 'all' | 'week' | 'month'
  keyword: string
  filteredTotal: number
  page: number
  pageSize: number
  filteredInvitees: Invitee[]
  pagedInvitees: Invitee[]
  hasActiveFilters: boolean
  resetFilters: () => void
}

function state(wrapper: ReturnType<typeof mountPanel>): InvitePanelState {
  return (wrapper.vm.$ as unknown as { setupState: InvitePanelState }).setupState
}

describe('invite record list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.code.mockResolvedValue({ code: 'ABC123', invite_url: 'https://example.com/r/ABC123', invite_count: 25 })
    mocks.stats.mockResolvedValue({ total_invited: 25, invite_code: 'ABC123', invitees: INVITEES })
  })

  it('一次取回全部记录，第一页只渲染一档条数', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    expect(state(wrapper).filteredTotal).toBe(25)
    expect(state(wrapper).page).toBe(1)
    expect(state(wrapper).pageSize).toBe(10)
    expect(wrapper.findAll('.wb-list > .wb-item')).toHaveLength(10)
    // 读数条由本组件上报，页面不重复打接口
    const emittedStats = wrapper.emitted('stats') ?? []
    expect(emittedStats[emittedStats.length - 1]).toEqual([25])
    wrapper.unmount()
  })

  it('时间档与用户名搜索一起过滤，计数与列表同源', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    state(wrapper).joinedScope = 'week'
    await flushPromises()
    expect(state(wrapper).filteredTotal).toBe(12)

    state(wrapper).joinedScope = 'month'
    await flushPromises()
    expect(state(wrapper).filteredTotal).toBe(20)

    state(wrapper).keyword = 'month_user'
    await flushPromises()
    // 两个条件同时生效：近 30 天里名字含 month_user 的 8 条
    expect(state(wrapper).filteredTotal).toBe(8)

    state(wrapper).keyword = '没有这个人'
    await flushPromises()
    expect(state(wrapper).filteredTotal).toBe(0)
    // 没有匹配时给的是「没有匹配」而不是「暂无记录」的文案
    expect(wrapper.text()).toContain('没有匹配的邀请记录')

    wrapper.unmount()
  })

  it('时间档切换后回到第 1 页，重置按钮清空两个条件', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    state(wrapper).page = 3
    expect(state(wrapper).pagedInvitees).toHaveLength(5)
    state(wrapper).joinedScope = 'month'
    await flushPromises()
    expect(state(wrapper).page).toBe(1)

    state(wrapper).keyword = 'week_user'
    await flushPromises()
    expect(state(wrapper).hasActiveFilters).toBe(true)

    state(wrapper).resetFilters()
    await flushPromises()
    expect(state(wrapper).hasActiveFilters).toBe(false)
    expect(state(wrapper).filteredTotal).toBe(25)
    wrapper.unmount()
  })

  it('加入时间解析不出来的记录不会从任何时间档里消失', async () => {
    mocks.stats.mockResolvedValue({
      total_invited: 2,
      invite_code: 'ABC123',
      invitees: [invitee('week_user', 1), { username: 'broken_user', joined_at: '不是时间' }],
    })

    const wrapper = mountPanel()
    await flushPromises()
    state(wrapper).joinedScope = 'week'
    await flushPromises()

    expect(state(wrapper).filteredTotal).toBe(2)
    expect(wrapper.text()).toContain('broken_user')
    wrapper.unmount()
  })
})
