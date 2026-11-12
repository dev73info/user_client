import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 需求方「我的资源」：只列本人名下、已 claim 的定制交付；
 * 读数格即可见性筛选（全部 / 公开 / 审核中 / 私有），列表换 wb 卡片行。
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

/** 行组件有自己的 spec：这里只留一份能读到 resource 的壳，避免把行内细节测两遍。 */
const MyResourceRowStub = {
  name: 'MyResourceRow',
  props: [
    'resource',
    'versionPrices',
    'platformFeeBps',
    'platformFeeError',
    'requestingReviewId',
    'settingPrivateId',
  ],
  template: '<li class="wb-item" />',
}

const WorkbenchPagerStub = {
  name: 'WorkbenchPager',
  props: ['total', 'unit', 'page', 'pageSize', 'pageSizeAriaLabel', 'paginationAriaLabel'],
  emits: ['update:page', 'update:pageSize'],
  template: '<div class="wb-pager" />',
}

function mountView() {
  return mount(MyResourcesView, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        MyResourceRow: MyResourceRowStub,
        WorkbenchPager: WorkbenchPagerStub,
        DevResourcePublishVersionDialog: {
          name: 'DevResourcePublishVersionDialog',
          template: '<div />',
        },
      },
    },
  })
}

/** 读数格按文案定位（四格：资源总数 / 公开 / 审核中 / 私有）。 */
function filterCell(wrapper: ReturnType<typeof mountView>, label: string) {
  const cell = wrapper
    .findAll('.wb-strip__item--filter')
    .find((item) => item.find('.wb-strip__label').text() === label)
  if (!cell) {
    throw new Error(`读数格「${label}」不存在`)
  }
  return cell
}

function rowIds(wrapper: ReturnType<typeof mountView>) {
  return wrapper
    .findAllComponents({ name: 'MyResourceRow' })
    .map((row) => (row.props('resource') as { id: number }).id)
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
        visibility: 'published',
      }),
    ])
  })

  it('列表只保留已 claim 的个人定制交付', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.listResources).toHaveBeenCalledWith('test-token')
    expect(rowIds(wrapper)).toEqual([3, 5])
    expect(wrapper.findComponent({ name: 'WorkbenchPager' }).props('total')).toBe(2)
    expect(wrapper.findComponent({ name: 'WorkbenchPager' }).props('unit')).toBe('个资源')
    wrapper.unmount()
  })

  it('点读数格把可见性筛选写进 filters.visibility，并与工具栏联动', async () => {
    const wrapper = mountView()
    await flushPromises()

    // 默认「资源总数」高亮，读数来自已滤过的列表
    expect(filterCell(wrapper, '资源总数').attributes('aria-pressed')).toBe('true')
    expect(filterCell(wrapper, '私有').find('.wb-strip__value').text()).toBe('1')
    expect(filterCell(wrapper, '公开').find('.wb-strip__value').text()).toBe('1')

    await filterCell(wrapper, '公开').trigger('click')
    expect(rowIds(wrapper)).toEqual([5])
    expect(filterCell(wrapper, '公开').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('.wb-toolbar__hint').text()).toContain('筛选出 1 / 2 个')

    await filterCell(wrapper, '私有').trigger('click')
    expect(rowIds(wrapper)).toEqual([3])

    await filterCell(wrapper, '审核中').trigger('click')
    expect(rowIds(wrapper)).toEqual([])
    expect(wrapper.find('.wb-empty__title').text()).toBe('没有符合筛选条件的资源')

    await filterCell(wrapper, '资源总数').trigger('click')
    expect(rowIds(wrapper)).toEqual([3, 5])
    wrapper.unmount()
  })

  it('加载中读数显示破折号', async () => {
    let resolve!: (rows: unknown[]) => void
    mocks.listResources.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const wrapper = mountView()
    await flushPromises()

    expect(filterCell(wrapper, '资源总数').find('.wb-strip__value').text()).toBe('—')
    expect(wrapper.text()).toContain('资源列表加载中')

    resolve([])
    await flushPromises()
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

    expect(rowIds(wrapper)).toEqual([])
    expect(wrapper.find('.wb-empty__title').text()).toBe('还没有已转为我的资源的定制交付')
    wrapper.unmount()
  })
})
