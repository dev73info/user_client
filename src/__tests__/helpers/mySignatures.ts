import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import MySignaturesView from '@/views/MySignaturesView.vue'
import ContractSignView from '@/views/ContractSignView.vue'
import type { MyContractSummary } from '@/api/contracts'
import { CONTRACT_STATUS } from '@/shared/contracts'

/**
 * 「签署记录」两个 spec 共用的夹具与渲染助手。
 *
 * `vi.mock` 必须写在各自的 spec 文件里（模块级提升），所以这里只放**不依赖 mock 注册**的部分：
 * 合同夹具、路由表、挂载助手，以及把 mock 的默认返回值铺好的 `primeSignatureMocks`。
 */
export const baseContract: MyContractSummary = {
  id: 1,
  contract_no: 'HT-001',
  title: '网站服务合同',
  template_name: 'service',
  status: CONTRACT_STATUS.signing,
  party_a_name: '甲方公司',
  party_a_username: 'alice',
  party_a_signed_at: null,
  party_b_name: '乙方公司',
  party_b_username: 'bob',
  party_b_signed_at: null,
  created_at: '2026-09-09 10:00:00',
}

export type SignatureMocks = {
  list: ReturnType<typeof vi.fn>
  realname: ReturnType<typeof vi.fn>
  detail: ReturnType<typeof vi.fn>
  developerAgreement: ReturnType<typeof vi.fn>
  sync: ReturnType<typeof vi.fn>
  initiate: ReturnType<typeof vi.fn>
  preview: ReturnType<typeof vi.fn>
  requirementContract: ReturnType<typeof vi.fn>
}

/** 每个 spec 在 beforeEach 里调它：清 mock、重置 pinia 与登录态、铺好默认返回。 */
export function primeSignatureMocks(mocks: SignatureMocks) {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'alice'
  auth.profileLoaded = true
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  vi.spyOn(auth, 'initializeSession').mockResolvedValue({ username: 'alice', role: 'user' })
  mocks.realname.mockResolvedValue({
    status: 'approved',
    real_name: 'Alice',
    id_card_no_masked: '****1234',
  })
  mocks.list.mockResolvedValue([
    baseContract,
    {
      ...baseContract,
      id: 2,
      contract_no: 'HT-002',
      title: '已完成合同',
      status: CONTRACT_STATUS.signed,
    },
  ])
  mocks.detail.mockResolvedValue({
    ...baseContract,
    content: '合同正文内容',
    content_sha256: 'abc',
    signing_logs: [],
  })
}

const routeNames = [
  'workbench',
  'workbench-requirements',
  'workbench-account',
  'workbench-authorized-apps',
  'workbench-tickets',
  'workbench-favorites',
  'workbench-points',
  'mall',
  'workbench-perks',
  'workbench-badges',
  'workbench-purchase-transfers',
  'workbench-messages',
  'workbench-invoices',
  'workbench-coupons',
  'workbench-notifications',
  'workbench-resource-purchases',
  'workbench-teams',
  'workbench-team-resources',
  'dev-resource-list',
  'dev-requirement-hall',
  'dev-my-requirements',
  'dev-wallet',
]

/** 挂一个带「工作台 + 签署」路由的视图；`detail` 决定是否直接进详情页。 */
export async function renderSignatureView(
  component: typeof MySignaturesView | typeof ContractSignView,
  detail = false,
  initialPath?: string,
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...routeNames.map((name) => ({ name, path: `/${name}`, component: { template: '<div />' } })),
      { name: 'workbench-signatures', path: '/workbench/signatures', component: MySignaturesView },
      {
        name: 'workbench-signature-detail',
        path: '/workbench/signatures/:contractId',
        component: ContractSignView,
      },
      { name: 'contract-sign', path: '/contract-sign', component: ContractSignView },
    ],
  })
  const path = initialPath ?? (detail ? '/workbench/signatures/1' : '/workbench/signatures')
  await router.push(path)
  const wrapper = mount(component, {
    global: { plugins: [router], stubs: { RouterView: true } },
  })
  await flushPromises()
  return { wrapper, router }
}
