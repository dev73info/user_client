import { flushPromises } from '@vue/test-utils'
import { effectScope, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLegalCertPeriod } from '@/composables/useLegalCertPeriod'
import { useRealnameFormDraft } from '@/composables/useRealnameFormDraft'
import { useRealnameMaterials } from '@/composables/useRealnameMaterials'
import { useRealnameSubmit } from '@/composables/useRealnameSubmit'

/**
 * 实名材料域 / 有效期域 / 提交域的三件「拆文件时最容易改坏、坏了还不报错」的事：
 * 1. 证件照上传成功后**先**写草稿、**再**触发识别（识别按 side 读后端已落库的照片，顺序反了
 *    就是「上传成功但识别永远失败」）；
 * 2. OCR 只往「空且用户没动过」的项里写（`legalCertPeriodEdited` 决定会不会盖掉手填）；
 * 3. 提交实名按认证类型分流，顺序不能换（个人 → 企业 → 个体工商户直接提交）。
 */
const mocks = vi.hoisted(() => ({
  hydrate: vi.fn(),
  uploadBusinessLicenseFile: vi.fn(),
  ocrBusinessLicense: vi.fn(),
  uploadLegalCertFrontFile: vi.fn(),
  uploadLegalCertBackFile: vi.fn(),
  uploadGuardianConsentFile: vi.fn(),
  recognizeLegalCertPeriod: vi.fn(),
  startAsignIdentify: vi.fn(),
  startCompanyAsignIdentify: vi.fn(),
  submitMyRealnameVerification: vi.fn(),
  getMyRealnameVerification: vi.fn(),
  applyRecord: vi.fn(),
  beginChallenge: vi.fn(),
  restoreBusinessPage: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: 'test-token', hydrate: mocks.hydrate }),
}))
vi.mock('@/api/realname', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/realname')>()),
  uploadBusinessLicenseFile: mocks.uploadBusinessLicenseFile,
  ocrBusinessLicense: mocks.ocrBusinessLicense,
  uploadLegalCertFrontFile: mocks.uploadLegalCertFrontFile,
  uploadLegalCertBackFile: mocks.uploadLegalCertBackFile,
  uploadGuardianConsentFile: mocks.uploadGuardianConsentFile,
  recognizeLegalCertPeriod: mocks.recognizeLegalCertPeriod,
  startAsignIdentify: mocks.startAsignIdentify,
  startCompanyAsignIdentify: mocks.startCompanyAsignIdentify,
  submitMyRealnameVerification: mocks.submitMyRealnameVerification,
  getMyRealnameVerification: mocks.getMyRealnameVerification,
}))
vi.mock('ui_73info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ui_73info')>()),
  TMessage: mocks.toast,
}))

const FRONT_FILE = '/uploads/realname-legal-certs/flow/front.jpg'
const BACK_FILE = '/uploads/realname-legal-certs/flow/back.jpg'
const LICENSE_FILE = '/uploads/realname-business-licenses/flow/license.jpg'

function imageFile(name = 'id-card.jpg'): File {
  return new File(['x'], name, { type: 'image/jpeg' })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.uploadLegalCertFrontFile.mockResolvedValue({ front_file: FRONT_FILE })
  mocks.uploadLegalCertBackFile.mockResolvedValue({ back_file: BACK_FILE })
  mocks.uploadBusinessLicenseFile.mockResolvedValue({ business_license_file: LICENSE_FILE })
  mocks.recognizeLegalCertPeriod.mockResolvedValue({
    cert_begin_on: '20180101',
    cert_expires_on: '20380101',
  })
  mocks.ocrBusinessLicense.mockResolvedValue({
    company_name: '云南某某科技有限公司',
    unified_social_credit_code: '91530600MA6K000000',
    company_address: '云南省昭通市彝良县角奎街道人民街 1 号',
    business_scope: '信'.repeat(260),
    business_license_expires_on: '20991231',
  })
  mocks.startAsignIdentify.mockResolvedValue({ auth_url: 'https://faceid.test/x' })
  mocks.startCompanyAsignIdentify.mockResolvedValue({ auth_url: 'https://faceid.test/c' })
  mocks.getMyRealnameVerification.mockResolvedValue({ status: 'pending' })
  mocks.submitMyRealnameVerification.mockResolvedValue({ status: 'pending' })
})

/** 把两个域按视图里的接法装起来（注入顺序就是异步链的时序）。 */
function setupDomains() {
  const scope = effectScope()
  const draft = useRealnameFormDraft()
  const locked = ref(false)
  const { period, materials } = scope.run(() => {
    const period = useLegalCertPeriod({
      form: draft.form,
      edited: draft.legalCertPeriodEdited,
      locked,
    })
    const materials = useRealnameMaterials({
      form: draft.form,
      autoFillLegalCertPeriod: period.autoFillLegalCertPeriod,
    })
    return { period, materials }
  })!
  return { materials, period, form: draft.form, edited: draft.legalCertPeriodEdited, locked }
}

describe('材料域：上传 → 识别的时间顺序', () => {
  it('人像面上传成功后先写草稿再识别，识别开始那一刻草稿里已经有文件名', async () => {
    const { materials, form } = setupDomains()
    /** 识别被调用那一刻，草稿里的文件名是什么（顺序反了这里就是空串）。 */
    let fileSeenByOcr = ''
    mocks.recognizeLegalCertPeriod.mockImplementation(async () => {
      fileSeenByOcr = form.legalCertFrontFile
      return { cert_begin_on: '20180101', cert_expires_on: '20380101' }
    })

    await materials.handleLegalCertFrontFile(imageFile())
    await flushPromises()

    expect(mocks.uploadLegalCertFrontFile).toHaveBeenCalledWith('test-token', expect.any(File))
    expect(form.legalCertFrontFile).toBe(FRONT_FILE)
    expect(fileSeenByOcr).toBe(FRONT_FILE)
    // 只对已上传的那一面调识别（另一面没传，后端会回 400）
    expect(mocks.recognizeLegalCertPeriod.mock.calls.map((call) => call[1])).toEqual(['front'])
    expect(form.legalCertBeginOn).toBe('20180101')
    expect(form.legalCertExpiresOn).toBe('20380101')
  })

  it('国徽面上传同样触发识别；两面都传过时各调一次', async () => {
    const { materials, form } = setupDomains()
    form.legalCertFrontFile = FRONT_FILE
    await materials.handleLegalCertBackFile(imageFile())
    await flushPromises()

    expect(form.legalCertBackFile).toBe(BACK_FILE)
    expect(mocks.recognizeLegalCertPeriod.mock.calls.map((call) => call[1])).toEqual([
      'front',
      'back',
    ])
  })
})

describe('有效期域：用户填过的一律保留', () => {
  it('手选过起始日、点过「长期有效」后，OCR 两项都不写', async () => {
    const { period, form, edited } = setupDomains()
    form.legalCertFrontFile = FRONT_FILE
    form.legalCertBeginOn = '20200101'
    period.markLegalCertBeginEdited()
    period.applyLongTermLegalCert()
    expect(form.legalCertExpiresOn).toBe('20991231')

    // 两项都被用户定过 → 不去麻烦后端
    await period.autoFillLegalCertPeriod()
    expect(mocks.recognizeLegalCertPeriod).not.toHaveBeenCalled()
    expect(form.legalCertBeginOn).toBe('20200101')
    expect(edited.begin && edited.expires).toBe(true)
  })

  it('用户清空过的项也算动过，识别不会把它填回去', async () => {
    const { period, form } = setupDomains()
    form.legalCertFrontFile = FRONT_FILE
    period.markLegalCertExpiresEdited()

    await period.autoFillLegalCertPeriod()
    expect(form.legalCertBeginOn).toBe('20180101')
    expect(form.legalCertExpiresOn).toBe('')
  })

  it('只读态 / 没有已上传的证件照都不跑识别；两项都没识别出来才提示手工填写', async () => {
    const idle = setupDomains()
    await idle.period.autoFillLegalCertPeriod()
    expect(mocks.recognizeLegalCertPeriod).not.toHaveBeenCalled()

    const locked = setupDomains()
    locked.form.legalCertFrontFile = FRONT_FILE
    locked.locked.value = true
    await locked.period.autoFillLegalCertPeriod()
    expect(mocks.recognizeLegalCertPeriod).not.toHaveBeenCalled()

    const empty = setupDomains()
    empty.form.legalCertFrontFile = FRONT_FILE
    mocks.recognizeLegalCertPeriod.mockResolvedValue({ cert_begin_on: null, cert_expires_on: null })
    await empty.period.autoFillLegalCertPeriod({ silent: true })
    expect(mocks.toast.warning).not.toHaveBeenCalled()
    await empty.period.autoFillLegalCertPeriod()
    expect(mocks.toast.warning).toHaveBeenCalledWith('未能自动识别法人证件有效期，请手工填写')
  })
})

describe('材料域：收件口径与营业执照回填', () => {
  it('营业执照：上传 → 填五家企业信息 → 按地址认领渠道省市 → 经营范围按上限截断', async () => {
    const { materials, form } = setupDomains()
    await materials.handleBusinessLicenseFile(imageFile('license.jpg'))

    expect(form.businessLicenseFile).toBe(LICENSE_FILE)
    expect(form.companyName).toBe('云南某某科技有限公司')
    expect(form.unifiedSocialCreditCode).toBe('91530600MA6K000000')
    expect(form.businessLicenseExpiresOn).toBe('20991231')
    // 云南省 / 昭通市的渠道编码（由营业执照地址认领，用户不用手填）
    expect(form.companyProvCode).toBe('0053')
    expect(form.companyAreaCode).toBe('5315')
    expect(form.businessScope).toHaveLength(200)
    expect(mocks.toast.warning).toHaveBeenCalledWith(expect.stringContaining('已按渠道上限截断'))
  })

  it('收件口径在上传前就拦：法人证只收图片、同意书 5MB 上限', async () => {
    const { materials } = setupDomains()
    await materials.handleLegalCertFrontFile(new File(['x'], 'id.pdf', { type: 'application/pdf' }))
    expect(mocks.uploadLegalCertFrontFile).not.toHaveBeenCalled()
    expect(mocks.toast.warning).toHaveBeenCalledWith('法人身份证人像面仅支持 PNG、JPG、WEBP 图片')

    const big = new File(['x'], 'consent.pdf', { type: 'application/pdf' })
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 })
    await materials.handleConsentFile(big)
    expect(mocks.uploadGuardianConsentFile).not.toHaveBeenCalled()
    expect(mocks.toast.warning).toHaveBeenCalledWith('同意书文件不能超过 5MB')
  })
})

describe('提交域：按认证类型分流', () => {
  /** 三个布尔位各取一份，用例只改要改的那几个。 */
  const flags = () =>
    reactive({ identity: true, enterprise: false, locked: false, changing: false })

  function setupSubmit(state: Partial<ReturnType<typeof flags>> = {}) {
    const form = useRealnameFormDraft().form
    form.realName = '张三'
    form.idCardNo = '110101199001011234'
    form.mobile = '13800000000'
    const submit = effectScope().run(() =>
      useRealnameSubmit({
        form,
        validate: () => '',
        buildPayload: () => ({ auth_type: form.authType }),
        identityCardSelected: ref(state.identity ?? true),
        enterpriseSelected: ref(state.enterprise ?? false),
        isMinor14To18: ref(false),
        approved: ref(false),
        rejected: ref(false),
        locked: ref(state.locked ?? false),
        changing: ref(state.changing ?? false),
        applyRecord: mocks.applyRecord,
        beginChallenge: mocks.beginChallenge,
        restoreBusinessPage: mocks.restoreBusinessPage,
        faceidStarting: ref(false),
      }),
    )!
    return { submit, form }
  }

  it('个人 → 扫码核身；企业 → 企业认证；个体工商户 → 直接提交并回跳', async () => {
    await setupSubmit(flags()).submit.submitRealname()
    expect(mocks.startAsignIdentify).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({ real_name: '张三', mobile: '13800000000' }),
    )
    expect(mocks.beginChallenge).toHaveBeenCalledWith('https://faceid.test/x')
    expect(mocks.submitMyRealnameVerification).not.toHaveBeenCalled()

    const company = setupSubmit(reactive({ identity: false, enterprise: true, locked: false }))
    company.form.authType = 'ENTERPRISE'
    await company.submit.submitRealname()
    expect(mocks.startCompanyAsignIdentify).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({ legal_cert_begin_on: '', legal_cert_expires_on: '' }),
    )
    expect(mocks.startAsignIdentify).toHaveBeenCalledTimes(1)

    const sole = setupSubmit(reactive({ identity: false, enterprise: false, locked: false }))
    sole.form.authType = 'SOLE_PROPRIETOR'
    await sole.submit.submitRealname()
    expect(mocks.submitMyRealnameVerification).toHaveBeenCalled()
    expect(mocks.restoreBusinessPage).toHaveBeenCalled()
  })

  it('只读态下个体工商户不能提交', async () => {
    const state = setupSubmit(reactive({ identity: false, enterprise: false, locked: true }))
    await state.submit.submitRealname()
    expect(mocks.submitMyRealnameVerification).not.toHaveBeenCalled()
    expect(mocks.toast.warning).toHaveBeenCalledWith('实名认证审核中或已通过时不能修改')
  })
})
