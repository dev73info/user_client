import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RequirementHallView from '@/views/RequirementHallView.vue'

const mocks = vi.hoisted(() => ({
  spotlights: vi.fn(),
  overview: vi.fn(),
  toast: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    resolve: () => ({ fullPath: '/requirement-hall' }),
  }),
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: '', isAuthed: false, username: '', hydrate: vi.fn() }),
}))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ showToast: mocks.toast }) }))
vi.mock('@/utils/seo', () => ({ setSeoMeta: vi.fn(), resetSeoMeta: vi.fn() }))
vi.mock('@/api/realname', () => ({ getMyRealnameVerification: vi.fn() }))
vi.mock('@/api/requirements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/requirements')>()),
  createRequirement: vi.fn(),
  getWorkbenchRequirementHallItem: vi.fn(),
  listPublicRequirementSpotlights: mocks.spotlights,
  getPublicRequirementOverview: mocks.overview,
}))

// 公开接口返回分页对象：{ total, page, page_size, items }。
const PAGE_SIZE = 20

function spotlightPage(page: number, total: number) {
  return {
    total,
    page,
    page_size: PAGE_SIZE,
    items: [
      {
        requirement_id: `req-page-${page}`,
        title: `第 ${page} 页需求`,
        description: '描述',
        acceptance_criteria: '验收标准',
        budget: 1000,
        payment_mode: 'platform_guarantee' as const,
        status: 'pending_deposit' as const,
        created_at: '2026-09-12T00:00:00Z',
        updated_at: '2026-09-12T00:00:00Z',
      },
    ],
  }
}

function mountHall() {
  return shallowMount(RequirementHallView, {
    global: {
      config: { warnHandler: () => {} },
      directives: { loading: {} },
      stubs: {
        ElIcon: { template: '<span><slot /></span>' },
        ElPagination: {
          name: 'ElPagination',
          props: ['currentPage', 'pageSize', 'total'],
          emits: ['current-change'],
          template: `<button class="pager-next" @click="$emit('current-change', 2)" />`,
        },
      },
    },
  })
}

function setupState(wrapper: ReturnType<typeof mountHall>): Record<string, unknown> {
  return (wrapper.vm.$ as unknown as { setupState: Record<string, unknown> }).setupState
}

describe('requirement hall pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.spotlights.mockResolvedValue(spotlightPage(1, 25))
    mocks.overview.mockResolvedValue({ total_orders: 1, positive_rate: 100, recent_deals: [] })
  })

  it('按默认每页 20 条拉第一页，并用后端 total 展示总数', async () => {
    const wrapper = mountHall()
    await flushPromises()

    expect(mocks.spotlights).toHaveBeenCalledWith(1, PAGE_SIZE)

    const state = setupState(wrapper)
    expect(state.hallTotal).toBe(25)
    expect(state.hallPage).toBe(1)
    expect(state.requirements as unknown[]).toHaveLength(1)

    wrapper.unmount()
  })

  it('翻页时按新页码重新请求并替换列表', async () => {
    const wrapper = mountHall()
    await flushPromises()

    mocks.spotlights.mockResolvedValue(spotlightPage(2, 25))
    await wrapper.find('.pager-next').trigger('click')
    await flushPromises()

    expect(mocks.spotlights).toHaveBeenLastCalledWith(2, PAGE_SIZE)

    const state = setupState(wrapper)
    expect(state.hallPage).toBe(2)
    expect((state.requirements as { requirement_id: string }[])[0]?.requirement_id).toBe('req-page-2')

    wrapper.unmount()
  })
})
