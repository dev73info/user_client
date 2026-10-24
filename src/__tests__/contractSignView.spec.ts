import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type { ContractDetail } from '@/api/contracts'
import type { RequirementItem } from '@/api/requirements'
import { CONTRACT_STATUS } from '@/shared/contracts'
import { useAuthStore } from '@/stores/auth'
import ContractSignView from '@/views/ContractSignView.vue'

/**
 * 合同签署页最小挂载烟测（拆分前这页零覆盖）。
 *
 * 只钉两件事：
 * 1. 合同信息真的渲染出来了（编号 / 标题 / 状态 / 指纹 / 签约方）；
 * 2. 点「开始签署」之后，爱签签署链接经**视图的整页跳转**交出去——跳转是
 *    `window.location.href`（离开 SPA），所以这里把 `window.location` 换成一个只记账的
 *    stub，断言「跳转函数被调用」而不是真的导航；反过来，附件未放行时按钮置灰、跳转不触发。
 *
 * 附件面板由另一处维护，这里 stub 掉：本页只负责把合同与身份传进去。
 */
const mocks = vi.hoisted(() => ({
  requirementContract: vi.fn(),
  requirementDetail: vi.fn(),
  initiateSign: vi.fn(),
  syncStatus: vi.fn(),
  previewUrl: vi.fn(),
}))

vi.mock('@/api/contracts', async (orig) => ({
  ...(await orig<typeof import('@/api/contracts')>()),
  fetchMyRequirementContract: mocks.requirementContract,
  initiateAsignSign: mocks.initiateSign,
  syncAsignSignStatus: mocks.syncStatus,
  fetchAsignContractPreviewUrl: mocks.previewUrl,
}))
vi.mock('@/api/requirements', async (orig) => ({
  ...(await orig<typeof import('@/api/requirements')>()),
  fetchRequirementDetail: mocks.requirementDetail,
}))
vi.mock('@/components/ContractAttachmentPanel.vue', () => ({
  default: {
    name: 'ContractAttachmentPanel',
    props: {
      token: { type: String, default: '' },
      contract: { type: Object, default: null },
      requirementId: { type: String, default: '' },
      party: { type: String, default: '' },
    },
    emits: ['updated'],
    template: '<div class="stub-attachment" />',
  },
}))

const SIGN_URL = 'https://asign.example/sign/HT-2026-0001'

function contractDetail(patch: Partial<ContractDetail> = {}): ContractDetail {
  return {
    id: 88,
    contract_no: 'HT-2026-0001',
    title: '需求开发合同',
    content: '第一条 服务内容……',
    content_sha256: 'sha256-of-contract-content',
    status: CONTRACT_STATUS.signing,
    party_a_name: '需求方甲',
    party_a_username: 'alice',
    party_a_real_name: '张三',
    party_a_id_card_no_masked: '110***********1234',
    party_a_signed_at: null,
    party_b_name: '开发者乙',
    party_b_username: 'bob',
    party_b_real_name: '李四',
    party_b_id_card_no_masked: '310***********5678',
    party_b_signed_at: null,
    party_c_name: '',
    created_at: '2026-10-20 10:00:00',
    requirement_id: 'REQ-1',
    content_source: 'platform',
    attachment_review_status: 'none',
    effective_until: null,
    development_cycle_days: null,
    signing_logs: [
      {
        id: 1,
        contract_id: 88,
        contract_no: 'HT-2026-0001',
        contract_title: '需求开发合同',
        action: 'created',
        operator: 'system',
        created_at: '2026-10-20 10:00:00',
      },
    ],
    ...patch,
  }
}

/** 需求详情只用来取「到期归档」标记；正常态三个 archive_* 全空。 */
function requirementDetail(): RequirementItem {
  return {
    id: 1,
    requirement_id: 'REQ-1',
    title: '数据清洗插件定制',
    status: 'in_development',
    archive_locked_at: null,
    archive_lock_expires_at: null,
    archive_cleared_at: null,
    archive_can_claim_resource: false,
  } as unknown as RequirementItem
}

/** 整页跳转的落点：`window.location.href` 的 setter，用来断言「跳转函数被调用」。 */
let redirectTo: Mock<(value: string) => void>
const originalLocation = window.location

beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  // 不用真 token：hydrate 会从 localStorage 读回空串，把这里设的身份冲掉
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  // 进页面会用已有 token 补一次会话；不打真接口，也避免它内部再走一次 hydrate 把身份冲掉
  vi.spyOn(auth, 'initializeSession').mockResolvedValue(null)
  auth.token = 'test-token'
  auth.username = 'alice'

  mocks.requirementContract.mockResolvedValue(contractDetail())
  mocks.requirementDetail.mockResolvedValue(requirementDetail())
  mocks.initiateSign.mockResolvedValue({
    contract_id: 88,
    contract_no: 'HT-2026-0001',
    sign_url: SIGN_URL,
    status: CONTRACT_STATUS.signing,
  })
  mocks.syncStatus.mockResolvedValue(contractDetail())
  mocks.previewUrl.mockResolvedValue('')

  // 换掉 `window.location`：只记账、不导航，断言的是「跳转函数收到了哪个 URL」
  let href = ''
  redirectTo = vi.fn((value: string) => {
    href = value
  })
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: Object.defineProperty({}, 'href', {
      configurable: true,
      get: () => href,
      set: redirectTo,
    }),
  })
})

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
})

async function render(
  query: Record<string, string> = { requirement_id: 'REQ-1' },
  patch: Partial<ContractDetail> = {},
) {
  mocks.requirementContract.mockResolvedValue(contractDetail(patch))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'contract-sign', path: '/contract-sign', component: { template: '<div />' } },
      {
        name: 'workbench-signature-detail',
        path: '/workbench/signatures/:contractId',
        component: { template: '<div />' },
      },
      { name: 'workbench', path: '/workbench', component: { template: '<div />' } },
      {
        name: 'workbench-requirements',
        path: '/workbench/requirements',
        component: { template: '<div />' },
      },
      {
        name: 'workbench-signatures',
        path: '/workbench/signatures',
        component: { template: '<div />' },
      },
      {
        name: 'workbench-realname',
        path: '/workbench/realname',
        component: { template: '<div />' },
      },
    ],
  })
  await router.push({ name: 'contract-sign', query })
  const wrapper = mount(ContractSignView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

const signButton = (wrapper: VueWrapper) =>
  wrapper.findAll('button').find((button) => button.text().includes('开始签署'))

describe('合同签署页：最小挂载烟测', () => {
  it('按需求编号取合同，并把合同信息渲染出来', async () => {
    // 已签约的合同：签约方与签署记录都要铺开（本人还要签时这些区块会收起，见下一条）
    const { wrapper } = await render(
      { requirement_id: 'REQ-1' },
      {
        status: CONTRACT_STATUS.signed,
        party_a_signed_at: '2026-10-20 11:00:00',
        party_b_signed_at: '2026-10-20 12:00:00',
      },
    )

    expect(mocks.requirementContract).toHaveBeenCalledWith('test-token', 'REQ-1')

    const meta = wrapper.find('.contract-meta')
    expect(meta.exists()).toBe(true)
    expect(meta.text()).toContain('HT-2026-0001')
    expect(meta.text()).toContain('需求开发合同')
    expect(meta.find('.contract-status-chip').text()).toBe('已签约')
    expect(meta.text()).toContain('sha256-of-contract-content')
    // 已签约：正文以爱签那份为准，页头给「查看合同」入口
    expect(meta.findAll('button').map((button) => button.text())).toContain('查看合同')

    // 签约方：丙方没名字就不出现
    const parties = wrapper.findAll('.signature-parties dl > div')
    expect(parties).toHaveLength(2)
    expect(parties[0]!.text()).toContain('需求方甲')
    expect(parties[1]!.text()).toContain('开发者乙')

    // 签署记录：动作换算成中文说明
    expect(wrapper.find('.signature-history').text()).toContain('合同已创建')

    wrapper.unmount()
  })

  it('本人还要签时只聚焦签署动作：签署身份在，签约方区块收起', async () => {
    const { wrapper } = await render()

    expect(wrapper.find('.sign-panel').text()).toContain('张三')
    expect(signButton(wrapper)?.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.signature-parties').exists()).toBe(false)

    wrapper.unmount()
  })

  it('点「开始签署」拿到爱签链接，交给视图的整页跳转', async () => {
    const { wrapper } = await render()

    expect(redirectTo).not.toHaveBeenCalled()

    await signButton(wrapper)!.trigger('click')
    await flushPromises()

    // 发起签署：token + 合同 id + 短信通知开关（默认不通知）
    expect(mocks.initiateSign).toHaveBeenCalledWith('test-token', 88, false)
    // 跳转由视图执行（离开 SPA），composable 只交出 URL
    expect(redirectTo).toHaveBeenCalledTimes(1)
    expect(redirectTo).toHaveBeenCalledWith(SIGN_URL)

    wrapper.unmount()
  })

  it('自定义附件未放行时按钮置灰，不发请求也不跳转', async () => {
    const { wrapper } = await render(
      { requirement_id: 'REQ-1' },
      {
        content_source: 'uploaded_file',
        attachment_review_status: 'pending',
        attachment_file_sha256: 'file-sha-new',
        attachment_approved_sha256: null,
      },
    )

    expect(signButton(wrapper)?.attributes('disabled')).toBeDefined()

    await signButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(mocks.initiateSign).not.toHaveBeenCalled()
    expect(redirectTo).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})
