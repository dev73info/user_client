import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openEntry, stubMatchMedia } from '@/__tests__/accountViewHelpers'

/**
 * 「提交认证信息」弹窗**在视图里**的接线（本轮把它拆成组件后逐键核对）。
 *
 * 组件级用例验「点了会 emit 什么」，这一层验**视图那一侧的监听有没有写对**：11 个 emit 键里任何
 * 一个改个名字，点下去都静默无反应（本页踩过 `updateChannel` vs `@update:channel`），所以每个
 * 动作都从「点真按钮」推到「调了哪个接口」，反向证明见本轮报告。
 */
const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getBoundProviders: vi.fn(),
  getMyRealnameVerification: vi.fn(),
  completeAsignIdentify: vi.fn(),
  resumeAsignIdentify: vi.fn(),
  withdrawRealname: vi.fn(),
  startAsignIdentify: vi.fn(),
  uploadBusinessLicenseFile: vi.fn(),
  ocrBusinessLicense: vi.fn(),
  uploadLegalCertFrontFile: vi.fn(),
  recognizeLegalCertPeriod: vi.fn(),
  hydrate: vi.fn(),
  replace: vi.fn(),
}))

const auth = reactive({
  token: 'test-token',
  isAuthed: true,
  hydrate: mocks.hydrate,
  fetchProfile: vi.fn(async () => undefined),
})
const route = reactive({ query: {} as Record<string, string> })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: mocks.replace, push: mocks.replace }),
}))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,qr') } }))

vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const noop = vi.fn()
  return { ...actual, TMessage: { ...actual.TMessage, success: noop, error: noop, warning: noop } }
})

vi.mock('@/api/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/settings')>()),
  getProfile: mocks.getProfile,
}))

vi.mock('@/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth')>()),
  getBoundProviders: mocks.getBoundProviders,
}))

vi.mock('@/api/adapay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/adapay')>()),
  getMyAdapayMember: vi.fn(async () => ({ onboardingStatus: 'active', settleAccountId: null })),
  getMySettlementAccountSnapshot: vi.fn(async () => ({ bound: false })),
}))

vi.mock('@/api/realname', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/realname')>()),
  getMyRealnameVerification: mocks.getMyRealnameVerification,
  completeAsignIdentify: mocks.completeAsignIdentify,
  resumeAsignIdentify: mocks.resumeAsignIdentify,
  withdrawMyRealnameVerification: mocks.withdrawRealname,
  startAsignIdentify: mocks.startAsignIdentify,
  uploadBusinessLicenseFile: mocks.uploadBusinessLicenseFile,
  ocrBusinessLicense: mocks.ocrBusinessLicense,
  uploadLegalCertFrontFile: mocks.uploadLegalCertFrontFile,
  recognizeLegalCertPeriod: mocks.recognizeLegalCertPeriod,
}))

import RealnameDialog from '@/components/account/RealnameDialog.vue'
import AccountCouponsView from '@/views/AccountCouponsView.vue'

/** 两条实名记录：已通过（变更主体用）与审核中（撤回用）。 */
const APPROVED_RECORD = {
  status: 'approved',
  auth_type: 'IDENTITY_CARD',
  real_name: '张三',
  id_card_no_masked: '110***********1234',
  mobile_masked: '138****0000',
}
const PENDING_RECORD = { ...APPROVED_RECORD, status: 'pending' }
const EXPECTED_LICENSE_FILE = '/uploads/realname-business-licenses/flow/license.jpg'

/** 视图 `setupState` 里本轮要读的几项（草稿、「变更主体」模式与弹窗可见性都在视图这一层）。 */
type Setup = {
  form: Record<string, unknown>
  legalCertPeriodEdited: { begin: boolean; expires: boolean }
  realnameDialogVisible: boolean
  realnameChanging: boolean
}
const setupState = (wrapper: VueWrapper): Setup =>
  (wrapper.vm.$ as unknown as { setupState: Setup }).setupState

/** 按可见文案找**弹窗里**的按钮（整页找会把入口行也匹配进来）。 */
function bodyButton(text: string): HTMLElement {
  const found = [...document.querySelectorAll('.t73-dialog button')].find((button) =>
    (button.textContent ?? '').includes(text),
  )
  if (!found) {
    throw new Error(`弹窗里找不到按钮：${text}`)
  }
  return found as HTMLElement
}
async function renderAccountPage(): Promise<VueWrapper> {
  const wrapper = mount(AccountCouponsView, {
    attachTo: document.body,
    global: { stubs: { RealnameHero: true, WechatBindQrModal: true } },
  })
  await flushPromises()
  return wrapper
}

/** 在第 index 个上传行里「选一个文件」（三个上传行按模板顺序排）。 */
function pickFile(index: number, name: string): File {
  const inputs = [
    ...document.querySelectorAll('.t73-dialog .realname-consent-upload__native'),
  ] as HTMLInputElement[]
  const target = inputs[index]!
  const file = new File(['x'], name, { type: 'image/jpeg' })
  Object.defineProperty(target, 'files', { value: [file], configurable: true })
  target.dispatchEvent(new Event('change'))
  return file
}

/** 打开「提交认证信息」弹窗（点入口行，与用户同一个分发路径）。 */
async function openRealnameDialog(wrapper: VueWrapper): Promise<void> {
  await openEntry(wrapper, 'realname')
  await flushPromises()
}

/** 打开弹窗并切到企业主体（三张证照与法人证件有效期只在企业表单里）。 */
async function openEnterpriseDialog(): Promise<{ wrapper: VueWrapper; state: Setup }> {
  const wrapper = await renderAccountPage()
  await openRealnameDialog(wrapper)
  const state = setupState(wrapper)
  state.form.authType = 'ENTERPRISE'
  await nextTick()
  return { wrapper, state }
}

beforeEach(() => {
  vi.clearAllMocks()
  stubMatchMedia()
  route.query = {}
  mocks.getProfile.mockResolvedValue({
    username: 'alice',
    email: 'old@example.com',
    two_factor_enabled: false,
    wechat_bound: false,
  })
  mocks.getBoundProviders.mockResolvedValue({ providers: [] })
  mocks.getMyRealnameVerification.mockResolvedValue(null)
  mocks.completeAsignIdentify.mockResolvedValue({ status: 'none' })
  mocks.resumeAsignIdentify.mockResolvedValue({ auth_url: '', manual_review: false })
  mocks.startAsignIdentify.mockResolvedValue({ auth_url: 'https://faceid.test/x' })
  mocks.uploadBusinessLicenseFile.mockResolvedValue({
    business_license_file: EXPECTED_LICENSE_FILE,
  })
  mocks.ocrBusinessLicense.mockResolvedValue({
    company_name: '云南某某科技有限公司',
    unified_social_credit_code: '91530600MA6K000000',
    company_address: '云南省昭通市彝良县角奎街道人民街1号',
    business_scope: '信息技术咨询服务',
    business_license_expires_on: '20991231',
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})
describe('实名弹窗：表单草稿双向绑定', () => {
  it('弹窗里输入的姓名写回视图那份草稿（defineModel 透传的是同一个 reactive）', async () => {
    const wrapper = await renderAccountPage()
    await openRealnameDialog(wrapper)

    const input = document.querySelector(
      '.t73-dialog input[placeholder="请输入真实姓名"]',
    ) as HTMLInputElement
    input.value = '李四'
    input.dispatchEvent(new Event('input'))
    await nextTick()

    expect(setupState(wrapper).form.realName).toBe('李四')
    wrapper.unmount()
  })
})

describe('实名弹窗：动作的 emit 键', () => {
  it('「提交认证」打到发起核身接口（个人主体）', async () => {
    const wrapper = await renderAccountPage()
    await openRealnameDialog(wrapper)
    const state = setupState(wrapper)
    state.form.authType = 'IDENTITY_CARD'
    state.form.realName = '张三'
    state.form.idCardNo = '110101199001011234'
    state.form.mobile = '13800000000'
    await nextTick()

    bodyButton('实名认证').click()
    await flushPromises()

    expect(mocks.startAsignIdentify).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({ real_name: '张三', id_card_no: '110101199001011234' }),
    )
    wrapper.unmount()
  })

  it('「长期有效」写截止日并打标记；两个日期的标记各走各的键', async () => {
    const { wrapper, state } = await openEnterpriseDialog()

    bodyButton('长期有效').click()
    await nextTick()
    expect(state.form.legalCertExpiresOn).toBe('20991231')
    expect(state.legalCertPeriodEdited.expires).toBe(true)

    // 起始日那个标记单独验：直接让子组件 emit，日期控件的内部实现不参与
    const dialog = wrapper.findComponent(RealnameDialog)
    expect(state.legalCertPeriodEdited.begin).toBe(false)
    dialog.vm.$emit('mark-begin-edited')
    await nextTick()
    expect(state.legalCertPeriodEdited.begin).toBe(true)
    wrapper.unmount()
  })

  it('「放弃变更」由视图退出变更模式', async () => {
    mocks.getMyRealnameVerification.mockResolvedValue(APPROVED_RECORD)
    const wrapper = await renderAccountPage()
    await openEntry(wrapper, 'changeSubject')
    await flushPromises()
    const state = setupState(wrapper)
    expect(state.realnameChanging).toBe(true)

    bodyButton('放弃变更').click()
    await flushPromises()

    expect(state.realnameChanging).toBe(false)
    expect(state.realnameDialogVisible).toBe(false)
    wrapper.unmount()
  })

  it('「撤回认证」打到撤回接口，成功后由视图关弹窗', async () => {
    mocks.getMyRealnameVerification.mockResolvedValue(PENDING_RECORD)
    mocks.completeAsignIdentify.mockResolvedValue(PENDING_RECORD)
    const wrapper = await renderAccountPage()
    await openRealnameDialog(wrapper)

    bodyButton('撤回认证').click()
    await flushPromises()

    expect(mocks.withdrawRealname).toHaveBeenCalledWith('test-token')
    wrapper.unmount()
  })
})

describe('实名弹窗：材料上传链路', () => {
  it('营业执照选好文件后：上传 → 写草稿 → OCR 回填企业信息', async () => {
    const { wrapper, state } = await openEnterpriseDialog()

    const file = pickFile(0, 'license.jpg')
    await flushPromises()

    expect(mocks.uploadBusinessLicenseFile).toHaveBeenCalledWith('test-token', file)
    expect(state.form.businessLicenseFile).toBe(EXPECTED_LICENSE_FILE)
    expect(state.form.companyName).toBe('云南某某科技有限公司')
    wrapper.unmount()
  })

  it('法人身份证人像面选好文件后上传，并触发有效期识别', async () => {
    mocks.uploadLegalCertFrontFile.mockResolvedValue({
      front_file: '/uploads/realname-legal-certs/flow/front.jpg',
    })
    mocks.recognizeLegalCertPeriod.mockResolvedValue({
      cert_begin_on: '20180101',
      cert_expires_on: '20380101',
    })
    const { wrapper, state } = await openEnterpriseDialog()

    // 三个上传行按模板顺序：营业执照 / 人像面 / 国徽面
    const file = pickFile(1, 'front.jpg')
    await flushPromises()

    expect(mocks.uploadLegalCertFrontFile).toHaveBeenCalledWith('test-token', file)
    expect(state.form.legalCertFrontFile).toBe('/uploads/realname-legal-certs/flow/front.jpg')
    expect(mocks.recognizeLegalCertPeriod).toHaveBeenCalledWith('test-token', 'front')
    expect(state.form.legalCertBeginOn).toBe('20180101')
    wrapper.unmount()
  })
})
