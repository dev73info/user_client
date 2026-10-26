import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'

import HomeView from '@/views/HomeView.vue'

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  checkin: vi.fn(),
}))
const auth = reactive({ isAuthed: false, token: '', isDev: false })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/api/points', () => ({
  getCheckinStatus: mocks.status,
  doCheckin: mocks.checkin,
}))
vi.mock('ui_73info', () => ({
  TMessage: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/composables/usePublicResources', () => ({
  usePublicResources: () => ({
    publicResources: ref([]),
    highLikeThreshold: ref(10),
    resolveResourceRoute: vi.fn(),
    ensureTagTree: vi.fn(),
    applyResourceList: vi.fn(),
    applyLikeState: vi.fn(),
  }),
}))
vi.mock('@/composables/useHomeAuthQuery', () => ({
  useHomeAuthQuery: () => ({ routeQueryValue: vi.fn(), consumeAuthQuery: vi.fn() }),
}))
vi.mock('@/composables/useHomeDepositCard', () => ({
  useHomeDepositCard: () => ({
    depositModalBindings: ref(null),
    depositLoading: ref(false),
    openDepositPayment: vi.fn(),
    canOpenPayment: ref(false),
    loadDepositRatio: vi.fn(),
    markUnionAuthorized: vi.fn(),
  }),
}))
vi.mock('@/composables/useHomePortalLifecycle', () => ({
  useHomePortalLifecycle: () => ({ refreshPortalData: vi.fn() }),
}))
vi.mock('@/composables/useHomePortalAuth', () => ({
  useHomePortalAuth: () => ({
    openAuth: vi.fn(),
    authModalBindings: ref({}),
    wechatQrBindings: ref({}),
  }),
}))
vi.mock('@/composables/useHomePublishCard', () => ({
  useHomePublishCard: () => ({
    publishModalBindings: ref({}),
    publishModalRef: ref(null),
    publishLoading: ref(false),
    openPublishModal: vi.fn(),
    startResubmit: vi.fn(),
  }),
}))
vi.mock('@/composables/useHomePortalLoaders', () => ({
  useHomePortalLoaders: () => ({
    metrics: ref([]),
    latestDeals: ref([]),
    publicDeveloperCount: ref(0),
    pendingRequirements: ref([]),
    publicRequirementSpotlights: ref([]),
    loadPendingRequirements: vi.fn(),
    loadRequirementOverview: vi.fn(),
    loadPublicPortalData: vi.fn(),
  }),
}))
vi.mock('@/composables/usePortalRanks', () => ({
  usePortalRanks: () => ({
    developerRanks: ref([]),
    teamRanks: ref([]),
    totalContribResources: ref(0),
  }),
}))
vi.mock('@/composables/useHomePortalActions', () => ({
  useHomePortalActions: () => ({ spotlightLikeSubmittingIds: ref(new Set()) }),
}))

describe('首页签到组件接线', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.isAuthed = false
    auth.token = ''
    mocks.status.mockResolvedValue({
      username: 'client',
      today_checked_in: false,
      streak_count: 1,
      today_potential: 10,
    })
    mocks.checkin.mockResolvedValue({
      username: 'client',
      streak_count: 1,
      total_awarded: 10,
    })
  })

  it('登录后展示可点击的每日签到，不把响应式引用当作加载态和错误', async () => {
    const wrapper = mount(HomeView, {
      global: {
        stubs: {
          AuthModal: true,
          WechatLoginQrModal: true,
          PublishModal: true,
          DepositModal: true,
          PortalHeroSection: true,
          PortalQuickPanels: true,
          PortalWorkflowSection: true,
          SpotlightResourceSection: true,
          PortalNoticeCard: true,
          PortalMilestoneCard: true,
          DeveloperRankCard: true,
          TeamRankCard: true,
        },
      },
    })
    auth.isAuthed = true
    auth.token = 'user-token'
    await flushPromises()

    expect(mocks.status).toHaveBeenCalledWith('user-token')
    const button = wrapper.find('.portal-beta-notice__btn')
    expect(button.text()).toBe('每日签到')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    await button.trigger('click')
    await flushPromises()
    expect(mocks.checkin).toHaveBeenCalledWith('user-token')
    expect(wrapper.find('.portal-beta-notice__badge').text()).toBe('今日已签到')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
