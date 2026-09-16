import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import MySignaturesView from '@/views/MySignaturesView.vue'
import UserWorkbenchView from '@/views/UserWorkbenchView.vue'
import ContractSignView from '@/views/ContractSignView.vue'
import type { MyContractSummary } from '@/api/contracts'

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
  id: 1, contract_no: 'HT-001', title: '网站服务合同', template_name: 'service', status: 'pending_party_a',
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
  mocks.list.mockResolvedValue([base, { ...base, id: 2, contract_no: 'HT-002', title: '已完成合同', status: 'signed' }])
  mocks.detail.mockResolvedValue({ ...base, content: '合同正文内容', content_sha256: 'abc', signing_logs: [] })
})

async function render(component: typeof MySignaturesView | typeof UserWorkbenchView | typeof ContractSignView, detail = false) {
  const names = ['workbench', 'workbench-requirements', 'workbench-account',
    'workbench-invoices', 'workbench-points', 'workbench-favorites', 'workbench-invite', 'workbench-teams',
    'workbench-team-resources', 'workbench-tickets', 'dev-resource-list', 'dev-requirement-hall',
    'dev-my-requirements', 'dev-wallet', 'dev-wallet-releases']
  const router = createRouter({ history: createMemoryHistory(), routes: [
    ...names.map((name) => ({ name, path: `/${name}`, component: { template: '<div />' } })),
    { name: 'workbench-signatures', path: '/workbench/signatures', component: MySignaturesView },
    { name: 'workbench-signature-detail', path: '/workbench/signatures/:contractId', component: ContractSignView },
  ] })
  await router.push(detail ? '/workbench/signatures/1' : '/workbench/signatures')
  const wrapper = mount(component, { global: { plugins: [router], stubs: {
    ElIcon: { template: '<i><slot /></i>' },
    ElScrollbar: { template: '<div><slot /></div>' },
    ElPagination: true, RouterView: true,
  } } })
  await flushPromises()
  return { wrapper, router }
}

describe('my signatures list', () => {
  it('loads current user contracts and links to an exact contract ID', async () => {
    const { wrapper } = await render(MySignaturesView)
    expect(mocks.list).toHaveBeenCalledWith('test-token')
    expect(wrapper.findAll('.signatures__row')).toHaveLength(2)
    expect(wrapper.find('.signatures__action a').attributes('href')).toBe('/workbench/signatures/1')
    expect(wrapper.find('.signatures__action').text()).toContain('去签署')
    wrapper.unmount()
  })
  it('filters by search and status and can clear empty filters', async () => {
    const { wrapper } = await render(MySignaturesView)
    await wrapper.findAll('.signatures__filters button')[3]!.trigger('click')
    expect(wrapper.findAll('.signatures__row')).toHaveLength(1)
    expect(wrapper.find('.signatures__row').text()).toContain('已完成合同')
    await wrapper.find('input').setValue('missing')
    expect(wrapper.text()).toContain('没有符合条件')
    await wrapper.find('.signatures__clear').trigger('click')
    expect(wrapper.findAll('.signatures__row')).toHaveLength(2)
    wrapper.unmount()
  })
  it('shows errors separately from empty results and retries', async () => {
    mocks.list.mockRejectedValueOnce(new Error('网络不可用'))
    const { wrapper } = await render(MySignaturesView)
    expect(wrapper.find('[role="alert"]').text()).toContain('网络不可用')
    expect(wrapper.text()).not.toContain('暂无签署记录')
    await wrapper.find('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.signatures__row')).toHaveLength(2)
    wrapper.unmount()
  })
  it('renders empty and loading states without stale records after logout', async () => {
    mocks.list.mockResolvedValueOnce([])
    const { wrapper } = await render(MySignaturesView)
    expect(wrapper.text()).toContain('暂无签署记录')
    let resolve!: (items: MyContractSummary[]) => void
    mocks.list.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    await wrapper.find('.signatures__refresh').trigger('click')
    expect(wrapper.text()).toContain('正在加载签署记录')
    useAuthStore().token = ''
    await flushPromises()
    resolve([base])
    await flushPromises()
    expect(wrapper.findAll('.signatures__row')).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('realname-gated menu', () => {
  it.each(['pending', 'rejected'])('hides the menu for %s verification', async (status) => {
    mocks.realname.mockResolvedValue({ status })
    const { wrapper } = await render(UserWorkbenchView)
    expect(wrapper.text()).not.toContain('我的签署')
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
    expect(wrapper.text()).not.toContain('我的签署')
    wrapper.unmount()
  })
})

describe('signature detail', () => {
  it('loads the exact contract without creating a developer agreement', async () => {
    mocks.detail.mockResolvedValue({ ...base, template_name: 'developer_agreement', status: 'signed', content: '正文', content_sha256: 'abc', signing_logs: [] })
    const { wrapper, router } = await render(ContractSignView, true)
    expect(mocks.detail).toHaveBeenCalledWith('test-token', 1)
    expect(mocks.developerAgreement).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('workbench-signature-detail')
    // 已签署的合同不在本地铺正文，改为「查看合同」跳爱签预览页。
    expect(wrapper.find('.contract-content').exists()).toBe(false)
    expect(wrapper.find('.contract-actions').text()).toContain('查看合同')
    expect(wrapper.text()).not.toContain('签署完成，成为开发者')
    wrapper.unmount()
  })
  it('falls back to the local body when asign has no preview for the signed contract', async () => {
    mocks.detail.mockResolvedValue({ ...base, status: 'signed', content: '正文', content_sha256: 'abc', signing_logs: [] })
    mocks.preview.mockResolvedValue('')
    const { wrapper } = await render(ContractSignView, true)
    await wrapper.find('.contract-actions .btn-primary').trigger('click')
    await flushPromises()
    expect(mocks.preview).toHaveBeenCalledWith('test-token', 1)
    expect(wrapper.find('.contract-content').text()).toBe('正文')
    expect(wrapper.text()).toContain('爱签暂未提供该合同的查看页')
    wrapper.unmount()
  })
  it('keeps signing disabled until the user accepts with verified identity', async () => {
    mocks.detail.mockResolvedValue({ ...base, content: '正文', content_sha256: 'abc', party_a_real_name: 'Alice', party_a_id_card_no_masked: '****1234', signing_logs: [] })
    mocks.initiate.mockRejectedValue(new Error('签署服务暂不可用'))
    const { wrapper } = await render(ContractSignView, true)
    expect(wrapper.find('.btn-primary').attributes('disabled')).toBeDefined()
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('.btn-primary').trigger('click')
    await flushPromises()
    expect(mocks.initiate).toHaveBeenCalledWith('test-token', 1)
    expect(wrapper.text()).toContain('签署服务暂不可用')
    wrapper.unmount()
  })
})
