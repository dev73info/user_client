import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  warnings: vi.fn(),
  posts: vi.fn(),
  disclosures: vi.fn(),
  respondDisclosure: vi.fn(),
  afterSales: vi.fn(),
  inbox: vi.fn(),
  mine: vi.fn(),
  accept: vi.fn(),
  reject: vi.fn(),
  cancel: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ matched: [{ meta: { devArea: true } }] }),
  useRouter: () => ({ push: mocks.push }),
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
vi.mock('@/api/community', () => ({
  listMyCommentWarnings: mocks.warnings,
  listCommunityPosts: mocks.posts,
}))
vi.mock('@/api/conversations', () => ({
  listConversationHistoryDisclosures: mocks.disclosures,
  respondConversationHistoryDisclosure: mocks.respondDisclosure,
}))
vi.mock('@/api/afterSales', () => ({
  listMyAfterSalesCases: mocks.afterSales,
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
import type { NotificationCard } from '@/shared/notifications'
import NotificationCenterView from '@/views/NotificationCenterView.vue'

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
  return shallowMount(NotificationCenterView, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        WorkbenchBarSlot: { name: 'WorkbenchBarSlot', template: '<div><slot /></div>' },
        // 卡片一行是拆出去的构件（R047）：这里要它真渲染，否则断言不到卡片上的标题与类别
        NotificationCardItem: false,
      },
    },
  })
}

type ViewState = {
  cards: NotificationCard[]
  pendingActions: number
  respondTransfer: (card: NotificationCard, accepted: boolean) => Promise<void>
  cancelTransfer: (card: NotificationCard) => Promise<void>
}

function state(wrapper: VueWrapper): ViewState {
  return (wrapper.vm.$ as unknown as { setupState: ViewState }).setupState
}

describe('系统通知：资源过户', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.warnings.mockResolvedValue([])
    mocks.posts.mockResolvedValue([])
    mocks.disclosures.mockResolvedValue([])
    mocks.afterSales.mockResolvedValue({ items: [] })
    mocks.inbox.mockResolvedValue([
      transfer({ transfer_id: 1, resource_name: '待办资源' }),
      transfer({ transfer_id: 2, resource_name: '第二条', message: '请查收' }),
    ])
    mocks.mine.mockResolvedValue([
      transfer({ transfer_id: 10, resource_name: '已发起的资源', to_user: 'dev_other' }),
    ])
    mocks.accept.mockResolvedValue({})
    mocks.reject.mockResolvedValue({})
    mocks.cancel.mockResolvedValue({})
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    )
  })

  it('挂载后把「待我同意」与「我发起的」合并进通知列表', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.inbox).toHaveBeenCalledTimes(1)
    expect(mocks.mine).toHaveBeenCalledTimes(1)

    const view = state(wrapper)
    // 两份列表都并进了通知列表：inbox 两条各给「同意接收 / 拒绝」，我发起的那条给「撤销申请」。
    const transferCards = view.cards.filter((card) => card.kind === 'resource-transfer')
    expect(transferCards).toHaveLength(3)
    expect(transferCards.filter((card) => card.transferAction === 'respond')).toHaveLength(2)
    expect(transferCards.filter((card) => card.transferAction === 'cancel')).toHaveLength(1)
    expect(view.pendingActions).toBe(2)

    expect(wrapper.text()).toContain('资源过户')
    expect(wrapper.text()).toContain('接收资源「待办资源」')
    expect(wrapper.text()).toContain('接收资源「第二条」')
    expect(wrapper.text()).toContain('转出资源「已发起的资源」')
    expect(wrapper.findAll('.notifications-card')).toHaveLength(3)
    wrapper.unmount()
  })

  it('同意：调 accept 并刷新过户列表', async () => {
    const wrapper = mountView()
    await flushPromises()

    const card = state(wrapper).cards.find((item) => item.transferAction === 'respond')!
    await state(wrapper).respondTransfer(card, true)
    await flushPromises()

    expect(mocks.accept).toHaveBeenCalledWith('test-token', 1)
    expect(mocks.reject).not.toHaveBeenCalled()
    expect(mocks.inbox).toHaveBeenCalledTimes(2)
    expect(mocks.mine).toHaveBeenCalledTimes(2)
    expect(mocks.toast).toHaveBeenCalledWith('已同意过户，资源已转入你的资源项目', 'success')
    wrapper.unmount()
  })

  it('拒绝：调 reject，列表照样刷新', async () => {
    const wrapper = mountView()
    await flushPromises()

    const card = state(wrapper).cards.find((item) => item.transferAction === 'respond')!
    await state(wrapper).respondTransfer(card, false)
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

    const card = state(wrapper).cards.find((item) => item.transferAction === 'respond')!
    await state(wrapper).respondTransfer(card, true)
    await flushPromises()

    expect(mocks.toast).toHaveBeenCalledWith('该过户申请已被处理', 'error')
    expect(mocks.inbox).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('撤销：调 cancel 后刷新列表', async () => {
    const wrapper = mountView()
    await flushPromises()

    const card = state(wrapper).cards.find((item) => item.transferAction === 'cancel')!
    await state(wrapper).cancelTransfer(card)
    await flushPromises()

    expect(mocks.cancel).toHaveBeenCalledWith('test-token', 10)
    expect(mocks.inbox).toHaveBeenCalledTimes(2)
    expect(mocks.toast).toHaveBeenCalledWith('过户申请已撤销，资源归属保持不变', 'success')
    wrapper.unmount()
  })

  it('撤销失败（404 已不存在）：透出提示并刷新', async () => {
    mocks.cancel.mockRejectedValue(new HttpError(404, ''))
    const wrapper = mountView()
    await flushPromises()

    const card = state(wrapper).cards.find((item) => item.transferAction === 'cancel')!
    await state(wrapper).cancelTransfer(card)
    await flushPromises()

    expect(mocks.toast).toHaveBeenCalledWith('过户申请不存在或已被删除', 'error')
    expect(mocks.inbox).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
