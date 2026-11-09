/** 通知中心的已读动作与分页：单条已读、全部已读、未读角标、翻页。 */
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BackendNotification } from '@/api/notifications'

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  disclosures: vi.fn(),
  afterSales: vi.fn(),
  warnings: vi.fn(),
  inbox: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ matched: [{ meta: {} }] }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: 'test-token', username: 'cust', hydrate: vi.fn() }),
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
  respondConversationHistoryDisclosure: vi.fn(),
}))
vi.mock('@/api/afterSales', () => ({ listMyAfterSalesCases: mocks.afterSales }))
vi.mock('@/api/community', () => ({ listMyCommunityCommentWarnings: mocks.warnings }))
vi.mock('@/api/notifications', () => ({
  listAllMyNotifications: mocks.inbox,
  markMyNotificationRead: mocks.markRead,
  markAllMyNotificationsRead: mocks.markAllRead,
}))

import NotificationCardItem from '@/components/notification/NotificationCardItem.vue'
import NotificationsOverviewStrip from '@/components/notification/NotificationsOverviewStrip.vue'
import NotificationsPager from '@/components/notification/NotificationsPager.vue'
import NotificationCenterView from '@/views/NotificationCenterView.vue'
import { afterSalesCase } from './helpers/notifications'

function inboxItem(overrides: Partial<BackendNotification> = {}): BackendNotification {
  return {
    notification_id: 'NTF-1',
    recipient: 'cust',
    kind: 'system',
    event: 'resource_published',
    title: '资源已上架',
    body: '你的资源已通过审核。',
    link: '',
    biz_no: 'resource:1',
    read: false,
    email_sent: false,
    created_time: '2026-11-08 10:00:00',
    read_time: null,
    ...overrides,
  }
}

function mountView(): VueWrapper {
  return shallowMount(NotificationCenterView, {
    global: {
      stubs: {
        WorkbenchBarSlot: { name: 'WorkbenchBarSlot', template: '<div><slot /></div>' },
        NotificationCardItem: false,
        NotificationsToolbar: false,
        NotificationsOverviewStrip: false,
        NotificationsEmptyState: false,
      },
    },
  })
}

type ViewState = {
  unreadCount: number
  markingId: string | null
  markingAll: boolean
  displayCards: Array<{
    notificationId?: string
    notificationIds?: string[]
    read?: boolean
    title: string
  }>
}

function state(wrapper: VueWrapper): ViewState {
  return (wrapper.vm.$ as unknown as { setupState: ViewState }).setupState
}

function stripValues(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.wb-strip__value').map((node) => node.text())
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.disclosures.mockResolvedValue([])
  mocks.afterSales.mockResolvedValue([])
  mocks.warnings.mockResolvedValue([])
  mocks.markRead.mockResolvedValue(inboxItem({ read: true }))
  mocks.markAllRead.mockResolvedValue({ marked: 1 })
})

describe('站内通知：已读', () => {
  it('单条已读：调接口、卡片变已读、未读角标减一', async () => {
    mocks.inbox.mockResolvedValue({
      items: [inboxItem()],
      total: 1,
      page: 1,
      page_size: 100,
      unread_count: 1,
    })
    const wrapper = mountView()
    await flushPromises()

    expect(stripValues(wrapper)).toEqual(['1', '1', '0'])
    expect(wrapper.find('.notifications-unread').exists()).toBe(true)

    const card = wrapper
      .findAllComponents(NotificationCardItem)
      .find((item) => item.props('card').notificationId === 'NTF-1')!
    card.vm.$emit('read')
    await flushPromises()

    expect(mocks.markRead).toHaveBeenCalledWith('test-token', 'NTF-1')
    expect(state(wrapper).unreadCount).toBe(0)
    expect(stripValues(wrapper)).toEqual(['1', '0', '0'])
    expect(wrapper.find('.notifications-unread').exists()).toBe(false)
    wrapper.unmount()
  })

  it('同一案件合并卡：点一次「标为已读」把全部未读事件一起标掉', async () => {
    mocks.afterSales.mockResolvedValue([afterSalesCase()])
    mocks.inbox.mockResolvedValue({
      items: [
        inboxItem({
          notification_id: 'NTF-D3',
          kind: 'breach',
          event: 'dispute_decided',
          title: '争议已裁决',
          link: '/workbench/requirements/REQ-1',
          biz_no: 'REQ-1',
          read: false,
          created_time: '2026-04-03 10:00:00',
        }),
        inboxItem({
          notification_id: 'NTF-D2',
          kind: 'breach',
          event: 'dispute_escalated',
          title: '平台已介入争议处理',
          link: '/workbench/requirements/REQ-1',
          biz_no: 'REQ-1',
          read: false,
          created_time: '2026-04-02 10:00:00',
        }),
      ],
      total: 2,
      page: 1,
      page_size: 100,
      unread_count: 2,
    })
    const wrapper = mountView()
    await flushPromises()

    // 本地案件卡与两条 dispute_* 通知合成一条
    const cards = wrapper.findAllComponents(NotificationCardItem)
    expect(cards).toHaveLength(1)
    expect(cards[0]?.props('card').key).toBe('after-sales-AFTERSALES_1_abc')
    expect(cards[0]?.props('card').notificationIds).toEqual(['NTF-D3', 'NTF-D2'])
    expect(stripValues(wrapper)).toEqual(['1', '2', '0'])

    cards[0]!.vm.$emit('read')
    await flushPromises()

    expect(mocks.markRead).toHaveBeenCalledTimes(2)
    expect(mocks.markRead).toHaveBeenNthCalledWith(1, 'test-token', 'NTF-D3')
    expect(mocks.markRead).toHaveBeenNthCalledWith(2, 'test-token', 'NTF-D2')
    expect(state(wrapper).unreadCount).toBe(0)
    expect(wrapper.find('.notifications-unread').exists()).toBe(false)
    wrapper.unmount()
  })

  it('全部已读：调接口、所有卡片变已读、未读归零', async () => {
    mocks.inbox.mockResolvedValue({
      items: [
        inboxItem({ notification_id: 'NTF-1' }),
        inboxItem({
          notification_id: 'NTF-2',
          title: '资源未通过审核',
          event: 'resource_rejected',
          biz_no: 'resource:2',
          created_time: '2026-11-07 10:00:00',
        }),
      ],
      total: 2,
      page: 1,
      page_size: 100,
      unread_count: 2,
    })
    mocks.markAllRead.mockResolvedValue({ marked: 2 })
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent(NotificationsOverviewStrip).vm.$emit('markAllRead')
    await flushPromises()

    expect(mocks.markAllRead).toHaveBeenCalledWith('test-token')
    expect(state(wrapper).unreadCount).toBe(0)
    expect(wrapper.findAll('.notifications-unread')).toHaveLength(0)
    expect(mocks.toast).toHaveBeenCalledWith('已全部标为已读（2 条）', 'success')
    wrapper.unmount()
  })

  it('已读的卡片不再给「标为已读」按钮', async () => {
    mocks.inbox.mockResolvedValue({
      items: [inboxItem({ read: true })],
      total: 1,
      page: 1,
      page_size: 100,
      unread_count: 0,
    })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).not.toContain('标为已读')
    expect(wrapper.find('.notifications-unread').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('站内通知：分页', () => {
  it('12 条按默认每页 10 条分成两页', async () => {
    const items = Array.from({ length: 12 }, (_, index) =>
      inboxItem({
        notification_id: `NTF-${index + 1}`,
        title: `通知 ${index + 1}`,
        created_time: `2026-11-${String(20 - index).padStart(2, '0')} 10:00:00`,
      }),
    )
    mocks.inbox.mockResolvedValue({
      items,
      total: 12,
      page: 1,
      page_size: 100,
      unread_count: 0,
    })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAllComponents(NotificationCardItem)).toHaveLength(10)
    expect(state(wrapper).displayCards).toHaveLength(10)

    wrapper.findComponent(NotificationsPager).vm.$emit('update:page', 2)
    await flushPromises()

    const pageTwo = wrapper.findAllComponents(NotificationCardItem)
    expect(pageTwo).toHaveLength(2)
    // 第 2 页是最早的两条
    expect(pageTwo.map((item) => item.props('card').title)).toEqual(['通知 12', '通知 11'])
    wrapper.unmount()
  })
})
