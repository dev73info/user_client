import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import MySignaturesView from '@/views/MySignaturesView.vue'
import UserWorkbenchView from '@/views/UserWorkbenchView.vue'
import ContractSignView from '@/views/ContractSignView.vue'
import type { MyContractSummary } from '@/api/contracts'
import { CONTRACT_STATUS } from '@/shared/contracts'

const mocks = vi.hoisted(() => ({
  list: vi.fn(), realname: vi.fn(), detail: vi.fn(), developerAgreement: vi.fn(), sync: vi.fn(),
  initiate: vi.fn(), preview: vi.fn(),
}))
vi.mock('@/api/contracts', () => ({
  listMyContracts: mocks.list, fetchMyContract: mocks.detail,
  fetchDeveloperAgreement: mocks.developerAgreement, fetchMyRequirementContract: vi.fn(),
  syncAsignSignStatus: mocks.sync, initiateAsignSign: mocks.initiate,
  fetchAsignContractPreviewUrl: mocks.preview,
}))
vi.mock('@/api/realname', () => ({ getMyRealnameVerification: mocks.realname }))
vi.mock('@/api/conversations', () => ({ listRequirementConversations: vi.fn().mockResolvedValue([]) }))
vi.mock('@/api/team', () => ({ listUserInvitations: vi.fn().mockResolvedValue([]) }))

const base: MyContractSummary = {
  id: 1, contract_no: 'HT-001', title: '网站服务合同', template_name: 'service', status: CONTRACT_STATUS.signing,
  party_a_name: '甲方公司', party_a_username: 'alice', party_a_signed_at: null,
  party_b_name: '乙方公司', party_b_username: 'bob', party_b_signed_at: null,
  created_at: '2026-09-09 10:00:00',
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'alice'
  auth.profileLoaded = true
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  vi.spyOn(auth, 'initializeSession').mockResolvedValue({ username: 'alice', role: 'user' })
  mocks.realname.mockResolvedValue({ status: 'approved' })
  mocks.list.mockResolvedValue([base, { ...base, id: 2, contract_no: 'HT-002', title: '已完成合同', status: CONTRACT_STATUS.signed }])
  mocks.detail.mockResolvedValue({ ...base, content: '合同正文内容', content_sha256: 'abc', signing_logs: [] })
})

async function render(component: typeof MySignaturesView | typeof UserWorkbenchView | typeof ContractSignView, detail = false) {
  const names = ['workbench', 'workbench-requirements', 'workbench-account',
    'workbench-invoices', 'workbench-points', 'workbench-perks', 'workbench-coupons',
    'workbench-badges', 'workbench-notifications', 'workbench-favorites', 'workbench-invite', 'workbench-teams',
    'workbench-team-resources', 'workbench-tickets', 'dev-resource-list', 'dev-requirement-hall',
    'dev-my-requirements', 'dev-wallet']
  const router = createRouter({ history: createMemoryHistory(), routes: [
    ...names.map((name) => ({ name, path: `/${name}`, component: { template: '<div />' } })),
    { name: 'workbench-signatures', path: '/workbench/signatures', component: MySignaturesView },
    { name: 'workbench-signature-detail', path: '/workbench/signatures/:contractId', component: ContractSignView },
  ] })
  await router.push(detail ? '/workbench/signatures/1' : '/workbench/signatures')
  const wrapper = mount(component, {
    global: { plugins: [router], stubs: { RouterView: true } },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('my signatures list', () => {
  it('loads current user contracts and links to an exact contract ID', async () => {
    const { wrapper } = await render(MySignaturesView)
    expect(mocks.list).toHaveBeenCalledWith('test-token')
    expect(wrapper.findAll('.wb-item')).toHaveLength(2)
    expect(wrapper.find('.wb-item__title').attributes('href')).toBe('/workbench/signatures/1')
    expect(wrapper.find('.wb-item__side').text()).toContain('去签署')
    wrapper.unmount()
  })
  it('filters by search and status and can clear empty filters', async () => {
    const { wrapper } = await render(MySignaturesView)
    // 胶囊组筛的是签名态（不是合同状态码）：下标 0 全部、1 待我签署、2 等待他方、3 已完成。
    await wrapper.findAll('.wb-chip-group button')[3]!.trigger('click')
    expect(wrapper.findAll('.wb-item')).toHaveLength(1)
    expect(wrapper.find('.wb-item').text()).toContain('已完成合同')
    await wrapper.find('input').setValue('missing')
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
    const badges = wrapper.findAll('.wb-badge').map((badge) => badge.text())
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
    mocks.list.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
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

describe('signature detail', () => {
  it('loads the exact contract without creating a developer agreement', async () => {
    mocks.detail.mockResolvedValue({ ...base, template_name: 'developer_agreement', status: CONTRACT_STATUS.signed, content: '正文', content_sha256: 'abc', signing_logs: [] })
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
    mocks.detail.mockResolvedValue({ ...base, status: CONTRACT_STATUS.signed, content: '正文', content_sha256: 'abc', signing_logs: [] })
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
    mocks.detail.mockResolvedValue({ ...base, content: '正文', content_sha256: 'abc', party_a_real_name: 'Alice', party_a_id_card_no_masked: '****1234', signing_logs: [] })
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
  it('keeps party A blocked until the developer has signed the requirement contract', async () => {
    mocks.detail.mockResolvedValue({
      ...base, requirement_id: 'REQ-001', content: '正文', content_sha256: 'abc',
      party_a_real_name: 'Alice', party_a_id_card_no_masked: '****1234', signing_logs: [],
    })
    const { wrapper } = await render(ContractSignView, true)
    // 需求开发合同乙方（开发者）先签：乙方还没签，甲方这边没有签署入口，只提示在等谁。
    expect(wrapper.find('.contract-actions .btn-primary').exists()).toBe(false)
    expect(wrapper.text()).toContain('等待开发者完成签署')
    wrapper.unmount()
  })
})
