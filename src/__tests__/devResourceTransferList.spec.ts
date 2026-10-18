import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  listResources: vi.fn(),
  inbox: vi.fn(),
  mine: vi.fn(),
  accept: vi.fn(),
  reject: vi.fn(),
  cancel: vi.fn(),
  tagTree: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, resolve: () => ({ href: '/' }) }),
  useRoute: () => ({ params: {}, query: {} }),
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    token: 'test-token',
    username: 'dev_flow_03562487',
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
vi.mock('@/api/mcResources', () => ({
  listMcResources: mocks.listResources,
  createMcResourceVersion: vi.fn(),
  deleteMcResource: vi.fn(),
  updateMcResourceHomepage: vi.fn(),
  applyResourcePromoCard: vi.fn(),
}))
vi.mock('@/api/points', () => ({
  listMyPromoCards: vi.fn(),
  getResourcePromoMeta: vi.fn(),
  promoCardLabel: (code: string) => code,
}))
vi.mock('@/api/resourceTags', () => ({
  getProcessedTagTree: mocks.tagTree,
  getResourceDetailSlug: () => 'slug',
}))
vi.mock('@/api/resourceTransfers', () => ({
  listMyResourceTransferInbox: mocks.inbox,
  listMyResourceTransfers: mocks.mine,
  acceptResourceTransfer: mocks.accept,
  rejectResourceTransfer: mocks.reject,
  cancelResourceTransfer: mocks.cancel,
}))

import { HttpError } from '@/api/http'
import type { ResourceTransferPayload } from '@/api/resourceTransfers'
import DevResourceListView from '@/views/DevResourceListView.vue'

function transfer(part: Partial<ResourceTransferPayload> = {}): ResourceTransferPayload {
  return {
    transfer_id: 1,
    resource_id: 100,
    resource_name: '待办资源',
    from_user: 'client_flow_03562487',
    from_team_id: null,
    from_team_name: null,
    to_user: 'dev_flow_03562487',
    to_team_id: null,
    to_team_name: null,
    status: 'pending',
    message: null,
    from_ownership_type: 'individual',
    initiated_at: '2026-10-11 09:00:00',
    responded_at: null,
    responded_by: null,
    cancelled_at: null,
    ...part,
  }
}

function mountView(): VueWrapper {
  return shallowMount(DevResourceListView, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        // 只让卡片渲染默认插槽，把过户列表的 DOM 露出来；其余 ui_73info 组件保持默认桩，
        // 这样表格里带 `#default="scope"` 的作用域插槽不会被调用（桩拿不到 scope 会报错）。
        TCard: { name: 'TCard', template: '<div><slot /></div>' },
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  })
}

type ViewState = {
  transferInbox: ResourceTransferPayload[]
  myTransfers: ResourceTransferPayload[]
  transferInboxCount: number
  transferTab: 'inbox' | 'mine'
  loadTransfers: () => Promise<void>
  respondTransfer: (item: ResourceTransferPayload, accepted: boolean) => Promise<void>
  cancelTransferApply: (item: ResourceTransferPayload) => Promise<void>
}

function state(wrapper: VueWrapper): ViewState {
  return (wrapper.vm.$ as unknown as { setupState: ViewState }).setupState
}

describe('DevResourceListView：待我同意的过户列表', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tagTree.mockResolvedValue({ roots: [] })
    mocks.listResources.mockResolvedValue([])
    mocks.inbox.mockResolvedValue([
      transfer({ transfer_id: 1, resource_name: '待办资源' }),
      transfer({ transfer_id: 2, resource_name: '第二条', message: '请查收' }),
    ])
    mocks.mine.mockResolvedValue([])
    mocks.accept.mockResolvedValue({})
    mocks.reject.mockResolvedValue({})
    mocks.cancel.mockResolvedValue({})
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('挂载后渲染待办条目，并显示条数徽标', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.inbox).toHaveBeenCalledTimes(1)
    expect(mocks.mine).toHaveBeenCalledTimes(1)

    const view = state(wrapper)
    expect(view.transferInbox).toHaveLength(2)
    expect(view.transferInboxCount).toBe(2)
    expect(wrapper.findAll('.dev-transfer-item')).toHaveLength(2)
    expect(wrapper.text()).toContain('待办资源')
    expect(wrapper.text()).toContain('第二条')
    wrapper.unmount()
  })

  it('同意：调 accept 并刷新待办与资源列表', async () => {
    const wrapper = mountView()
    await flushPromises()

    const item = state(wrapper).transferInbox[0]!
    await state(wrapper).respondTransfer(item, true)
    await flushPromises()

    expect(mocks.accept).toHaveBeenCalledWith('test-token', 1)
    expect(mocks.reject).not.toHaveBeenCalled()
    // 同意后资源换主：两份过户列表 + 资源列表都要重新拉
    expect(mocks.inbox).toHaveBeenCalledTimes(2)
    expect(mocks.mine).toHaveBeenCalledTimes(2)
    expect(mocks.listResources).toHaveBeenCalledTimes(2)
    expect(mocks.toast).toHaveBeenCalledWith('已同意过户，资源已转入你的资源项目', 'success')
    wrapper.unmount()
  })

  it('拒绝：调 reject，资源不动，列表照样刷新', async () => {
    const wrapper = mountView()
    await flushPromises()

    const item = state(wrapper).transferInbox[0]!
    await state(wrapper).respondTransfer(item, false)
    await flushPromises()

    expect(mocks.reject).toHaveBeenCalledWith('test-token', 1)
    expect(mocks.accept).not.toHaveBeenCalled()
    expect(mocks.inbox).toHaveBeenCalledTimes(2)
    expect(mocks.toast).toHaveBeenCalledWith('已拒绝该过户申请', 'success')
    wrapper.unmount()
  })

  it('同意已被处理（409）：透出后端中文说明并刷新列表', async () => {
    mocks.accept.mockRejectedValue(new HttpError(409, '该过户申请已被处理'))
    const wrapper = mountView()
    await flushPromises()

    await state(wrapper).respondTransfer(state(wrapper).transferInbox[0]!, true)
    await flushPromises()

    expect(mocks.toast).toHaveBeenCalledWith('该过户申请已被处理', 'error')
    expect(mocks.inbox).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})

describe('DevResourceListView：我发起的过户与撤销', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tagTree.mockResolvedValue({ roots: [] })
    mocks.listResources.mockResolvedValue([])
    mocks.inbox.mockResolvedValue([])
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('只有 pending 的申请显示撤销按钮', async () => {
    mocks.mine.mockResolvedValue([
      transfer({ transfer_id: 10, status: 'pending' }),
      transfer({ transfer_id: 11, status: 'accepted' }),
      transfer({ transfer_id: 12, status: 'rejected' }),
    ])

    const wrapper = mountView()
    await flushPromises()

    state(wrapper).transferTab = 'mine'
    await flushPromises()

    expect(wrapper.findAll('.dev-transfer-item')).toHaveLength(3)
    // 一条 pending 才有操作区，已同意 / 已拒绝都不给撤销
    expect(wrapper.findAll('.dev-transfer-item__actions')).toHaveLength(1)
    wrapper.unmount()
  })

  it('撤销：调 cancel 后刷新列表', async () => {
    mocks.mine.mockResolvedValue([transfer({ transfer_id: 10, status: 'pending' })])

    const wrapper = mountView()
    await flushPromises()

    await state(wrapper).cancelTransferApply(state(wrapper).myTransfers[0]!)
    await flushPromises()

    expect(mocks.cancel).toHaveBeenCalledWith('test-token', 10)
    expect(mocks.inbox).toHaveBeenCalledTimes(2)
    expect(mocks.toast).toHaveBeenCalledWith('过户申请已撤销，资源归属保持不变', 'success')
    wrapper.unmount()
  })

  it('撤销失败（404 已不存在）：透出提示并刷新', async () => {
    mocks.mine.mockResolvedValue([transfer({ transfer_id: 10, status: 'pending' })])
    mocks.cancel.mockRejectedValue(new HttpError(404, ''))

    const wrapper = mountView()
    await flushPromises()

    await state(wrapper).cancelTransferApply(state(wrapper).myTransfers[0]!)
    await flushPromises()

    expect(mocks.toast).toHaveBeenCalledWith('过户申请不存在或已被删除', 'error')
    expect(mocks.inbox).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
