import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 需求方「我的资源」：只列本人名下、已 claim 的定制交付，
 * 并且行操作收窄到主页 / 公开 / 私有 / 版本（没有售出订单、过户、删除）。
 */
const mocks = vi.hoisted(() => ({
  listResources: vi.fn(),
  listVersions: vi.fn(),
  fee: vi.fn(),
  push: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), resolve: () => ({ href: '/' }) }),
  // 需求方资源页：meta.resourceWorkspace = 'mine' 决定行操作跳工作台路由而不是开发者路由。
  useRoute: () => ({ params: {}, query: {}, meta: { resourceWorkspace: 'mine' } }),
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: 'test-token', username: 'customer', hydrate: vi.fn() }),
}))
vi.mock('@/api/mcResources', () => ({
  listMcResources: mocks.listResources,
  listMcResourceVersions: mocks.listVersions,
  updateMcResourceHomepage: vi.fn(),
  submitMcResourceReview: vi.fn(),
  deleteMcResource: vi.fn(),
  createMcResourceVersion: vi.fn(),
  applyResourcePromoCard: vi.fn(),
}))
vi.mock('@/api/resourceSale', () => ({ getResourceSaleFee: mocks.fee }))

import MyResourcesView from '@/views/MyResourcesView.vue'
import { resourceFixture } from './devResourceHomepageFixtures'

function mountView() {
  return shallowMount(MyResourcesView, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        TCard: { name: 'TCard', template: '<div><slot /></div>' },
        DevResourceListMetaStrip: { name: 'DevResourceListMetaStrip', template: '<div />' },
        DevResourcePublishVersionDialog: {
          name: 'DevResourcePublishVersionDialog',
          template: '<div />',
        },
        DevResourceTable: {
          name: 'DevResourceTable',
          props: [
            'rows',
            'loading',
            'emptyText',
            'requestingReviewId',
            'settingPrivateId',
            'deletingId',
            'coverUrl',
            'versionPrices',
            'platformFeeBps',
            'platformFeeError',
            'visibleActions',
          ],
          template: '<div />',
        },
      },
    },
  })
}

function table(wrapper: ReturnType<typeof mountView>) {
  return wrapper.findComponent({ name: 'DevResourceTable' })
}

describe('MyResourcesView：只管理已 claim 的定制交付', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fee.mockResolvedValue({ platform_fee_bps: 100 })
    mocks.listVersions.mockResolvedValue([])
    mocks.listResources.mockResolvedValue([
      // 普通自建资源：留在开发者工作台
      resourceFixture({ id: 1, ownership_type: 'individual', requirement_id: null }),
      // 绑定需求但未 claim：仍在交付方名下
      resourceFixture({
        id: 2,
        ownership_type: 'individual',
        requirement_id: '2026-1',
        requirement_claimed: false,
      }),
      // 已 claim：应出现在「我的资源」
      resourceFixture({
        id: 3,
        ownership_type: 'individual',
        requirement_id: '2026-1',
        requirement_claimed: true,
      }),
      // 团队资源不进「我的资源」
      resourceFixture({
        id: 4,
        ownership_type: 'team',
        requirement_id: '2026-2',
        requirement_claimed: true,
      }),
      resourceFixture({
        id: 5,
        ownership_type: 'individual',
        requirement_id: '2026-3',
        requirement_claimed: true,
      }),
    ])
  })

  it('列表只保留已 claim 的个人定制交付，并收窄行操作', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.listResources).toHaveBeenCalledWith('test-token')
    const rows = table(wrapper).props('rows') as Array<{ id: number }>
    expect(rows.map((row) => row.id)).toEqual([3, 5])
    expect(table(wrapper).props('visibleActions')).toEqual([
      'publish',
      'request-review',
      'set-private',
      'versions',
    ])
    wrapper.unmount()
  })

  it('编辑主页跳需求方工作台路由（不是开发者资源页）', async () => {
    const wrapper = mountView()
    await flushPromises()

    const view = (
      wrapper.vm.$ as unknown as {
        setupState: { paged: unknown[]; openEditHomepagePage: (resource: unknown) => void }
      }
    ).setupState
    view.openEditHomepagePage(view.paged[0])

    expect(mocks.push).toHaveBeenCalledWith({
      name: 'workbench-resource-homepage-edit',
      params: { resourceId: 3 },
    })
    wrapper.unmount()
  })

  it('全部未 claim 时列表为空，空态按需求方口径写', async () => {
    mocks.listResources.mockResolvedValue([
      resourceFixture({
        id: 9,
        ownership_type: 'individual',
        requirement_id: '2026-9',
        requirement_claimed: false,
      }),
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(table(wrapper).props('rows')).toEqual([])
    expect(table(wrapper).props('emptyText')).toBe('还没有已转为我的资源的定制交付')
    wrapper.unmount()
  })
})
