import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * R047：资源列表页拆分后的最小挂载烟测。
 *
 * 拆分前这个视图 1,017 行，只有「发布资源入口分两条」一处用例（见 devResourceCreateEntry.spec.ts）；
 * 列表渲染条数、筛选与分页的切片口径、三个动作带出去的请求实参都没有用例兜着。
 * 这里按仓里既有的写法：shallowMount + setupState 调函数，子组件靠 props 读切片结果
 * （与 fundRecords.spec.ts 断言表尾分页同一套路）。
 */
const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  confirm: vi.fn(),
  push: vi.fn(),
  listResources: vi.fn(),
  listVersions: vi.fn(),
  updateHomepage: vi.fn(),
  submitReview: vi.fn(),
  deleteResource: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), resolve: () => ({ href: '/' }) }),
  useRoute: () => ({ params: {}, query: {} }),
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: 'test-token', username: 'dev_flow_03562487', hydrate: vi.fn() }),
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
    TMessageBox: { ...actual.TMessageBox, confirm: mocks.confirm },
  }
})
vi.mock('@/api/mcResources', () => ({
  listMcResources: mocks.listResources,
  listMcResourceVersions: mocks.listVersions,
  updateMcResourceHomepage: mocks.updateHomepage,
  submitMcResourceReview: mocks.submitReview,
  deleteMcResource: mocks.deleteResource,
  createMcResourceVersion: vi.fn(),
  applyResourcePromoCard: vi.fn(),
}))

import type { McResourcePayload } from '@/api/mcResources'
import { RESOURCE_ARCHIVE_LOCKED_MESSAGE } from '@/shared/resourcePresentation'
import { resourceFixture } from './devResourceHomepageFixtures'
import { mountList, resourceRows, state, table } from './devResourceListViewHelpers'

describe('DevResourceListView：列表、筛选与分页', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.confirm.mockResolvedValue(true)
    mocks.listResources.mockResolvedValue(resourceRows())
    mocks.listVersions.mockResolvedValue([])
  })

  it('挂载后按 token 拉列表，团队资源滤掉，首页只渲染一页', async () => {
    const wrapper = mountList()
    await flushPromises()

    expect(mocks.listResources).toHaveBeenCalledWith('test-token')
    expect(state(wrapper).totalCount).toBe(12)
    expect(table(wrapper).props('rows')).toHaveLength(10)
    expect(table(wrapper).props('emptyText')).toBe('当前还没有资源记录')
    wrapper.unmount()
  })

  it('零买断价普通资源读取当前单版本价并传给表格', async () => {
    mocks.listResources.mockResolvedValue([
      resourceFixture({
        id: 22,
        ownership_type: 'individual',
        buyout_price_fen: 0,
        price_points: 0,
        resource_kind: 'normal',
      }),
    ])
    mocks.listVersions.mockResolvedValue([{ id: 1, is_current: true, price_fen: 100 }])
    const wrapper = mountList()
    await flushPromises()

    expect(mocks.listVersions).toHaveBeenCalledWith('test-token', 22)
    expect(table(wrapper).props('versionPrices')).toEqual({ 22: 100 })
    wrapper.unmount()
  })

  it('筛选在前端切片，筛选一变回到第 1 页', async () => {
    const wrapper = mountList()
    await flushPromises()
    const view = state(wrapper)

    // 先翻到第 2 页：12 条按每页 10 条切片，第 2 页只剩 2 条
    view.page = 2
    await flushPromises()
    expect(table(wrapper).props('rows')).toHaveLength(2)

    // 状态筛选：3 条公开，且页码回到 1（否则第 2 页会直接看到空表）
    view.filters.visibility = 'published'
    await flushPromises()
    expect(view.page).toBe(1)
    expect(table(wrapper).props('rows')).toHaveLength(3)
    expect(
      table(wrapper)
        .props('rows')
        .map((row: McResourcePayload) => row.id),
    ).toEqual([1000, 1001, 1002])

    // 关键词比标题 / 描述，忽略大小写与首尾空白
    view.filters.visibility = ''
    view.filters.keyword = '  示例资源 11 '
    await flushPromises()
    expect(
      table(wrapper)
        .props('rows')
        .map((row: McResourcePayload) => row.id),
    ).toEqual([1011])
    expect(table(wrapper).props('emptyText')).toBe('没有符合筛选条件的资源')

    /* 这条是 useClientPagination 兜底不到的情形：每页 5 条、先停在第 2 页，
       再筛到 6 条（正好还容得下第 2 页），越界兜底不会回第 1 页——
       回不回得去只取决于「筛选一变就 resetPage」。 */
    view.filters.keyword = ''
    await flushPromises()
    view.pageSize = 5
    view.page = 2
    await flushPromises()
    expect(view.page).toBe(2)
    view.filters.visibility = 'draft'
    await flushPromises()
    expect(view.page).toBe(1)
    expect(
      table(wrapper)
        .props('rows')
        .map((row: McResourcePayload) => row.id),
    ).toEqual([1003, 1004, 1005, 1006, 1007])
    wrapper.unmount()
  })

  it('点行 / 点标题都走同一个编辑入口', async () => {
    const wrapper = mountList()
    await flushPromises()

    state(wrapper).openEditHomepagePage(state(wrapper).paged[0] as McResourcePayload)
    expect(mocks.push).toHaveBeenLastCalledWith({
      name: 'dev-resource-homepage-edit',
      params: { resourceId: 1000 },
    })
    wrapper.unmount()
  })
})

describe('DevResourceListView：动作的请求实参', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.confirm.mockResolvedValue(true)
    mocks.listResources.mockResolvedValue(resourceRows())
    mocks.listVersions.mockResolvedValue([])
  })

  it('申请公开走契约的 submit-review 端点（不再 PATCH 整页字段），并重拉列表', async () => {
    const wrapper = mountList()
    await flushPromises()
    const view = state(wrapper)
    const target = view.resources[3] as McResourcePayload

    view.handleResourceCommand({ action: 'request-review', resource: target })
    await flushPromises()

    // 审核是动作端点：只发资源编号，可见性由后端从 draft/rejected → review
    expect(mocks.submitReview).toHaveBeenCalledWith('test-token', target.id)
    expect(mocks.updateHomepage).not.toHaveBeenCalled()
    // 提交成功后重拉一次（挂载时那次 + 这次）
    expect(mocks.listResources).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('驳回资源可以重新申请公开', async () => {
    const target = resourceFixture({
      id: 3101,
      ownership_type: 'individual',
      visibility: 'rejected',
      copyright_declared: true,
    })
    mocks.listResources.mockResolvedValue([target])
    const wrapper = mountList()
    await flushPromises()

    state(wrapper).handleResourceCommand({ action: 'request-review', resource: target })
    await flushPromises()

    expect(mocks.submitReview).toHaveBeenCalledWith('test-token', 3101)
    expect(mocks.updateHomepage).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('有付费版本但未声明版权时先回到主页确认，不提交审核', async () => {
    const target = resourceFixture({
      id: 3102,
      ownership_type: 'individual',
      visibility: 'draft',
      buyout_price_fen: 0,
      price_points: 0,
      copyright_declared: false,
    })
    mocks.listResources.mockResolvedValue([target])
    mocks.listVersions.mockResolvedValue([{ id: 501, price_fen: 500 }])
    const wrapper = mountList()
    await flushPromises()

    state(wrapper).handleResourceCommand({ action: 'request-review', resource: target })
    await flushPromises()

    expect(mocks.listVersions).toHaveBeenCalledWith('test-token', 3102)
    expect(mocks.submitReview).not.toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith({
      name: 'dev-resource-homepage-edit',
      params: { resourceId: '3102' },
    })
    expect(mocks.toast).toHaveBeenCalledWith(
      '付费资源须先在「编辑主页」勾选版权声明，再申请公开',
      'warning',
    )
    wrapper.unmount()
  })

  it('删除先二次确认，再按 token + id 删除，成功后从内存里摘掉这一行（不重拉）', async () => {
    const wrapper = mountList()
    await flushPromises()
    const view = state(wrapper)
    const target = view.resources[0] as McResourcePayload

    view.handleResourceCommand({ action: 'delete', resource: target })
    await flushPromises()

    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    expect(mocks.deleteResource).toHaveBeenCalledWith('test-token', target.id)
    expect(view.resources.map((row) => row.id)).not.toContain(target.id)
    expect(view.totalCount).toBe(11)
    expect(mocks.listResources).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('R014：需求已锁定 / 已清除的资源，申请公开被拦下且不发请求', async () => {
    const wrapper = mountList()
    await flushPromises()
    const view = state(wrapper)
    const locked = resourceFixture({
      id: 3100,
      ownership_type: 'individual',
      requirement_archive_locked: true,
    })

    view.handleResourceCommand({ action: 'request-review', resource: locked })
    await flushPromises()

    expect(mocks.updateHomepage).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith(RESOURCE_ARCHIVE_LOCKED_MESSAGE, 'warning')
    wrapper.unmount()
  })
})
