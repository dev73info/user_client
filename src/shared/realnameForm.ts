/**
 * 实名认证表单的**规则层**：字段形状、渠道常量、身份证年龄分段、手机号格式、
 * **必填缺失清单**、提交前校验与提交载荷组装。
 *
 * 全是纯函数（年龄按传入的 `today` 算，默认取当前时间），所以能直接单测——这个页面原本
 * 零覆盖，纯函数层是唯一回归网。表单实例、弹窗可见性与请求都在 composable / 视图里。
 *
 * 文案（状态、主体中文名、识别结果摘要）在 `@/shared/realnameDisplay`，它单向依赖本文件。
 */
import type { RealnameAuthType, SubmitRealnameVerificationPayload } from '@/api/realname'

/** 营业执照长期有效时渠道要的固定截止日（`YYYYMMDD`），与后端同一口径。 */
export const LONG_TERM_DATE = '20991231'

/**
 * 渠道（Adapay 企业开户）对进件资料的长度上限：`business_scope` 200 字符、`address` 256 字符。
 *
 * 营业执照上的经营范围动辄两三百字，OCR 直接回填必然超限，所以回填时按这里截断并把
 * 「已截断」如实告诉用户，让他自己确认要不要精简。
 */
export const MAX_BUSINESS_SCOPE_LEN = 200
export const MAX_COMPANY_ADDRESS_LEN = 200

/** 实名草稿的全部字段：表单实例与纯函数共用同一份形状，字段名与后端口径一致。 */
export type RealnameDraftFields = {
  authType: RealnameAuthType
  identifyType: number
  idCardType: number
  realName: string
  idCardNo: string
  mobile: string
  companyName: string
  unifiedSocialCreditCode: string
  businessLicenseNo: string
  operatorName: string
  operatorIdCardNo: string
  operatorIdentifyType: number
  operatorCertFrontFile: File | null
  operatorMobile: string
  guardianRequired: boolean
  guardianConsent: boolean
  guardianConsentFile: string
  businessLicenseFile: File | null
  /** 法人身份证正反面：只在本次提交的 multipart 请求里携带，不落服务器磁盘。 */
  legalCertFrontFile: File | null
  legalCertBackFile: File | null
  /** 企业进件资料：支付渠道创建企业会员（对公收款账户）时逐项必填，企业 / 个体工商户主体要收齐。 */
  companyProvCode: string
  companyAreaCode: string
  companyAddress: string
  businessScope: string
  businessLicenseExpiresOn: string
  legalCertBeginOn: string
  legalCertExpiresOn: string
}

/** 企业 / 个体工商户主体：要收企业进件资料，走企业实名认证。 */
export function isBusinessAuthType(authType: RealnameAuthType): boolean {
  return authType === 'ENTERPRISE' || authType === 'SOLE_PROPRIETOR'
}

export function isValidMobile(value: string): boolean {
  const text = value.trim()
  return /^1\d{10}$/.test(text)
}

/**
 * 按 18 位大陆身份证号算周岁；位数不对、生日不合法（含 2 月 30 日这种）一律返回 `null`。
 *
 * `today` 只是为了让「14 / 18 岁边界」可测：默认取系统当前时间，行为与原来一致。
 */
export function idCardAge(idCardNo: string, today: Date = new Date()): number | null {
  const text = idCardNo.trim().toUpperCase()
  if (text.length !== 18) {
    return null
  }
  const birthday = text.slice(6, 14)
  if (!/^\d{8}$/.test(birthday)) {
    return null
  }
  const year = Number(birthday.slice(0, 4))
  const month = Number(birthday.slice(4, 6))
  const day = Number(birthday.slice(6, 8))
  const birth = new Date(year, month - 1, day)
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) {
    return null
  }
  let age = today.getFullYear() - year
  const monthDiff = today.getMonth() - (month - 1)
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
    age -= 1
  }
  return age
}

/**
 * 年龄分段（只在选中个人且证件号是 18 位大陆身份证时才算得出来）：
 * 未满 14 周岁禁止实名；14~18 周岁要监护人同意；已满 18 周岁不用。
 */
export type IdCardAgeBand = 'unknown' | 'under14' | 'minor' | 'adult'

export function idCardAgeBand(
  authType: RealnameAuthType,
  idCardNo: string,
  today: Date = new Date(),
): IdCardAgeBand {
  if (authType !== 'IDENTITY_CARD') {
    return 'unknown'
  }
  const age = idCardAge(idCardNo, today)
  if (age === null) {
    return 'unknown'
  }
  if (age < 14) {
    return 'under14'
  }
  if (age < 18) {
    return 'minor'
  }
  return 'adult'
}

export function isIdentityCardDraftMissing(fields: RealnameDraftFields): boolean {
  if (fields.authType !== 'IDENTITY_CARD') return false
  return !fields.legalCertFrontFile || !fields.mobile.trim()
}

/** 收款开户资料缺失检查；认证发起不再由前端回填这些字段。 */
export function derivedEnterpriseMissing(fields: RealnameDraftFields): string[] {
  const missing: string[] = []
  if (!isBusinessAuthType(fields.authType)) return missing
  if (!fields.companyProvCode.trim() || !fields.companyAreaCode.trim()) missing.push('企业所在省市')
  if (!fields.companyAddress.trim()) missing.push('企业注册地址')
  if (!fields.businessScope.trim()) missing.push('经营范围')
  if (!fields.businessLicenseExpiresOn.trim()) missing.push('营业执照有效期')
  return missing
}

export function isEnterpriseDraftMissing(fields: RealnameDraftFields): boolean {
  if (!isBusinessAuthType(fields.authType)) return false
  return (
    !fields.legalCertFrontFile ||
    !fields.legalCertBackFile ||
    !fields.businessLicenseFile ||
    !fields.operatorCertFrontFile ||
    !fields.mobile.trim() ||
    !fields.operatorMobile.trim()
  )
}

/** 14~18 周岁必须有监护人同意 + 同意书；成年人与未满 14 周岁都不看这两项。 */
export function isMinorGuardianMissing(fields: RealnameDraftFields): boolean {
  return !fields.guardianConsent || !fields.guardianConsentFile.trim()
}

export function validateRealnameDraft(fields: RealnameDraftFields): string {
  if (fields.authType === 'IDENTITY_CARD' && ![151, 152, 153].includes(fields.identifyType)) {
    return '请选择个人认证方式'
  }
  if (isBusinessAuthType(fields.authType) && ![351, 369].includes(fields.identifyType)) {
    return '请选择企业认证方式'
  }
  if (!fields.legalCertFrontFile) return '请上传身份证人像面照片'
  if (isBusinessAuthType(fields.authType)) {
    if (![151, 152, 153].includes(fields.operatorIdentifyType)) return '请选择经办人认证方式'
    if (!fields.legalCertBackFile) return '请上传法人身份证国徽面照片'
    if (!fields.businessLicenseFile) return '请上传营业执照'
    if (!fields.operatorCertFrontFile) return '请上传经办人身份证人像面照片'
    if (!isValidMobile(fields.operatorMobile)) return '请填写正确的经办人手机号'
  }
  if (!isValidMobile(fields.mobile)) return '请填写正确的手机号'
  if (fields.guardianRequired && !fields.guardianConsent) return '请确认已取得监护人同意'
  if (fields.guardianRequired && !fields.guardianConsentFile.trim()) return '请上传监护人同意书'
  return ''
}

/**
 * 手动填写认证的缺失项清单：空清单即可提交。
 *
 * 手动路径走 `POST /api/realname/`（平台人工审核），个人只要姓名 / 证件号 / 手机号；
 * 企业还要企业名称、统一社会信用代码、经办人信息、营业执照与企业进件七项。
 * 与 OCR 路径的差异是**不要求身份证照片**——证件信息由用户自己填。
 */
export function manualRealnameMissing(fields: RealnameDraftFields): string[] {
  const missing: string[] = []
  if (!fields.realName.trim()) missing.push('姓名')
  if (!fields.idCardNo.trim()) missing.push('身份证号')
  if (!isValidMobile(fields.mobile)) missing.push('手机号')
  if (isBusinessAuthType(fields.authType)) {
    if (!fields.companyName.trim()) missing.push('企业名称')
    if (!fields.unifiedSocialCreditCode.trim()) missing.push('统一社会信用代码')
    if (!fields.operatorName.trim()) missing.push('经办人姓名')
    if (!fields.operatorIdCardNo.trim()) missing.push('经办人身份证号')
    missing.push(...derivedEnterpriseMissing(fields))
    if (!fields.legalCertBeginOn.trim() || !fields.legalCertExpiresOn.trim()) {
      missing.push('法人证件有效期')
    }
  }
  if (fields.guardianRequired && !fields.guardianConsent) missing.push('监护人同意')
  if (fields.guardianRequired && !fields.guardianConsentFile.trim()) missing.push('监护人同意书')
  return missing
}

export function validateManualRealnameDraft(fields: RealnameDraftFields): string {
  const missing = manualRealnameMissing(fields)
  return missing.length ? `请填写${missing.join('、')}` : ''
}

/**
 * 手动填写认证的提交载荷。
 *
 * 只带非空字段；后端对个人要求姓名 / 证件号 / 手机号，对企业另要求营业执照与企业进件资料。
 * 身份证照片不在这条路径的请求体里（契约本来就没有这两个字段）。
 */
export function buildManualRealnamePayload(
  fields: RealnameDraftFields,
  today: Date = new Date(),
): SubmitRealnameVerificationPayload {
  const payload: SubmitRealnameVerificationPayload = {
    auth_type: fields.authType,
  }
  if (fields.realName.trim()) payload.real_name = fields.realName.trim()
  if (fields.idCardNo.trim()) payload.id_card_no = fields.idCardNo.trim()
  if (fields.mobile.trim()) payload.mobile = fields.mobile.trim()
  if (fields.companyName.trim()) payload.company_name = fields.companyName.trim()
  if (fields.unifiedSocialCreditCode.trim()) {
    payload.unified_social_credit_code = fields.unifiedSocialCreditCode.trim()
  }
  if (fields.businessLicenseNo.trim()) payload.business_license_no = fields.businessLicenseNo.trim()
  if (fields.operatorName.trim()) payload.operator_name = fields.operatorName.trim()
  if (fields.operatorIdCardNo.trim()) payload.operator_id_card_no = fields.operatorIdCardNo.trim()
  if (isBusinessAuthType(fields.authType)) {
    payload.company_prov_code = fields.companyProvCode.trim()
    payload.company_area_code = fields.companyAreaCode.trim()
    payload.company_address = fields.companyAddress.trim()
    payload.business_scope = fields.businessScope.trim()
    payload.business_license_expires_on = fields.businessLicenseExpiresOn.trim()
    payload.legal_cert_begin_on = fields.legalCertBeginOn.trim()
    payload.legal_cert_expires_on = fields.legalCertExpiresOn.trim()
  }
  if (idCardAgeBand(fields.authType, fields.idCardNo, today) === 'minor') {
    payload.guardian_consent = fields.guardianConsent
    if (fields.guardianConsentFile.trim()) {
      payload.guardian_consent_file = fields.guardianConsentFile.trim()
    }
  }
  return payload
}

/**
 * 组装提交载荷：空字段一律不出现在载荷里（后端按「未传」处理），
 * 企业进件资料只在该主体下传，监护人同意只对 14~18 周岁的未成年人传。
 */
export function buildRealnamePayload(
  fields: RealnameDraftFields,
  today: Date = new Date(),
): SubmitRealnameVerificationPayload {
  const payload: SubmitRealnameVerificationPayload = {
    auth_type: fields.authType,
  }

  if (fields.realName.trim()) payload.real_name = fields.realName.trim()
  if (fields.idCardNo.trim()) payload.id_card_no = fields.idCardNo.trim()
  if (fields.mobile.trim()) payload.mobile = fields.mobile.trim()
  if (fields.companyName.trim()) payload.company_name = fields.companyName.trim()
  if (fields.unifiedSocialCreditCode.trim()) {
    payload.unified_social_credit_code = fields.unifiedSocialCreditCode.trim()
  }
  if (fields.businessLicenseNo.trim()) payload.business_license_no = fields.businessLicenseNo.trim()
  if (fields.operatorName.trim()) payload.operator_name = fields.operatorName.trim()
  if (fields.operatorIdCardNo.trim()) payload.operator_id_card_no = fields.operatorIdCardNo.trim()
  // 企业进件资料只在企业 / 个体工商户主体下传；换成个人时后端会把它们清空
  if (isBusinessAuthType(fields.authType)) {
    payload.company_prov_code = fields.companyProvCode.trim()
    payload.company_area_code = fields.companyAreaCode.trim()
    payload.company_address = fields.companyAddress.trim()
    payload.business_scope = fields.businessScope.trim()
    payload.business_license_expires_on = fields.businessLicenseExpiresOn.trim()
    payload.legal_cert_begin_on = fields.legalCertBeginOn.trim()
    payload.legal_cert_expires_on = fields.legalCertExpiresOn.trim()
  }
  // 只有 14~18 周岁的未成年人才需要监护人同意；成年人无需传
  if (idCardAgeBand(fields.authType, fields.idCardNo, today) === 'minor') {
    payload.guardian_consent = fields.guardianConsent
    if (fields.guardianConsentFile.trim()) {
      payload.guardian_consent_file = fields.guardianConsentFile.trim()
    }
  }

  return payload
}
