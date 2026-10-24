import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  disclosures: vi.fn(),
  respondDisclosure: vi.fn(),
  afterSales: vi.fn(),
}))

// 用户工作台这一侧：matched 里没有 devArea，资源过户整类不出现、两份过户列表也不该被请求
vi.mock('vue-router', () => ({
  useRoute: () => ({ matched: [{ meta: {} }] }),
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    token: 'test-token',
    username: 'dev_old',
    hydrate: vi.fn(),
  }),
}))
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
vi.mock('@/api/conversations', () => ({
  listConversationHistoryDisclosures: mocks.disclosures,
  respondConversationHistoryDisclosure: mocks.respondDisclosure,
}))
vi.mock('@/api/afterSales', () => ({
  listMyAfterSalesCases: mocks.afterSales,
}))

import type { NotificationCard } from '@/shared/notifications'
import NotificationCardItem from '@/components/notification/NotificationCardItem.vue'
import NotificationsToolbar from '@/components/notification/NotificationsToolbar.vue'
import NotificationCenterView from '@/views/NotificationCenterView.vue'
import { historyDisclosureFixture } from './notificationCenterFixtures'

/**
 * 「系统通知」页（R047 拆分后）的挂载烟测：列表渲染、筛选切换、投票接口实参与跳转实参。
 *
 * 起这个用例的原因是拆分本身：数据搬进 `useNotificationCenter`、卡片搬进 `NotificationCardItem`、
 * 筛选搬进 `NotificationsToolbar`，三处接线都可能在拆分中接错，而原有用例只钉了资源过户那几个动作。
 * 这里钉用户工作台一侧的三件事：
 * 1. 两支请求都发出（公开申请 + 解除合作案件）；
 * 2. 类别胶囊与关键词真的会收窄列表，重置能回到全部；
 * 3. 投票调接口的实参（令牌 / 申请 id / 决定），且只重拉公开申请那一支。
 */

function mountView(): VueWrapper {
  return shallowMount(NotificationCenterView, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        WorkbenchBarSlot: { name: 'WorkbenchBarSlot', template: '<div><slot /></div>' },
        // 构件一律要真渲染：这几个用例断言的正是它们之间的接线
        NotificationCardItem: false,
        NotificationsToolbar: false,
        NotificationsOverviewStrip: false,
        NotificationsEmptyState: false,
      },
    },
  })
}

type ViewState = {
  cards: NotificationCard[]
  kindFilter: string
  keyword: string
  filteredCards: NotificationCard[]
}

function state(wrapper: VueWrapper): ViewState {
  return (wrapper.vm.$ as unknown as { setupState: ViewState }).setupState
}

function cardTitles(wrapper: VueWrapper): string[] {
  return wrapper.findAllComponents(NotificationCardItem).map((item) => item.props('card').title)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.disclosures.mockResolvedValue([historyDisclosureFixture()])
  // 契约 `GET /api/dispute/cases` 回的是数组本身，不是 `{ items }` 那种分页壳
  mocks.afterSales.mockResolvedValue([])
  mocks.respondDisclosure.mockResolvedValue({})
})

describe('系统通知：渲染与筛选', () => {
  it('两支请求都发、用户端不拉过户', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.disclosures).toHaveBeenCalledWith('test-token')
    expect(mocks.afterSales).toHaveBeenCalledWith('test-token')

    expect(state(wrapper).cards).toHaveLength(1)
    expect(cardTitles(wrapper)).toContain('企业官网改版')
    expect(wrapper.findAll('.notifications-card')).toHaveLength(1)

    wrapper.unmount()
  })

  it('类别胶囊与关键词都会收窄列表，重置回到全部', async () => {
    const wrapper = mountView()
    await flushPromises()

    const chips = wrapper.findAll('.wb-chip')
    // 胶囊：全部 / 公开申请 / 解除合作案件
    expect(chips.map((chip) => chip.text())).toEqual(['全部1', '公开申请1', '解除合作案件0'])

    await chips[1]!.trigger('click')
    expect(state(wrapper).kindFilter).toBe('history-disclosure')
    expect(state(wrapper).filteredCards).toHaveLength(1)
    expect(wrapper.findAll('.notifications-card')).toHaveLength(1)

    // 搜索词走工具栏的 v-model 回传（TInput 被 shallowMount 换成桩，直接发 model 事件）
    wrapper.findComponent(NotificationsToolbar).vm.$emit('update:keyword', '不存在的词')
    await flushPromises()
    expect(state(wrapper).keyword).toBe('不存在的词')
    // 公开申请卡里没有这个关键词 → 筛选后为空，空态给的是「没有匹配」
    expect(state(wrapper).filteredCards).toHaveLength(0)
    expect(wrapper.text()).toContain('没有匹配的系统通知')

    wrapper.findComponent(NotificationsToolbar).vm.$emit('reset')
    await flushPromises()
    expect(state(wrapper).kindFilter).toBe('all')
    expect(state(wrapper).keyword).toBe('')
    expect(wrapper.findAll('.notifications-card')).toHaveLength(1)
    wrapper.unmount()
  })

  it('关键词能命中正文，命中后计数与空态一起变', async () => {
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent(NotificationsToolbar).vm.$emit('update:keyword', '公开')
    await flushPromises()

    // 「你和对方都同意后，这段记录才会向他公开」是公开申请的正文行：搜索要能搜到正文
    expect(state(wrapper).filteredCards).toHaveLength(1)
    expect(cardTitles(wrapper)).toEqual(['企业官网改版'])
    expect(wrapper.text()).toContain('筛选出 1 / 1 条')
    wrapper.unmount()
  })
})

describe('系统通知：卡片动作与跳转', () => {
  it('投票带对令牌、申请 id 与决定，且只重拉公开申请那一支', async () => {
    const wrapper = mountView()
    await flushPromises()

    const voteCard = wrapper
      .findAllComponents(NotificationCardItem)
      .find((item) => item.props('card').canVote)!
    expect(voteCard.props('card').disclosureId).toBe(3)

    voteCard.vm.$emit('vote', 'approved')
    await flushPromises()

    expect(mocks.respondDisclosure).toHaveBeenCalledWith('test-token', 3, 'approved')
    expect(mocks.toast).toHaveBeenCalledWith('已同意公开这段历史沟通', 'success')
    // 只重拉公开申请：另一支不会因为这一票变化，重拉会把列表滚回顶部
    expect(mocks.disclosures).toHaveBeenCalledTimes(2)
    expect(mocks.afterSales).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('未登录：需要令牌的两支直接跳过', async () => {
    const auth = await import('@/stores/auth')
    vi.spyOn(auth, 'useAuthStore').mockReturnValue({
      token: '',
      username: '',
      hydrate: vi.fn(),
    } as unknown as ReturnType<typeof auth.useAuthStore>)

    const wrapper = mountView()
    await flushPromises()

    expect(mocks.disclosures).not.toHaveBeenCalled()
    expect(mocks.afterSales).not.toHaveBeenCalled()
    expect(wrapper.findAll('.notifications-card')).toHaveLength(0)
    wrapper.unmount()
  })
})
