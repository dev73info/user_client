import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'
import type { PurchaseTransfer } from '@/api/resourcePurchaseTransfers'
import type { ResourceTransfer } from '@/api/resourceTransfers'
import PurchaseTransferDialog from '@/components/payment/PurchaseTransferDialog.vue'
import { canTransferPurchase } from '@/shared/resourceTransfer'
import PurchaseTransfersView from '@/views/PurchaseTransfersView.vue'

const mocks = vi.hoisted(() => ({
  resourceIncoming: vi.fn(),
  resourceOutgoing: vi.fn(),
  purchaseIncoming: vi.fn(),
  purchaseOutgoing: vi.fn(),
  acceptResource: vi.fn(),
  rejectResource: vi.fn(),
  cancelResource: vi.fn(),
  acceptPurchase: vi.fn(),
  rejectPurchase: vi.fn(),
  cancelPurchase: vi.fn(),
  initiate: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
const auth = reactive({ token: 'buyer-token', username: 'buyer' })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/api/resourceTransfers', () => ({
  listMyResourceTransferInbox: mocks.resourceIncoming,
  listMyResourceTransfers: mocks.resourceOutgoing,
  acceptResourceTransfer: mocks.acceptResource,
  rejectResourceTransfer: mocks.rejectResource,
  cancelResourceTransfer: mocks.cancelResource,
}))
vi.mock('@/api/resourcePurchaseTransfers', () => ({
  listIncomingPurchaseTransfers: mocks.purchaseIncoming,
  listOutgoingPurchaseTransfers: mocks.purchaseOutgoing,
  acceptPurchaseTransfer: mocks.acceptPurchase,
  rejectPurchaseTransfer: mocks.rejectPurchase,
  cancelPurchaseTransfer: mocks.cancelPurchase,
  initiatePurchaseTransfer: mocks.initiate,
}))
vi.mock('ui_73info', () => ({
  Refresh: { template: '<span />' },
  TIcon: { template: '<span><slot /></span>' },
  TAlert: { template: '<div><slot /></div>' },
  TForm: { template: '<form><slot /></form>' },
  TFormItem: { template: '<label><slot /></label>' },
  TTag: { template: '<span><slot /></span>' },
  TButton: {
    props: ['disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  TDialog: {
    props: ['open'],
    template: '<div v-if="open"><slot /><slot name="footer" /></div>',
  },
  TInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  TMessage: { success: mocks.success, error: mocks.error, warning: vi.fn() },
  TMessageBox: { confirm: mocks.confirm },
}))

function resourceTransfer(): ResourceTransfer {
  return {
    transfer_id: 3,
    resource_id: 12,
    resource_name: '待接收资源',
    from_user: 'seller',
    from_team_id: null,
    from_team_name: null,
    to_user: 'buyer',
    to_team_id: null,
    to_team_name: null,
    status: 'pending',
    message: null,
    from_ownership_type: 'individual',
    initiated_at: '2026-10-27 10:00:00',
    responded_at: null,
    responded_by: null,
    cancelled_at: null,
  }
}

function purchaseTransfer(): PurchaseTransfer {
  return {
    transfer_id: 7,
    order_no: 'RPO-TRANSFER',
    resource_id: 20,
    resource_title: '接口资源',
    from_username: 'buyer',
    to_username: 'receiver',
    status: 'pending',
    message: null,
    initiated_at: '2026-10-27 10:00:00',
    responded_at: null,
    responded_by: null,
    cancelled_at: null,
  }
}

function button(wrapper: VueWrapper, text: string) {
  const result = wrapper.findAll('button').find((item) => item.text() === text)
  expect(result).toBeDefined()
  return result!
}

let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.clearAllMocks()
  auth.token = 'buyer-token'
  mocks.resourceIncoming.mockResolvedValue([resourceTransfer()])
  mocks.resourceOutgoing.mockResolvedValue([])
  mocks.purchaseIncoming.mockResolvedValue([])
  mocks.purchaseOutgoing.mockResolvedValue([purchaseTransfer()])
  mocks.confirm.mockResolvedValue(true)
  mocks.initiate.mockResolvedValue(purchaseTransfer())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('统一过户申请中心', () => {
  it('接受资源过户后重新加载真实列表', async () => {
    mocks.acceptResource.mockResolvedValue({ ...resourceTransfer(), status: 'accepted' })
    wrapper = mount(PurchaseTransfersView, {
      global: { stubs: { WorkbenchBarSlot: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('待接收资源')
    await button(wrapper, '接受').trigger('click')
    await flushPromises()
    expect(mocks.acceptResource).toHaveBeenCalledWith('buyer-token', 3)
    expect(mocks.resourceIncoming).toHaveBeenCalledTimes(2)
  })

  it('订单页可撤销发出的申请，读取失败可重试', async () => {
    wrapper = mount(PurchaseTransfersView, {
      global: { stubs: { WorkbenchBarSlot: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()
    await button(wrapper, '订单使用权转移').trigger('click')
    await button(wrapper, '撤销').trigger('click')
    await flushPromises()
    expect(mocks.cancelPurchase).toHaveBeenCalledWith('buyer-token', 7)
    expect(mocks.cancelResource).not.toHaveBeenCalled()

    mocks.purchaseIncoming.mockRejectedValueOnce(new Error('服务暂不可用'))
    await wrapper.get('[aria-label="刷新过户申请"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('服务暂不可用')
    await button(wrapper, '重试').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('订单使用权转移弹窗', () => {
  it('只有有效的 OAuth 已支付订单可以进入转移', () => {
    const order = { source_kind: 'oauth', status: 'paid', entitlement_revoked: false }
    expect(canTransferPurchase(order as ResourcePurchaseOrder)).toBe(true)
    expect(
      canTransferPurchase({ ...order, source_kind: 'platform' } as ResourcePurchaseOrder),
    ).toBe(false)
    expect(
      canTransferPurchase({ ...order, entitlement_revoked: true } as ResourcePurchaseOrder),
    ).toBe(false)
  })

  it('提交真实订单号与接收方，失败时不关闭弹窗', async () => {
    const order = {
      order_no: 'RPO-TRANSFER',
      resource_id: 20,
      resource_title: '接口资源',
    } as ResourcePurchaseOrder
    wrapper = mount(PurchaseTransferDialog, {
      props: { open: true, token: 'buyer-token', order },
    })
    await wrapper.get('input').setValue('receiver')
    await button(wrapper, '发送申请').trigger('click')
    await flushPromises()
    expect(mocks.initiate).toHaveBeenCalledWith('buyer-token', 'RPO-TRANSFER', {
      to_username: 'receiver',
      message: null,
    })
    expect(wrapper.emitted('submitted')).toHaveLength(1)

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    const closeEventCount = wrapper.emitted('update:open')?.length ?? 0
    mocks.initiate.mockRejectedValueOnce(new Error('接收方尚未绑定开发者站点账号'))
    await wrapper.get('input').setValue('receiver')
    await button(wrapper, '发送申请').trigger('click')
    await flushPromises()
    expect(mocks.error).toHaveBeenCalledWith('接收方尚未绑定开发者站点账号')
    expect(wrapper.emitted('update:open')?.length ?? 0).toBe(closeEventCount)
  })
})
