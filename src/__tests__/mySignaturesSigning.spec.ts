import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import MySignaturesView from '@/views/MySignaturesView.vue'
import UserWorkbenchView from '@/views/UserWorkbenchView.vue'
import ContractSignView from '@/views/ContractSignView.vue'
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

describe('signature detail', () => {
  it('loads the exact contract without creating a developer agreement', async () => {
    mocks.detail.mockResolvedValue({
      ...base,
      template_name: 'developer_agreement',
      status: CONTRACT_STATUS.signed,
      content: '正文',
      content_sha256: 'abc',
      signing_logs: [],
    })
    const { wrapper, router } = await render(ContractSignView, true)
    expect(mocks.detail).toHaveBeenCalledWith('test-token', 1)
    expect(mocks.developerAgreement).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('workbench-signature-detail')
    // 已签署的合同不在本地铺正文，改为「查看合同」跳爱签预览页。
    // 这个入口挂在合同信息块右侧（`f1e00cc` 从底部操作栏挪过去的）：底部那条操作栏只放
    // 签署动作，已签署的合同在那里没有可做的事。
    expect(wrapper.find('.contract-content').exists()).toBe(false)
    expect(wrapper.find('.contract-meta .btn-primary').text()).toContain('查看合同')
    expect(wrapper.text()).not.toContain('签署完成，成为开发者')
    wrapper.unmount()
  })
  it('falls back to the local body when asign has no preview for the signed contract', async () => {
    mocks.detail.mockResolvedValue({
      ...base,
      status: CONTRACT_STATUS.signed,
      content: '正文',
      content_sha256: 'abc',
      signing_logs: [],
    })
    mocks.preview.mockResolvedValue('')
    const { wrapper } = await render(ContractSignView, true)
    await wrapper.find('.contract-meta .btn-primary').trigger('click')
    await flushPromises()
    expect(mocks.preview).toHaveBeenCalledWith('test-token', 1)
    expect(wrapper.find('.contract-content').text()).toBe('正文')
    expect(wrapper.text()).toContain('爱签暂未提供该合同的查看页')
    wrapper.unmount()
  })
  it('keeps signing enabled once identity is verified, whatever the notice checkbox says', async () => {
    mocks.detail.mockResolvedValue({
      ...base,
      content: '正文',
      content_sha256: 'abc',
      party_a_real_name: 'Alice',
      party_a_id_card_no_masked: '****1234',
      signing_logs: [],
    })
    mocks.initiate.mockRejectedValue(new Error('签署服务暂不可用'))
    const { wrapper } = await render(ContractSignView, true)
    // 实名信息齐全、当前不在签署中，就应当能点：那个勾选框是「短信通知签署」（是否给签署人发短信），
    // 不是同意条款，拿它置灰按钮会把不发短信的人挡在门外。
    expect(wrapper.find('.contract-actions .btn-primary').attributes('disabled')).toBeUndefined()
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('.contract-actions .btn-primary').trigger('click')
    await flushPromises()
    // 勾了短信通知就按通知走（第三个入参），停在页面上等轮询，不跳爱签签署页。
    expect(mocks.initiate).toHaveBeenCalledWith('test-token', 1, true)
    expect(wrapper.text()).toContain('签署服务暂不可用')
    wrapper.unmount()
  })
  it('lets party A sign the requirement contract before the developer has signed', async () => {
    mocks.detail.mockResolvedValue({
      ...base,
      requirement_id: 'REQ-001',
      content: '正文',
      content_sha256: 'abc',
      party_a_real_name: 'Alice',
      party_a_id_card_no_masked: '****1234',
      signing_logs: [],
    })
    const { wrapper } = await render(ContractSignView, true)
    // 甲乙双方各自独立签署、不设先后（爱签侧同样是无序签约）：乙方还没签，甲方这边就该有签署入口，
    // 只提示「等待您完成客户签署」。此前这里要求甲方等乙方先签，而乙方在爱签签完后本地不落
    // party_b_signed_at，甲方永远签不了——合同也就永远走不到「已签约」。
    expect(wrapper.find('.contract-actions .btn-primary').exists()).toBe(true)
    // 实名信息齐全就能点（未签署 + 非签署中 = 可提交）。
    expect(wrapper.find('.contract-actions .btn-primary').attributes('disabled')).toBeUndefined()
    // 不再出现「等待开发者完成签署」——那是顺序门还在时给甲方的文案。
    expect(wrapper.text()).not.toContain('等待开发者完成签署')
    wrapper.unmount()
  })
  it('leaves the signing page after Asign return once the requirement contract is signed', async () => {
    // 爱签 redirectUrl 固定回 /contract-sign；若签完仍停在原地，用户会感觉「签署后又跳回签署页」。
    // 只有「刚去爱签签过」才离开——用 session 标记模拟回跳。
    sessionStorage.setItem('73info_requirement_sign_pending_return', '1')
    sessionStorage.setItem('73info_requirement_sign_from', 'user')
    mocks.requirementContract.mockResolvedValue({
      ...base,
      id: 9,
      requirement_id: 'REQ-009',
      status: CONTRACT_STATUS.signed,
      content: '正文',
      content_sha256: 'abc',
      signing_logs: [],
    })
    const { router } = await render(
      ContractSignView,
      false,
      '/contract-sign?requirement_id=REQ-009&from=user',
    )
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('workbench-requirements')
    expect(sessionStorage.getItem('73info_requirement_sign_pending_return')).toBeNull()
  })
  it('keeps an already-signed contract detail open when the user opened it on purpose', async () => {
    sessionStorage.removeItem('73info_requirement_sign_pending_return')
    mocks.detail.mockResolvedValue({
      ...base,
      status: CONTRACT_STATUS.signed,
      content: '正文',
      content_sha256: 'abc',
      signing_logs: [],
    })
    const { router } = await render(ContractSignView, true)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('workbench-signature-detail')
  })
})
