import { flushPromises, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
      // 担保方式下拉与分页器都是规范组件，浅渲染下用下面的桩替换（桩不认识真实类名，
      // 所以「切筛选」「翻页」都由桩自己发事件驱动）。
      stubs: {
        TIcon: { template: '<span><slot /></span>' },
        TPagination: {
          name: 'TPagination',
          props: ['currentPage', 'pageSize', 'total'],
          emits: ['current-change'],
          template: `<button class="pager-next" @click="$emit('current-change', 2)" />`,
        },
        // 「担保方式」筛选是自研 TSelect 下拉（`guaranteeFilter` + `guaranteeOptions`，
        // 换值走 `@update:model-value` → `onGuaranteeFilterChange`）：真组件看不到，
        // 用一个能发 `update:model-value` 的桩驱动它。
        TSelect: {
          name: 'TSelect',
          props: ['modelValue', 'options'],
          emits: ['update:model-value'],
          template: `<button
            class="requirement-hall__guarantee-select"
            @click="$emit('update:model-value', 'platform_guarantee')"
          />`,
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

    // 第三参是 payment_mode：未筛担保方式时为 undefined，公开接口据此不带该参数。
    expect(mocks.spotlights).toHaveBeenCalledWith(1, PAGE_SIZE, undefined)

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

    expect(mocks.spotlights).toHaveBeenLastCalledWith(2, PAGE_SIZE, undefined)

    const state = setupState(wrapper)
    expect(state.hallPage).toBe(2)
    expect((state.requirements as { requirement_id: string }[])[0]?.requirement_id).toBe('req-page-2')

    wrapper.unmount()
  })

  it('切换担保方式筛选时回到第一页，并带上 payment_mode 重新请求', async () => {
    const wrapper = mountHall()
    await flushPromises()

    // 先翻到第二页，确认切筛选会把页码收回第一页。
    mocks.spotlights.mockResolvedValue(spotlightPage(2, 25))
    await wrapper.find('.pager-next').trigger('click')
    await flushPromises()
    expect(mocks.spotlights).toHaveBeenLastCalledWith(2, PAGE_SIZE, undefined)

    mocks.spotlights.mockResolvedValue(spotlightPage(1, 8))
    await wrapper.find('.requirement-hall__guarantee-select').trigger('click')
    await flushPromises()

    expect(mocks.spotlights).toHaveBeenLastCalledWith(1, PAGE_SIZE, 'platform_guarantee')

    const state = setupState(wrapper)
    expect(state.hallPage).toBe(1)
    expect(state.hallTotal).toBe(8)

    wrapper.unmount()
  })
})

// 上面用 mock 替换了 listPublicRequirementSpotlights，这里走真实实现，
// 守住「不筛时不带 payment_mode、筛电签担保时带 payment_mode=platform_guarantee」这条口径。
describe('公开精选列表的请求参数（真实实现）', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ total: 0, page: 1, page_size: PAGE_SIZE, items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function spotlightRequestUrl(paymentMode?: 'platform_guarantee' | 'self_managed') {
    const { listPublicRequirementSpotlights } = await vi.importActual<
      typeof import('@/api/requirements')
    >('@/api/requirements')
    await listPublicRequirementSpotlights(1, PAGE_SIZE, paymentMode)
    const calls = fetchMock.mock.calls
    return String(calls[calls.length - 1]?.[0])
  }

  it('不筛担保方式时请求里不带 payment_mode', async () => {
    const url = await spotlightRequestUrl()
    expect(url).toContain('page=1')
    expect(url).toContain(`page_size=${PAGE_SIZE}`)
    expect(url).not.toContain('payment_mode')
  })

  it('筛选电签担保时请求里带 payment_mode=platform_guarantee', async () => {
    const url = await spotlightRequestUrl('platform_guarantee')
    expect(url).toContain('payment_mode=platform_guarantee')
  })
})
