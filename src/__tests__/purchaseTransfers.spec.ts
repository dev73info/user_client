import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'

import PurchaseTransfersView from '@/views/PurchaseTransfersView.vue'
import { HttpError } from '@/api/http'
import type { PurchaseTransfer } from '@/api/resourcePurchaseTransfers'

const mocks = vi.hoisted(() => ({
  incoming: vi.fn(),
  outgoing: vi.fn(),
  accept: vi.fn(),
  reject: vi.fn(),
  cancel: vi.fn(),
  confirm: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

const auth = reactive({ token: 'buyer-token', hydrate: vi.fn() })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/workbench/resource-purchases/transfers' }),
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}))
vi.mock('@/api/resourcePurchaseTransfers', () => ({
  listIncomingPurchaseTransfers: mocks.incoming,
  listOutgoingPurchaseTransfers: mocks.outgoing,
  acceptPurchaseTransfer: mocks.accept,
  rejectPurchaseTransfer: mocks.reject,
  cancelPurchaseTransfer: mocks.cancel,
}))
vi.mock('ui_73info', () => ({
  Refresh: { template: '<span />' },
  TIcon: { template: '<span><slot /></span>' },
  TButton: {
    props: ['variant', 'loading', 'disabled'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  TMessage: { success: mocks.success, error: mocks.error },
  TMessageBox: { confirm: mocks.confirm },
}))

function makeTransfer(overrides: Partial<PurchaseTransfer> = {}): PurchaseTransfer {
  return {
    transfer_id: 1,
    order_no: 'RPO-1',
    resource_id: 10,
    resource_title: '接口资源 A',
    from_username: 'shop_from',
    to_username: 'shop_to',
    status: 'pending',
    message: null,
    initiated_at: '2026-10-21 10:00:00',
    responded_at: null,
    responded_by: null,
    cancelled_at: null,
    ...overrides,
  }
}

function mountView(): VueWrapper {
  return mount(PurchaseTransfersView, {
    global: {
      stubs: {
        WorkbenchBarSlot: { template: '<div><slot /></div>' },
      },
    },
  })
}

function buttonByText(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((button) => button.text() === text)
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.token = 'buyer-token'
  mocks.incoming.mockResolvedValue([])
  mocks.outgoing.mockResolvedValue([])
  mocks.confirm.mockResolvedValue(true)
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('PurchaseTransfersView', () => {
  it('renders incoming transfers and accepts one', async () => {
    mocks.incoming.mockResolvedValue([makeTransfer()])
    mocks.accept.mockResolvedValue(makeTransfer({ status: 'accepted' }))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('接口资源 A')
    expect(wrapper.text()).toContain('shop_from')

    await buttonByText(wrapper, '接受')!.trigger('click')
    await flushPromises()

    expect(mocks.confirm).toHaveBeenCalled()
    expect(mocks.accept).toHaveBeenCalledWith('buyer-token', 1)
    expect(mocks.success).toHaveBeenCalled()
  })

  it('cancels an outgoing request', async () => {
    mocks.outgoing.mockResolvedValue([makeTransfer()])
    mocks.cancel.mockResolvedValue(makeTransfer({ status: 'cancelled' }))
    const wrapper = mountView()
    await flushPromises()

    const outgoingTab = buttonByText(wrapper, '我发起的')
    expect(outgoingTab).toBeTruthy()
    await outgoingTab!.trigger('click')
    await flushPromises()

    await buttonByText(wrapper, '撤销')!.trigger('click')
    await flushPromises()

    expect(mocks.cancel).toHaveBeenCalledWith('buyer-token', 1)
  })

  it('shows an empty state', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('没有待确认的申请')
  })

  it('redirects to login on 401', async () => {
    mocks.incoming.mockRejectedValue(new HttpError(401, '未登录'))
    mountView()
    await flushPromises()

    expect(mocks.replace).toHaveBeenCalledWith(expect.objectContaining({ name: 'home' }))
  })
})
