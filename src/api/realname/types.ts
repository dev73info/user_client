/**
 * 实名认证域的请求 / 响应类型。
 *
 * 后端 2.0 已把实名域写进 OpenAPI 契约（`src/api/generated/openapi.json`），响应与请求体的形状
 * 一律取 `pnpm contract:write` 生成的 `schema.d.ts`，不在这里重抄一遍字段。三个例外留在手写处并注明：
 * 契约未覆盖的端点、要比契约更严的取值域、以及按调用点放宽的可选性。
 * 逐条对照见 `doc/契约类型对照.md`。
 */
import type { components } from '@/api/generated/schema'

/** 生成物里的 schema 集合。 */
type Schemas = components['schemas']

export const REALNAME_ERROR_CODES = {
  guardianConsentRequired: 'GUARDIAN_CONSENT_REQUIRED',
} as const

/**
 * 认证类型。
 *
 * 契约里 `auth_type` 是 `string`（`SubmitRealnameRequest` / `RealnameResponse`），这里收窄成五个取值：
 * 表单分流、必填校验与文案都按它分支，写错取值就该在编译期报错。
 */
export type RealnameAuthType =
  | 'IDENTITY_CARD'
  | 'ENTERPRISE'
  | 'SOLE_PROPRIETOR'
  | 'RESIDENCE_HK_MC'
  | 'RESIDENCE_TAIWAN'

/** 实名状态。契约里 `status` 同样是 `string`，`realnameStatusText` 等展示分支按它收窄。 */
export type UserRealnameStatus = 'pending' | 'approved' | 'rejected'

/**
 * 我的实名认证记录（`GET /api/realname/me`、提交与核身结果都回它）。
 *
 * 字段与契约 `RealnameResponse` 一致（含「仅本人可见」的证件号与手机号，含义见生成物里的字段描述），
 * 只做两处调整：
 * - `auth_type` / `status` 收窄成字面量联合，比契约更严；
 * - `changing_subject` 契约里必填，这里放宽为可选：存量用例的构造体不提供该字段，
 *   消费处（`useRealnameIdentity`）本来就按 `Boolean(...)` 判空。
 */
export type UserRealnameVerification = Omit<
  Schemas['RealnameResponse'],
  'auth_type' | 'status' | 'changing_subject'
> & {
  auth_type: RealnameAuthType
  status: UserRealnameStatus
  /** 是否处于「主体变更」：本行正在替换一份已通过的主体，撤回即取消变更、还原原主体。 */
  changing_subject?: boolean
}

/**
 * 提交实名认证的请求体（`POST /api/realname/`）。
 *
 * 字段同契约 `SubmitRealnameRequest`（企业进件资料、监护人同意都是可选），只把 `auth_type` 收窄。
 */
export type SubmitRealnameVerificationPayload = Omit<
  Schemas['SubmitRealnameRequest'],
  'auth_type'
> & {
  auth_type: RealnameAuthType
}

export type SubmitRealnameVerificationResponse = UserRealnameVerification

/**
 * 微信人脸核身结果。
 *
 * 契约未覆盖（后端 utoipa 还没产出 `/realname/faceid/wechat/*` 的 schema），保持手写。
 */
export type StartWechatFaceidVerificationResponse = {
  verification: UserRealnameVerification
  order_no: string
  biz_token: string
  auth_url: string
  expires_in_seconds: number
}

/** 契约未覆盖（同 `StartWechatFaceidVerificationResponse`），保持手写。 */
export type CompleteWechatFaceidVerificationPayload = {
  order_no?: string | null
  biz_token?: string | null
}

/** 撤回结果（`POST /api/realname/withdraw`），字段同契约 `WithdrawResponse`。 */
export type WithdrawRealnameVerificationResponse = Schemas['WithdrawResponse'] & {
  /** 本次撤回是「取消主体变更」：账号已还原成变更前那份实名主体，而不是回到未提交。 */
  restored: boolean
}

/** 本次上传材料发起认证；姓名和工商信息由后端 OCR，不由前端读取旧实名记录。 */
export type QuickStartIdentifyPayload = Schemas['QuickStartIdentifyRequest'] & {
  auth_type: RealnameAuthType
  identify_type: number
}

/** 爱签个人核身请求体（`POST /api/realname/asign/start`），字段同契约 `StartIdentifyRequest`。 */
export type StartAsignIdentifyPayload = Schemas['StartIdentifyRequest']

/** 爱签个人核身响应（含「转人工审核」标记），字段同契约 `StartIdentifyResponse`。 */
export type StartAsignIdentifyResponse = Schemas['StartIdentifyResponse']

/**
 * 爱签企业核身请求体（`POST /api/realname/asign/company/start`）。
 *
 * 契约 `StartCompanyIdentifyRequest` 把企业进件资料（省市编码、注册地址、经营范围、三张证照的有效期）
 * 全标成可选，但渠道逐项必填、缺一项整条对公收款通道都开不了，所以这里仍按必填收窄。
 */
export type StartCompanyIdentifyPayload = Schemas['StartCompanyIdentifyRequest'] & {
  /** 企业所在省份 / 城市（渠道省市编码表，非国标行政区划码），企业进件必填。 */
  company_prov_code: string
  company_area_code: string
  company_address: string
  business_scope: string
  /** 营业执照有效期截止日，`YYYYMMDD`，长期填 20991231。 */
  business_license_expires_on: string
  /** 法人证件有效期起始日，`YYYYMMDD`（与截止日同口径）。 */
  legal_cert_begin_on: string
  /** 法人证件有效期截止日，`YYYYMMDD`，长期填 20991231。 */
  legal_cert_expires_on: string
}

/** 爱签企业核身响应，字段同契约 `StartCompanyIdentifyResponse`。 */
export type StartCompanyIdentifyResponse = Schemas['StartCompanyIdentifyResponse']

/**
 * 上传监护人同意书成功后的响应（`POST /api/realname/consent-file`）。
 *
 * 手写而非契约：新契约里有这个端点，但**没有声明响应体**（响应 schema 为空），
 * 所以按后端实际返回的字段写，等 utoipa 补上响应 schema 再改回别名。
 */
export type GuardianConsentUploadResponse = {
  guardian_consent_file: string
}

/** 上传营业执照成功后的响应（`POST /api/realname/business-license-file`）；契约未声明响应体，手写。 */
export type BusinessLicenseUploadResponse = {
  business_license_file: string
}

/** 上传法人身份证人像面成功后的响应（`POST /api/realname/legal-cert-front-file`）；契约未声明响应体，手写。 */
export type LegalCertFrontUploadResponse = {
  front_file: string
}

/** 上传法人身份证国徽面成功后的响应（`POST /api/realname/legal-cert-back-file`）；契约未声明响应体，手写。 */
export type LegalCertBackUploadResponse = {
  back_file: string
}

/**
 * 营业执照 OCR 识别结果：只包含可回填表单的白名单字段。
 *
 * 契约 `BusinessLicenseOcrResponse` 把六项全标成可选，本仓按「键一定在、值可能为 null」收窄：
 * 回填表单时逐项判断 `null` 即可，不必再区分「字段缺失」。
 */
export type BusinessLicenseOcrResult = Schemas['BusinessLicenseOcrResponse'] & {
  company_name: string | null
  unified_social_credit_code: string | null
  company_address: string | null
  business_scope: string | null
  legal_person: string | null
  /** 有效期截止 `YYYYMMDD`（「长期」已由后端归一为 20991231） */
  business_license_expires_on: string | null
}

/**
 * 法人身份证的哪一面：`front` = 人像面，`back` = 国徽面（与两个上传端点一一对应）。
 *
 * 契约里 `LegalCertOcrRequest.side` 是 `string | null`，这里收窄成两个取值。
 */
export type LegalCertOcrSide = 'front' | 'back'

/**
 * 法人证件有效期 OCR 结果：只回有效期起止（`YYYYMMDD`），识别不到的项为 `null`。
 *
 * 与营业执照 OCR 同口径的白名单：身份证号、姓名等敏感字段后端一律不外露。
 * 契约 `LegalCertOcrResponse` 两项都可选，本仓同样按「键一定在、值可能为 null」收窄。
 */
export type LegalCertOcrResult = Schemas['LegalCertOcrResponse'] & {
  cert_begin_on: string | null
  cert_expires_on: string | null
}
