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
  idCardType: number
  realName: string
  idCardNo: string
  mobile: string
  companyName: string
  unifiedSocialCreditCode: string
  businessLicenseNo: string
  operatorName: string
  operatorIdCardNo: string
  guardianConsent: boolean
  guardianConsentFile: string
  businessLicenseFile: string
  /** 企业开户进件的另外两张证照（法人身份证正反面）：上传即落库，不参与实名提交 payload。 */
  legalCertFrontFile: string
  legalCertBackFile: string
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

/**
 * 个人主体的三项必填（姓名 / 证件号 / 手机号）有没有缺。
 *
 * 只在个人主体下算数：企业表单里这三项本来就不展示（经办人是另一组字段），
 * 少了这道门，企业主体的「提交」按钮会被它一直按着不放。
 */
export function isIdentityCardDraftMissing(fields: RealnameDraftFields): boolean {
  if (fields.authType !== 'IDENTITY_CARD') return false
  return !fields.realName.trim() || !fields.idCardNo.trim() || !fields.mobile.trim()
}

/**
 * 企业进件资料里**只由营业执照识别带出、不在表单里展示**的四项。
 *
 * 渠道创建企业会员时这四项逐项必填，但都能从营业执照照片识别（省市编码由识别出的注册地址
 * 映射成渠道编码），所以不再让用户手填。识别不出时用户唯一的出路是重传一张更清晰的照片，
 * 因此校验失败必须指向「重新上传营业执照」，不能指回一个界面上根本没有的输入框。
 *
 * 个人主体（含港澳台居住证）没有这四项，直接返回空——否则个人 / 港澳台提交会被一条
 * 「缺企业资料」拦住。
 */
export function derivedEnterpriseMissing(fields: RealnameDraftFields): string[] {
  const missing: string[] = []
  if (!isBusinessAuthType(fields.authType)) return missing
  if (!fields.companyProvCode.trim() || !fields.companyAreaCode.trim()) missing.push('企业所在省市')
  if (!fields.companyAddress.trim()) missing.push('企业注册地址')
  if (!fields.businessScope.trim()) missing.push('经营范围')
  if (!fields.businessLicenseExpiresOn.trim()) missing.push('营业执照有效期')
  return missing
}

/** 企业主体的必填项（含上面那四项「识别带出」的进件资料与法人证件有效期）。 */
export function isEnterpriseDraftMissing(fields: RealnameDraftFields): boolean {
  return (
    !fields.companyName.trim() ||
    !fields.unifiedSocialCreditCode.trim() ||
    !fields.operatorName.trim() ||
    !fields.operatorIdCardNo.trim() ||
    !fields.mobile.trim() ||
    !fields.businessLicenseFile.trim() ||
    // 法人身份证正反面（开户进件三张证照里的另外两张）：缺任一张渠道都建不了企业会员
    !fields.legalCertFrontFile.trim() ||
    !fields.legalCertBackFile.trim() ||
    // 企业进件资料里有四项不在表单里（见 derivedEnterpriseMissing）：
    // 缺任一项渠道都会拒绝创建企业会员，之后连对公收款账户都开不了
    derivedEnterpriseMissing(fields).length > 0 ||
    // 法人证件有效期起止两项：OCR 会自动填，填不上就得用户补，缺任一项渠道必拒
    !fields.legalCertBeginOn.trim() ||
    !fields.legalCertExpiresOn.trim()
  )
}

/** 14~18 周岁必须有监护人同意 + 同意书；成年人与未满 14 周岁都不看这两项。 */
export function isMinorGuardianMissing(fields: RealnameDraftFields): boolean {
  return !fields.guardianConsent || !fields.guardianConsentFile.trim()
}

/**
 * 提交前校验：返回要提示给用户的那句话，空串表示可以提交。
 *
 * 企业主体的四项进件资料（所在省市 / 注册地址 / 经营范围 / 营业执照有效期）不在表单里，
 * 只能由营业执照识别带出，所以缺了只能是「重传照片」，提示也要这么写——指回一个界面上
 * 根本没有的输入框会让人无从下手。
 */
export function validateRealnameDraft(
  fields: RealnameDraftFields,
  today: Date = new Date(),
): string {
  if (isBusinessAuthType(fields.authType)) {
    if (!fields.companyName.trim()) return '请填写企业名称'
    if (!fields.unifiedSocialCreditCode.trim()) return '请填写统一社会信用代码'
    if (!fields.operatorName.trim()) return '请填写经办人姓名'
    if (!fields.operatorIdCardNo.trim()) return '请填写经办人身份证号'
    if (!isValidMobile(fields.mobile)) return '请填写正确的手机号'
    if (!fields.businessLicenseFile.trim()) return '请上传营业执照'
    // 法人身份证正反面：企业开户进件三张证照里的另外两张，缺哪张提示哪张。
    if (!fields.legalCertFrontFile.trim()) return '请上传法人身份证人像面照片'
    if (!fields.legalCertBackFile.trim()) return '请上传法人身份证国徽面照片'
    // 识别不出这四项就说明照片没识别全，出路是重传，而不是「去填一下」。
    const derivedMissing = derivedEnterpriseMissing(fields)
    if (derivedMissing.length) {
      return `未能从营业执照识别出${derivedMissing.join('、')}，请重新上传更清晰的照片`
    }
    // 识别出的经营范围会按渠道上限截断（见 autoFillFromBusinessLicense）；历史记录可能超限，
    // 重传一次营业执照会被重新截断，所以这里的出路同样是重传。
    if (fields.businessScope.trim().length > MAX_BUSINESS_SCOPE_LEN) {
      return `营业执照识别出的经营范围超过 ${MAX_BUSINESS_SCOPE_LEN} 字（渠道限制），请重新上传营业执照`
    }
    if (!/^\d{8}$/.test(fields.legalCertBeginOn.trim())) return '请选择法人证件有效期起始日'
    if (!/^\d{8}$/.test(fields.legalCertExpiresOn.trim())) return '请选择法人证件有效期截止日'
    return ''
  }

  if (!fields.realName.trim() || !fields.idCardNo.trim()) {
    return '请填写姓名和证件号'
  }
  if (!fields.mobile.trim()) return '请填写手机号'
  if (!isValidMobile(fields.mobile)) return '请填写正确的手机号'
  const band = idCardAgeBand(fields.authType, fields.idCardNo, today)
  if (band === 'under14') return '未满 14 周岁的未成年人不能进行实名认证'
  if (band === 'minor' && !fields.guardianConsent) return '请确认已取得监护人同意'
  if (band === 'minor' && !fields.guardianConsentFile.trim()) return '请上传监护人同意书'

  return ''
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
  if (fields.businessLicenseFile.trim()) {
    payload.business_license_file = fields.businessLicenseFile.trim()
  }
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
