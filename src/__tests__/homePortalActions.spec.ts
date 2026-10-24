import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useHomePortalActions } from '@/composables/useHomePortalActions'
import { HOME_QUICK_PANELS } from '@/shared/home/portalSections'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ isAuthed: false, token: '', isDev: false }),
}))

function setup() {
  return useHomePortalActions({
    isDeveloperAccount: ref(false),
    publicResources: ref([]),
    pendingRequirements: ref([]),
    resolveResourceRoute: () => null,
    applyLikeState: vi.fn(),
    canOpenPayment: () => false,
    openDepositCard: vi.fn(),
    openAuth: vi.fn(),
    openPublishModal: vi.fn(async () => {}),
  })
}

describe('首页快捷入口跳转', () => {
  it('免费资源进入免费列表，需求大厅进入现有需求路由', () => {
    const actions = setup()

    actions.openQuickPanel(HOME_QUICK_PANELS[0]!)
    actions.openQuickPanel(HOME_QUICK_PANELS[1]!)

    expect(push).toHaveBeenNthCalledWith(1, { name: 'resources', query: { sale: 'free' } })
    expect(push).toHaveBeenNthCalledWith(2, { name: 'requirement-hall' })
  })
})
