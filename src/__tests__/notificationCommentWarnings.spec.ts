import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  disclosures: vi.fn(),
  afterSales: vi.fn(),
  warnings: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ matched: [{ meta: {} }] }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: 'test-token', username: 'dev_old', hydrate: vi.fn() }),
}))
vi.mock('@/api/conversations', () => ({
  listConversationHistoryDisclosures: mocks.disclosures,
  respondConversationHistoryDisclosure: vi.fn(),
}))
vi.mock('@/api/afterSales', () => ({ listMyAfterSalesCases: mocks.afterSales }))
vi.mock('@/api/community', () => ({ listMyCommunityCommentWarnings: mocks.warnings }))

import NotificationCardItem from '@/components/notification/NotificationCardItem.vue'
import NotificationCenterView from '@/views/NotificationCenterView.vue'
import { historyDisclosureFixture } from './notificationCenterFixtures'
import { commentWarning } from './helpers/notifications'

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

function totalText(wrapper: VueWrapper): string {
  return wrapper.get('.wb-strip__value').text()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.disclosures.mockResolvedValue([])
  mocks.afterSales.mockResolvedValue([])
  mocks.warnings.mockResolvedValue([])
})

describe('评论警告通知', () => {
  it('展示快照、原因和时间，并可按类别筛选', async () => {
    mocks.disclosures.mockResolvedValue([historyDisclosureFixture()])
    mocks.warnings.mockResolvedValue([commentWarning()])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('评论快照：含有联系方式的测试评论')
    expect(wrapper.text()).toContain('警告原因：包含广告联系方式')
    expect(wrapper.text()).toContain('2026-05-01 10:00:00 由 admin 发出警告')
    const chips = wrapper.findAll('.wb-chip')
    expect(chips.map((chip) => chip.text())).toEqual([
      '全部2',
      '公开申请1',
      '解除合作案件0',
      '评论警告1',
    ])

    await chips[3]!.trigger('click')
    const cards = wrapper.findAllComponents(NotificationCardItem)
    expect(cards).toHaveLength(1)
    expect(cards[0]?.props('card').title).toBe('评论 #5')
    wrapper.unmount()
  })

  it('警告接口失败保留其他类型，并持续显示局部错误', async () => {
    mocks.disclosures.mockResolvedValue([historyDisclosureFixture()])
    mocks.warnings.mockRejectedValue(new Error('评论警告服务暂不可用'))
    const wrapper = mountView()
    await flushPromises()

    const alert = wrapper.get('.notifications-load-error')
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toContain('评论警告服务暂不可用')
    expect(wrapper.findAllComponents(NotificationCardItem)).toHaveLength(1)
    expect(wrapper.text()).toContain('企业官网改版')
    expect(totalText(wrapper)).toBe('1')
    await flushPromises()
    expect(wrapper.find('.notifications-load-error').exists()).toBe(true)
    wrapper.unmount()
  })

  it('没有已取得卡片时显示占位而非 0，局部重试成功后恢复', async () => {
    mocks.warnings.mockRejectedValueOnce(new Error('评论警告服务暂不可用'))
    const wrapper = mountView()
    await flushPromises()

    expect(totalText(wrapper)).toBe('—')
    expect(wrapper.text()).not.toContain('暂无系统通知')
    expect(wrapper.find('.wb-list').exists()).toBe(false)
    expect(wrapper.get('.notifications-load-error').text()).toContain('评论警告服务暂不可用')

    let finishRetry: (() => void) | undefined
    mocks.warnings.mockReturnValueOnce(
      new Promise<ReturnType<typeof commentWarning>[]>((resolve) => {
        finishRetry = () => resolve([commentWarning()])
      }),
    )
    const buttons = wrapper.findAllComponents({ name: 'TButton' })
    buttons[buttons.length - 1]!.vm.$emit('click')
    await flushPromises()
    expect(wrapper.find('.notifications-load-error').exists()).toBe(true)

    finishRetry?.()
    await flushPromises()

    expect(mocks.warnings).toHaveBeenCalledTimes(2)
    expect(mocks.disclosures).toHaveBeenCalledTimes(1)
    expect(mocks.afterSales).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.notifications-load-error').exists()).toBe(false)
    expect(totalText(wrapper)).toBe('1')
    expect(wrapper.text()).toContain('评论快照：含有联系方式的测试评论')
    wrapper.unmount()
  })
})
