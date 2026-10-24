import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import MySignaturesView from '@/views/MySignaturesView.vue'
import UserWorkbenchView from '@/views/UserWorkbenchView.vue'
import ContractSignView from '@/views/ContractSignView.vue'
import type { MyContractSummary } from '@/api/contracts'
import { CONTRACT_STATUS } from '@/shared/contracts'
import { baseContract, primeSignatureMocks, renderSignatureView } from './helpers/mySignatures'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  realname: vi.fn(),
  detail: vi.fn(),
  developerAgreement: vi.fn(),
  sync: vi.fn(),
  initiate: vi.fn(),
  preview: vi.fn(),
  requirementContract: vi.fn(),
}))
vi.mock('@/api/contracts', () => ({
  listMyContracts: mocks.list,
  fetchMyContract: mocks.detail,
  fetchDeveloperAgreement: mocks.developerAgreement,
  fetchMyRequirementContract: mocks.requirementContract,
  syncAsignSignStatus: mocks.sync,
  initiateAsignSign: mocks.initiate,
  fetchAsignContractPreviewUrl: mocks.preview,
}))
vi.mock('@/api/realname', () => ({ getMyRealnameVerification: mocks.realname }))
vi.mock('@/api/conversations', () => ({
  listRequirementConversations: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/api/team', () => ({ listUserInvitations: vi.fn().mockResolvedValue([]) }))

const base = baseContract
const render = renderSignatureView

beforeEach(() => {
  primeSignatureMocks(mocks)
})

describe('my signatures list', () => {
  it('loads current user contracts and opens the exact contract detail', async () => {
    const { wrapper, router } = await render(MySignaturesView)
    expect(mocks.list).toHaveBeenCalledWith('test-token')
    expect(wrapper.findAll('.wb-item')).toHaveLength(2)
    expect(wrapper.find('.requirement-title strong').text()).toBe('网站服务合同')
    expect(wrapper.find('.requirement-actions').text()).toContain('去签署')
    await wrapper.find('.wb-item').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('workbench-signature-detail')
    expect(router.currentRoute.value.params.contractId).toBe('1')
    wrapper.unmount()
  })
  it('filters by search and status and can clear empty filters', async () => {
    const { wrapper } = await render(MySignaturesView)
    // 下拉筛的是签名态（不是合同状态码）：工具栏第一个 TSelect 是状态，第二个是每页条数。
    const statusSelect = wrapper.findAllComponents({ name: 'TSelect' })[0]!
    await statusSelect.setValue('signed')
    await flushPromises()
    expect(wrapper.findAll('.wb-item')).toHaveLength(1)
    expect(wrapper.find('.wb-item').text()).toContain('已完成合同')
    await wrapper.find('.wb-toolbar__search input').setValue('missing')
    expect(wrapper.text()).toContain('没有符合条件')
    await wrapper.find('.wb-empty__actions button').trigger('click')
    expect(wrapper.findAll('.wb-item')).toHaveLength(2)
    wrapper.unmount()
  })
  it('labels contracts whose state has no signature meaning with the contract status', async () => {
    // 过期（3）/ 拒签（4）/ 撤销（7）在签名态里都落 unavailable，徽标要显示合同状态本身，
    // 不能一律写成「暂不可签署」。
    mocks.list.mockResolvedValueOnce([
      { ...base, id: 11, contract_no: 'HT-011', status: CONTRACT_STATUS.expired },
      { ...base, id: 12, contract_no: 'HT-012', status: CONTRACT_STATUS.rejected },
      { ...base, id: 13, contract_no: 'HT-013', status: CONTRACT_STATUS.revoked },
    ])
    const { wrapper } = await render(MySignaturesView)
    // 它们不在任何一个签名态胶囊里，只能在「全部」下看到。
    expect(wrapper.findAll('.wb-item')).toHaveLength(3)
    const badges = wrapper.findAll('.requirement-summary .wb-badge').map((badge) => badge.text())
    expect(badges).toEqual(['过期', '拒签', '撤销'])
    wrapper.unmount()
  })
  it('shows errors separately from empty results and retries', async () => {
    mocks.list.mockRejectedValueOnce(new Error('网络不可用'))
    const { wrapper } = await render(MySignaturesView)
    expect(wrapper.find('[role="alert"]').text()).toContain('网络不可用')
    expect(wrapper.text()).not.toContain('暂无签署记录')
    await wrapper.find('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.wb-item')).toHaveLength(2)
    wrapper.unmount()
  })
  it('renders empty and loading states without stale records after logout', async () => {
    mocks.list.mockResolvedValueOnce([])
    const { wrapper } = await render(MySignaturesView)
    expect(wrapper.text()).toContain('暂无签署记录')
    let resolve!: (items: MyContractSummary[]) => void
    mocks.list.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await wrapper.find('.wb-strip__action button').trigger('click')
    expect(wrapper.text()).toContain('正在加载签署记录')
    useAuthStore().token = ''
    await flushPromises()
    resolve([base])
    await flushPromises()
    expect(wrapper.findAll('.wb-item')).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('realname-gated menu', () => {
  it.each(['pending', 'rejected'])('hides the menu for %s verification', async (status) => {
    mocks.realname.mockResolvedValue({ status })
    const { wrapper } = await render(UserWorkbenchView)
    expect(wrapper.text()).not.toContain('我的合同')
    wrapper.unmount()
  })
  it('shows and expands the menu after approval, including direct detail entry', async () => {
    const { wrapper } = await render(UserWorkbenchView, true)
    const link = wrapper.find('a[href="/workbench/signatures"]')
    expect(link.exists()).toBe(true)
    expect(link.isVisible()).toBe(true)
    expect(link.classes()).toContain('active')
    useAuthStore().token = ''
    await flushPromises()
    expect(wrapper.text()).not.toContain('我的合同')
    wrapper.unmount()
  })
})
