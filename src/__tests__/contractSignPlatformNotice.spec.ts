import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type { ContractDetail } from '@/api/contracts'
import type { RequirementItem } from '@/api/requirements'
import { LEGAL_NOTICE_VERSION, readLegalNoticeConfirmedAt } from '@/components/legal/legalNotice'
import { CONTRACT_STATUS } from '@/shared/contracts'
import { useAuthStore } from '@/stores/auth'
import ContractSignView from '@/views/ContractSignView.vue'

/**
 * 平台签署页的重要条款提示与二次确认（R043 任务-03，移植到 R047 拆分后的结构上）。
 *
 * 钉三件事：
 * 1. 平台协议（入驻协议 / 接口使用协议）签署前必须勾选确认重要条款提示，未勾选时
 *    「开始签署」置灰——判定在 `useContractSignDisplay.canSubmitSign`；
 * 2. 勾选后发起签署，留痕透传「提示确认时间 + 提示版本」，且提示版本取的是
 *    提示组件读到的协议版本（`useContractSign.handleSign`）；
 * 3. 需求合同不出现这块提示：平台不是需求合同的当事人（视图层的 `isPlatformAgreement` 闸门）。
 */
const mocks = vi.hoisted(() => ({
  developerAgreement: vi.fn(),
  requirementContract: vi.fn(),
  requirementDetail: vi.fn(),
  initiateSign: vi.fn(),
  syncStatus: vi.fn(),
  previewUrl: vi.fn(),
  recordAcceptance: vi.fn(),
  agreementContent: vi.fn(),
}))

vi.mock('@/api/contracts', async (orig) => ({
  ...(await orig<typeof import('@/api/contracts')>()),
  fetchDeveloperAgreement: mocks.developerAgreement,
  fetchMyRequirementContract: mocks.requirementContract,
  initiateAsignSign: mocks.initiateSign,
  syncAsignSignStatus: mocks.syncStatus,
  fetchAsignContractPreviewUrl: mocks.previewUrl,
}))
vi.mock('@/api/requirements', async (orig) => ({
  ...(await orig<typeof import('@/api/requirements')>()),
  fetchRequirementDetail: mocks.requirementDetail,
}))
vi.mock('@/api/auth', async (orig) => ({
  ...(await orig<typeof import('@/api/auth')>()),
  recordAgreementAcceptance: mocks.recordAcceptance,
  fetchAgreementContent: mocks.agreementContent,
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

const SIGN_URL = 'https://asign.example/sign/HT-2026-9001'
const AGREEMENT_VERSION = '2026-10-21-v2'
const AGREEMENT_EFFECTIVE_AT = '2026-10-21'

/** 开发者入驻协议：平台是甲方，当前登录账号是乙方。 */
function developerAgreement(patch: Partial<ContractDetail> = {}): ContractDetail {
  return {
    id: 901,
    contract_no: 'HT-2026-9001',
    title: '73Info 开发者入驻协议',
    content: '一、协议主体与适用范围\n1. 本协议由平台与开发者共同订立。',
    content_sha256: 'sha256-of-developer-agreement',
    status: CONTRACT_STATUS.signing,
    party_a_name: '73Info 平台',
    party_a_username: 'platform',
    party_a_real_name: '平台',
    party_a_id_card_no_masked: '',
    party_a_signed_at: '2026-10-20 09:00:00',
    party_b_name: '张三',
    party_b_username: 'alice',
    party_b_real_name: '张三',
    party_b_id_card_no_masked: '110***********1234',
    party_b_signed_at: null,
    party_c_name: '',
    created_at: '2026-10-20 09:00:00',
    content_source: 'platform',
    attachment_review_status: 'none',
    effective_until: null,
    development_cycle_days: null,
    signing_logs: [],
    ...patch,
  }
}

/** 需求合同：用来验证「需求合同不出现平台提示」。 */
function requirementContract(patch: Partial<ContractDetail> = {}): ContractDetail {
  return developerAgreement({
    id: 88,
    contract_no: 'HT-2026-0001',
    title: '需求开发合同',
    requirement_id: 'REQ-1',
    party_a_username: 'alice',
    party_a_real_name: '张三',
    party_a_id_card_no_masked: '110***********1234',
    // 本人（甲方 alice）还没签，签署按钮才会出现
    party_a_signed_at: null,
    party_b_username: 'bob',
    ...patch,
  })
}

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
  sessionStorage.clear()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  vi.spyOn(auth, 'initializeSession').mockResolvedValue(null)
  auth.token = 'test-token'
  auth.username = 'alice'

  mocks.developerAgreement.mockResolvedValue(developerAgreement())
  mocks.requirementContract.mockResolvedValue(requirementContract())
  mocks.requirementDetail.mockResolvedValue(requirementDetail())
  mocks.initiateSign.mockResolvedValue({
    contract_id: 901,
    contract_no: 'HT-2026-9001',
    sign_url: SIGN_URL,
    status: CONTRACT_STATUS.signing,
  })
  mocks.syncStatus.mockResolvedValue(developerAgreement())
  mocks.previewUrl.mockResolvedValue('')
  mocks.recordAcceptance.mockResolvedValue({
    agreement_code: 'developer_agreement',
    agreement_version: AGREEMENT_VERSION,
    accepted_at: '2026-10-22 10:00:00',
  })
  mocks.agreementContent.mockResolvedValue({
    code: 'developer_agreement',
    title: '73Info 开发者入驻协议',
    content: '一、协议主体与适用范围\n1. 本协议由平台与开发者共同订立。',
    version: AGREEMENT_VERSION,
    effective_at: AGREEMENT_EFFECTIVE_AT,
  })

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
  sessionStorage.clear()
})

async function render(query: Record<string, string>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'contract-sign', path: '/contract-sign', component: { template: '<div />' } },
      { name: 'workbench', path: '/workbench', component: { template: '<div />' } },
      {
        name: 'workbench-requirements',
        path: '/workbench/requirements',
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
  return wrapper
}

const signButton = (wrapper: VueWrapper) =>
  wrapper.findAll('button').find((button) => button.text().includes('开始签署'))

const noticeCheckbox = (wrapper: VueWrapper) =>
  wrapper.find('[data-testid="platform-agreement-notice-check"]')

describe('平台协议签署页：重要条款提示与二次确认', () => {
  it('未勾选重要条款提示时「开始签署」置灰，勾选后才可点', async () => {
    const wrapper = await render({ agreement: 'developer' })

    // 提示块在：标题 + 五个固定的条款分类都渲染出来了
    const notice = wrapper.find('.contract-notice')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('重要条款提示')
    expect(notice.text()).toContain('责任限制')
    expect(notice.text()).toContain('争议解决')
    // 提示组件自己读到了协议版本（页面没传，所以它发了一次请求）
    expect(mocks.agreementContent).toHaveBeenCalledWith('developer_agreement')
    expect(notice.text()).toContain(AGREEMENT_VERSION)

    expect(signButton(wrapper)?.attributes('disabled')).toBeDefined()

    await noticeCheckbox(wrapper).setValue(true)
    expect(signButton(wrapper)?.attributes('disabled')).toBeUndefined()

    wrapper.unmount()
  })

  it('勾选后发起签署：留痕带上提示确认时间与提示版本', async () => {
    const wrapper = await render({ agreement: 'developer' })

    await noticeCheckbox(wrapper).setValue(true)
    await signButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(mocks.initiateSign).toHaveBeenCalledWith('test-token', 901, false)
    // 留痕：协议 code / 协议版本 / 来源 / 提示确认时间（ISO 串）/ 提示版本
    expect(mocks.recordAcceptance).toHaveBeenCalledTimes(1)
    const [token, code, version, platform, source, confirmedAt, noticeVersion] = mocks
      .recordAcceptance.mock.calls[0] as string[]
    expect(token).toBe('test-token')
    expect(code).toBe('developer_agreement')
    expect(version).toBe(AGREEMENT_VERSION)
    expect(platform).toBeTruthy()
    expect(source).toBe('sign')
    expect(confirmedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(noticeVersion).toBe(LEGAL_NOTICE_VERSION)
    // 确认时间同时记进本次会话（第三方快捷登录补记时要用）
    expect(readLegalNoticeConfirmedAt()).toBe(confirmedAt)

    expect(redirectTo).toHaveBeenCalledWith(SIGN_URL)

    wrapper.unmount()
  })

  it('需求合同不出现重要条款提示，也不带留痕', async () => {
    const wrapper = await render({ requirement_id: 'REQ-1', from: 'user' })

    expect(wrapper.find('.contract-notice').exists()).toBe(false)
    expect(signButton(wrapper)?.attributes('disabled')).toBeUndefined()

    await signButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(mocks.recordAcceptance).not.toHaveBeenCalled()
    expect(mocks.initiateSign).toHaveBeenCalledWith('test-token', 88, false)

    wrapper.unmount()
  })
})
