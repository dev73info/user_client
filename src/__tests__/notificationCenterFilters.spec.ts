import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  warnings: vi.fn(),
  posts: vi.fn(),
  disclosures: vi.fn(),
  respondDisclosure: vi.fn(),
  afterSales: vi.fn(),
  inbox: vi.fn(),
  mine: vi.fn(),
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
vi.mock('@/api/community', () => ({
  listMyCommentWarnings: mocks.warnings,
  listCommunityPosts: mocks.posts,
}))
vi.mock('@/api/conversations', () => ({
  listConversationHistoryDisclosures: mocks.disclosures,
  respondConversationHistoryDisclosure: mocks.respondDisclosure,
}))
vi.mock('@/api/afterSales', () => ({
  listMyAfterSalesCases: mocks.afterSales,
}))
vi.mock('@/api/resourceTransfers', () => ({
  listMyResourceTransferInbox: mocks.inbox,
  listMyResourceTransfers: mocks.mine,
  acceptResourceTransfer: vi.fn(),
  rejectResourceTransfer: vi.fn(),
  cancelResourceTransfer: vi.fn(),
}))

import type { NotificationCard } from '@/shared/notifications'
import NotificationCardItem from '@/components/notification/NotificationCardItem.vue'
import NotificationsToolbar from '@/components/notification/NotificationsToolbar.vue'
import NotificationCenterView from '@/views/NotificationCenterView.vue'
import {
  commentWarningFixture,
  communityPostFixture,
  historyDisclosureFixture,
} from './notificationCenterFixtures'

/**
 * 「系统通知」页（R047 拆分后）的挂载烟测：列表渲染、筛选切换、投票接口实参与跳转实参。
 *
 * 起这个用例的原因是拆分本身：数据搬进 `useNotificationCenter`、卡片搬进 `NotificationCardItem`、
 * 筛选搬进 `NotificationsToolbar`，三处接线都可能在拆分中接错，而原有用例只钉了资源过户那几个动作。
 * 这里钉用户工作台一侧的四件事：
 * 1. 四支请求都发出、公告只留已发布、用户端不拉过户；
 * 2. 类别胶囊与关键词真的会收窄列表，重置能回到全部；
 * 3. 投票调接口的实参（令牌 / 申请 id / 决定），且只重拉公开申请那一支；
 * 4. 点公告卡片跳到社区帖，非公告卡片点了不跳。
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
  mocks.warnings.mockResolvedValue([commentWarningFixture()])
  mocks.disclosures.mockResolvedValue([historyDisclosureFixture()])
  mocks.afterSales.mockResolvedValue({ items: [] })
  // 一条已发布 + 一条待审核：待审核的不该出现在用户的通知里
  mocks.posts.mockResolvedValue([
    communityPostFixture(),
    communityPostFixture({ id: 8, title: '待审核的公告', status: 'pending_review' }),
  ])
  mocks.respondDisclosure.mockResolvedValue({})
})

describe('系统通知：渲染与筛选', () => {
  it('四支请求都发、公告只留已发布、用户端不拉过户', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.warnings).toHaveBeenCalledWith('test-token')
    expect(mocks.disclosures).toHaveBeenCalledWith('test-token')
    expect(mocks.afterSales).toHaveBeenCalledWith('test-token')
    // 公告是公开接口：不带令牌，取最近 50 条
    expect(mocks.posts).toHaveBeenCalledWith({ tag: '公告', limit: 50, offset: 0 })
    // 用户端没有过户这一类，两份过户列表一次都不该请求
    expect(mocks.inbox).not.toHaveBeenCalled()
    expect(mocks.mine).not.toHaveBeenCalled()

    expect(state(wrapper).cards).toHaveLength(3)
    expect(cardTitles(wrapper)).toContain('平台维护公告')
    expect(cardTitles(wrapper)).not.toContain('待审核的公告')
    expect(wrapper.findAll('.notifications-card')).toHaveLength(3)

    // 顶栏第三格在用户端是「评论警告」，不是「资源过户」
    expect(wrapper.text()).toContain('评论警告')
    expect(wrapper.text()).not.toContain('资源过户')
    wrapper.unmount()
  })

  it('类别胶囊与关键词都会收窄列表，重置回到全部', async () => {
    const wrapper = mountView()
    await flushPromises()

    const chips = wrapper.findAll('.wb-chip')
    // 用户端胶囊：全部 / 评论警告 / 公开申请 / 解除合作案件 / 平台公告（过户那一格不出现）
    expect(chips.map((chip) => chip.text())).toEqual([
      '全部3',
      '评论警告1',
      '公开申请1',
      '解除合作案件0',
      '平台公告1',
    ])

    await chips[1]!.trigger('click')
    expect(state(wrapper).kindFilter).toBe('comment-warning')
    expect(state(wrapper).filteredCards).toHaveLength(1)
    expect(wrapper.findAll('.notifications-card')).toHaveLength(1)

    // 搜索词走工具栏的 v-model 回传（TInput 被 shallowMount 换成桩，直接发 model 事件）
    wrapper.findComponent(NotificationsToolbar).vm.$emit('update:keyword', '平台公告')
    await flushPromises()
    expect(state(wrapper).keyword).toBe('平台公告')
    // 评论警告卡里没有「平台公告」四个字 → 筛选后为空，空态给的是「没有匹配」
    expect(state(wrapper).filteredCards).toHaveLength(0)
    expect(wrapper.text()).toContain('没有匹配的系统通知')

    wrapper.findComponent(NotificationsToolbar).vm.$emit('reset')
    await flushPromises()
    expect(state(wrapper).kindFilter).toBe('all')
    expect(state(wrapper).keyword).toBe('')
    expect(wrapper.findAll('.notifications-card')).toHaveLength(3)
    wrapper.unmount()
  })

  it('关键词能命中正文，命中后计数与空态一起变', async () => {
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent(NotificationsToolbar).vm.$emit('update:keyword', '广告')
    await flushPromises()

    // 「包含广告信息」是评论警告的正文行：搜索要能搜到正文，而不只是标题
    expect(state(wrapper).filteredCards).toHaveLength(1)
    expect(cardTitles(wrapper)).toEqual(['社区评论被平台警告'])
    expect(wrapper.text()).toContain('筛选出 1 / 3 条')
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
    // 只重拉公开申请：另三支不会因为这一票变化，重拉会把列表滚回顶部
    expect(mocks.disclosures).toHaveBeenCalledTimes(2)
    expect(mocks.warnings).toHaveBeenCalledTimes(1)
    expect(mocks.afterSales).toHaveBeenCalledTimes(1)
    expect(mocks.posts).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('点公告卡片跳社区帖，点非公告卡片不跳', async () => {
    const wrapper = mountView()
    await flushPromises()

    const items = wrapper.findAllComponents(NotificationCardItem)
    const announcement = items.find((item) => item.props('card').postId != null)!
    const plain = items.find((item) => item.props('card').postId == null)!

    await plain.trigger('click')
    expect(mocks.push).not.toHaveBeenCalled()

    await announcement.trigger('click')
    expect(mocks.push).toHaveBeenCalledWith({ name: 'community-post', params: { postId: 7 } })
    wrapper.unmount()
  })

  it('未登录：需要令牌的三支直接跳过，公告照常取', async () => {
    const auth = await import('@/stores/auth')
    vi.spyOn(auth, 'useAuthStore').mockReturnValue({
      token: '',
      username: '',
      hydrate: vi.fn(),
    } as unknown as ReturnType<typeof auth.useAuthStore>)

    const wrapper = mountView()
    await flushPromises()

    expect(mocks.warnings).not.toHaveBeenCalled()
    expect(mocks.disclosures).not.toHaveBeenCalled()
    expect(mocks.afterSales).not.toHaveBeenCalled()
    expect(mocks.posts).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.notifications-card')).toHaveLength(1)
    wrapper.unmount()
  })
})
