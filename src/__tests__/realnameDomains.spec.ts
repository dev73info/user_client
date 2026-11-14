import { flushPromises } from '@vue/test-utils'
import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HttpError } from '@/api/http'
import { REALNAME_ERROR_CODES } from '@/api/realname'
import { useRealnameFormDraft } from '@/composables/useRealnameFormDraft'
import { useRealnameMaterials } from '@/composables/useRealnameMaterials'
import { useRealnameSubmit } from '@/composables/useRealnameSubmit'

const mocks = vi.hoisted(() => ({
  hydrate: vi.fn(),
  uploadGuardianConsentFile: vi.fn(),
  quickStartAsignIdentify: vi.fn(),
  getMyRealnameVerification: vi.fn(),
  applyRecord: vi.fn(),
  beginChallenge: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: 'test-token', hydrate: mocks.hydrate }),
}))
vi.mock('@/api/realname', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/realname')>()),
  uploadGuardianConsentFile: mocks.uploadGuardianConsentFile,
  quickStartAsignIdentify: mocks.quickStartAsignIdentify,
  getMyRealnameVerification: mocks.getMyRealnameVerification,
}))
vi.mock('ui_73info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ui_73info')>()),
  TMessage: mocks.toast,
}))

const FRONT_FILE = new File(['front'], 'front.jpg', { type: 'image/jpeg' })
const BACK_FILE = new File(['back'], 'back.jpg', { type: 'image/jpeg' })
const LICENSE_FILE = new File(['license'], 'license.jpg', { type: 'image/jpeg' })
const OPERATOR_FILE = new File(['operator'], 'operator.jpg', { type: 'image/jpeg' })
const OPERATOR_MOBILE = '13900000000'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.uploadGuardianConsentFile.mockResolvedValue({
    guardian_consent_file: '/uploads/consent.pdf',
  })
  mocks.quickStartAsignIdentify.mockResolvedValue({ auth_url: 'https://asign.test/auth' })
  mocks.getMyRealnameVerification.mockResolvedValue({ status: 'pending' })
})

describe('实名材料选择', () => {
  it('只保留本次选择的 File，不上传、不读取旧实名要素', async () => {
    const draft = useRealnameFormDraft()
    const materials = useRealnameMaterials({ form: draft.form })
    materials.handleLegalCertFrontFile(FRONT_FILE)
    materials.handleLegalCertBackFile(BACK_FILE)
    materials.handleBusinessLicenseFile(LICENSE_FILE)
    materials.handleOperatorCertFrontFile(OPERATOR_FILE)
    await flushPromises()

    expect(draft.form.legalCertFrontFile).toBe(FRONT_FILE)
    expect(draft.form.legalCertBackFile).toBe(BACK_FILE)
    expect(draft.form.businessLicenseFile).toBe(LICENSE_FILE)
    expect(draft.form.operatorCertFrontFile).toBe(OPERATOR_FILE)
    expect(draft.form.realName).toBe('')
    expect(draft.form.companyName).toBe('')
  })

  it('营业执照不收 PDF，监护人同意书仍允许 PDF 并加密上传', async () => {
    const draft = useRealnameFormDraft()
    const materials = useRealnameMaterials({ form: draft.form })
    const pdf = new File(['x'], 'document.pdf', { type: 'application/pdf' })
    materials.handleBusinessLicenseFile(pdf)
    expect(draft.form.businessLicenseFile).toBeNull()

    await materials.handleConsentFile(pdf)
    expect(mocks.uploadGuardianConsentFile).toHaveBeenCalledWith('test-token', pdf)
  })
})

function setupSubmit() {
  const draft = useRealnameFormDraft()
  const submit = effectScope().run(() =>
    useRealnameSubmit({
      form: draft.form,
      validate: draft.validate,
      locked: ref(false),
      rejected: ref(false),
      applyRecord: mocks.applyRecord,
      beginChallenge: mocks.beginChallenge,
      faceidStarting: ref(false),
    }),
  )!
  return { draft, submit }
}

describe('材料发起认证', () => {
  it('个人上送认证方式、手机号和本次身份证，不上送手填姓名或证件号', async () => {
    const { draft, submit } = setupSubmit()
    draft.form.legalCertFrontFile = FRONT_FILE
    draft.form.mobile = '13800000000'
    draft.form.identifyType = 151
    await submit.submitRealname()

    expect(mocks.quickStartAsignIdentify).toHaveBeenCalledWith(
      'test-token',
      {
        auth_type: 'IDENTITY_CARD',
        identify_type: 151,
        mobile: '13800000000',
      },
      {
        legalCertFront: FRONT_FILE,
        legalCertBack: null,
        businessLicense: null,
        operatorCertFront: null,
      },
    )
    expect(mocks.beginChallenge).toHaveBeenCalledWith('https://asign.test/auth')
  })

  it('企业默认 369，上送本次三张证照，不上送手填工商资料', async () => {
    const { draft, submit } = setupSubmit()
    draft.form.authType = 'ENTERPRISE'
    draft.form.identifyType = 369
    draft.form.legalCertFrontFile = FRONT_FILE
    draft.form.legalCertBackFile = BACK_FILE
    draft.form.businessLicenseFile = LICENSE_FILE
    draft.form.operatorCertFrontFile = OPERATOR_FILE
    draft.form.mobile = '13800000000'
    draft.form.operatorMobile = OPERATOR_MOBILE
    await submit.submitRealname()

    expect(mocks.quickStartAsignIdentify).toHaveBeenCalledWith(
      'test-token',
      {
        auth_type: 'ENTERPRISE',
        identify_type: 369,
        mobile: '13800000000',
        operator_identify_type: 153,
        operator_mobile: OPERATOR_MOBILE,
      },
      {
        legalCertFront: FRONT_FILE,
        legalCertBack: BACK_FILE,
        businessLicense: LICENSE_FILE,
        operatorCertFront: OPERATOR_FILE,
      },
    )
    const payload = mocks.quickStartAsignIdentify.mock.calls[0]?.[1]
    expect(payload).not.toHaveProperty('company_name')
    expect(payload).not.toHaveProperty('operator_id_card_no')
  })

  it('材料不齐不发请求，渠道错误原样展示', async () => {
    const { draft, submit } = setupSubmit()
    await submit.submitRealname()
    expect(mocks.quickStartAsignIdentify).not.toHaveBeenCalled()

    draft.form.legalCertFrontFile = FRONT_FILE
    draft.form.mobile = '13800000000'
    mocks.quickStartAsignIdentify.mockRejectedValue(
      new Error('爱签返回错误 100720：认证权限未开通'),
    )
    await submit.submitRealname()
    expect(mocks.toast.error).toHaveBeenCalledWith('爱签返回错误 100720：认证权限未开通')
  })

  it('后端要求监护人材料时展开对应表单项', async () => {
    const { draft, submit } = setupSubmit()
    draft.form.legalCertFrontFile = FRONT_FILE
    draft.form.mobile = '13800000000'
    mocks.quickStartAsignIdentify.mockRejectedValue(
      new HttpError(403, '请上传监护人同意书', REALNAME_ERROR_CODES.guardianConsentRequired),
    )
    await submit.submitRealname()
    expect(draft.form.guardianRequired).toBe(true)
  })

  it('预填实名记录时只保留主体类型，不回填旧要素或旧文件', () => {
    const draft = useRealnameFormDraft()
    draft.prefill({
      auth_type: 'ENTERPRISE',
      real_name: '旧姓名',
      company_name: '旧企业',
      mobile: '13800000000',
      business_license_file: '/uploads/old/license.jpg',
    } as never)
    expect(draft.form.authType).toBe('ENTERPRISE')
    expect(draft.form.identifyType).toBe(369)
    expect(draft.form.realName).toBe('')
    expect(draft.form.companyName).toBe('')
    expect(draft.form.mobile).toBe('')
    expect(draft.form.businessLicenseFile).toBeNull()
  })
})
