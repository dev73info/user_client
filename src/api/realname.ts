import { authHeader, authHeaders, requestJson } from '@/api/http'

export type RealnameAuthType =
  | 'IDENTITY_CARD'
  | 'ENTERPRISE'
  | 'SOLE_PROPRIETOR'
  | 'RESIDENCE_HK_MC'
  | 'RESIDENCE_TAIWAN'
export type UserRealnameStatus = 'pending' | 'approved' | 'rejected'

export type UserRealnameVerification = {
  username: string
  auth_type: RealnameAuthType
  status: UserRealnameStatus
  real_name?: string | null
  /** 本人证件号（**仅本人可见**，管理端接口会清空）：企业认证回填「经办人身份证号」用 */
  id_card_no?: string | null
  id_card_no_masked?: string | null
  birthday?: string | null
  mobile_masked?: string | null
  /** 本人手机号（**仅本人可见**）：企业认证回填「经办人手机号」用 */
  mobile?: string | null
  company_name?: string | null
  unified_social_credit_code?: string | null
  business_license_no?: string | null
  business_license_file?: string | null
  operator_name?: string | null
  operator_id_card_no_masked?: string | null
  /**
   * 企业进件资料：支付渠道创建企业会员（对公收款账户）时逐项必填，
   * 缺任意一项整条对公收款通道都开不了，所以企业主体提交实名时就要收齐。
   */
  company_prov_code?: string | null
  company_area_code?: string | null
  company_address?: string | null
  business_scope?: string | null
  business_license_expires_on?: string | null
  /** 法人证件有效期起始日，`YYYYMMDD`。 */
  legal_cert_begin_on?: string | null
  legal_cert_expires_on?: string | null
  guardian_consent?: boolean | null
  guardian_consent_file?: string | null
  review_note?: string | null
  reviewed_by?: string | null
  reviewed_by_avatar_url?: string | null
  reviewed_at?: string | null
  created_at: string
  updated_at: string
  /** 爱签实名认证流水号：仅走爱签核身的主体才有，用于「重新实名认证」。 */
  /** 是否处于「主体变更」：本行正在替换一份已通过的主体，撤回即取消变更、还原原主体。 */
  changing_subject?: boolean
}

export type SubmitRealnameVerificationPayload = {
  auth_type: RealnameAuthType
  real_name?: string | null
  id_card_no?: string | null
  mobile?: string | null
  company_name?: string | null
  unified_social_credit_code?: string | null
  business_license_no?: string | null
  business_license_file?: string | null
  operator_name?: string | null
  operator_id_card_no?: string | null
  /** 企业进件资料：企业 / 个体工商户主体必填（渠道逐项校验），个人主体不传。 */
  company_prov_code?: string | null
  company_area_code?: string | null
  company_address?: string | null
  business_scope?: string | null
  /** 营业执照有效期截止日，`YYYYMMDD`，长期填 20991231。 */
  business_license_expires_on?: string | null
  /** 法人证件有效期起始日，`YYYYMMDD`。 */
  legal_cert_begin_on?: string | null
  /** 法人证件有效期截止日，`YYYYMMDD`，长期填 20991231。 */
  legal_cert_expires_on?: string | null
  guardian_consent?: boolean | null
  guardian_consent_file?: string | null
}

export type SubmitRealnameVerificationResponse = UserRealnameVerification

export type StartWechatFaceidVerificationResponse = {
  verification: UserRealnameVerification
  order_no: string
  biz_token: string
  auth_url: string
  expires_in_seconds: number
}

export type CompleteWechatFaceidVerificationPayload = {
  order_no?: string | null
  biz_token?: string | null
}

export async function getMyRealnameVerification(token: string): Promise<UserRealnameVerification> {
  return requestJson<UserRealnameVerification>(
    '/realname/me',
    {
      headers: authHeaders(token),
    },
    '加载实名认证状态失败',
  )
}

export async function submitMyRealnameVerification(
  token: string,
  payload: SubmitRealnameVerificationPayload,
): Promise<SubmitRealnameVerificationResponse> {
  return requestJson<SubmitRealnameVerificationResponse>(
    '/realname/',
    {
      method: 'POST',
      headers: authHeaders(token, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    },
    '提交实名认证失败',
  )
}

export async function startWechatFaceidVerification(
  token: string,
  payload: SubmitRealnameVerificationPayload,
): Promise<StartWechatFaceidVerificationResponse> {
  return requestJson<StartWechatFaceidVerificationResponse>(
    '/realname/faceid/wechat/start',
    {
      method: 'POST',
      headers: authHeaders(token, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    },
    '发起微信人脸核身失败',
  )
}

export async function completeWechatFaceidVerification(
  token: string,
  payload: CompleteWechatFaceidVerificationPayload = {},
): Promise<UserRealnameVerification> {
  return requestJson<UserRealnameVerification>(
    '/realname/faceid/wechat/result',
    {
      method: 'POST',
      headers: authHeaders(token, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    },
    '查询微信人脸核身结果失败',
  )
}

export type WithdrawRealnameVerificationResponse = {
  withdrawn: boolean
  /** 本次撤回是「取消主体变更」：账号已还原成变更前那份实名主体，而不是回到未提交。 */
  restored: boolean
}

export async function withdrawMyRealnameVerification(
  token: string,
): Promise<WithdrawRealnameVerificationResponse> {
  return requestJson<WithdrawRealnameVerificationResponse>(
    '/realname/withdraw',
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    '撤回实名认证失败',
  )
}

export type StartAsignIdentifyPayload = {
  real_name: string
  id_card_no: string
  mobile?: string | null
  guardian_consent?: boolean | null
  guardian_consent_file?: string | null
}

export type StartAsignIdentifyResponse = {
  auth_url: string
  /** 业务 ID，用于查询人脸活体认证结果 */
  biz_id?: string | null
  /** 是否为人工审核（非大陆身份证个人证件，爱签不提供实名认证服务时） */
  manual_review?: boolean
}

export async function startAsignIdentify(
  token: string,
  payload: StartAsignIdentifyPayload,
): Promise<StartAsignIdentifyResponse> {
  return requestJson<StartAsignIdentifyResponse>(
    '/realname/asign/start',
    {
      method: 'POST',
      headers: authHeaders(token, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    },
    '发起爱签实名认证失败',
  )
}

export type StartCompanyIdentifyPayload = {
  company_name: string
  unified_social_credit_code: string
  operator_name: string
  operator_id_card_no: string
  mobile: string
  business_license_file: string
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

export type StartCompanyIdentifyResponse = {
  auth_url: string
  /** 业务 ID（发起认证时返回） */
  biz_id?: string | null
}

export async function startCompanyAsignIdentify(
  token: string,
  payload: StartCompanyIdentifyPayload,
): Promise<StartCompanyIdentifyResponse> {
  return requestJson<StartCompanyIdentifyResponse>(
    '/realname/asign/company/start',
    {
      method: 'POST',
      headers: authHeaders(token, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    },
    '发起爱签企业实名认证失败',
  )
}

export async function resumeAsignIdentify(token: string): Promise<StartAsignIdentifyResponse> {
  return requestJson<StartAsignIdentifyResponse>(
    '/realname/asign/resume',
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    '恢复实名认证二维码失败',
  )
}

export async function resumeCompanyAsignIdentify(
  token: string,
): Promise<StartCompanyIdentifyResponse> {
  return requestJson<StartCompanyIdentifyResponse>(
    '/realname/asign/company/resume',
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    '恢复企业认证二维码失败',
  )
}

/**
 * 查询爱签实名认证结果。
 *
 * 不需要任何凭证：实名认证流水号在「发起认证」时就已由后端落库，
 * 前端（以及浏览器历史里的回跳 URL）全程拿不到它。
 */
export async function completeAsignIdentify(token: string): Promise<UserRealnameVerification> {
  return requestJson<UserRealnameVerification>(
    '/realname/asign/result',
    {
      method: 'POST',
      headers: authHeaders(token, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({}),
    },
    '查询爱签实名认证结果失败',
  )
}

export type GuardianConsentUploadResponse = {
  guardian_consent_file: string
}

export async function uploadGuardianConsentFile(
  token: string,
  file: File,
): Promise<GuardianConsentUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<GuardianConsentUploadResponse>(
    '/realname/consent-file',
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '上传监护人同意书失败',
  )
}

export type BusinessLicenseUploadResponse = {
  business_license_file: string
}

export async function uploadBusinessLicenseFile(
  token: string,
  file: File,
): Promise<BusinessLicenseUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<BusinessLicenseUploadResponse>(
    '/realname/business-license-file',
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '上传营业执照失败',
  )
}

export type LegalCertFrontUploadResponse = {
  front_file: string
}

/**
 * 上传法人身份证**人像面**照片（企业开户进件三张证照之一）。
 *
 * 与营业执照不同，此接口**上传即落库**（后端写进 `realname_legal_cert.front_file`），
 * 进件时由另一个链路读取，所以返回值**不需要**再塞进提交实名的 payload。
 */
export async function uploadLegalCertFrontFile(
  token: string,
  file: File,
): Promise<LegalCertFrontUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<LegalCertFrontUploadResponse>(
    '/realname/legal-cert-front-file',
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '上传法人身份证人像面失败',
  )
}

export type LegalCertBackUploadResponse = {
  back_file: string
}

/** 上传法人身份证**国徽面**照片（同 `uploadLegalCertFrontFile`，上传即落库）。 */
export async function uploadLegalCertBackFile(
  token: string,
  file: File,
): Promise<LegalCertBackUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<LegalCertBackUploadResponse>(
    '/realname/legal-cert-back-file',
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '上传法人身份证国徽面失败',
  )
}

/** 营业执照 OCR 识别结果：只包含可回填表单的白名单字段。 */
export type BusinessLicenseOcrResult = {
  company_name: string | null
  unified_social_credit_code: string | null
  company_address: string | null
  business_scope: string | null
  legal_person: string | null
  /** 有效期截止 `YYYYMMDD`（「长期」已由后端归一为 20991231） */
  business_license_expires_on: string | null
}

/**
 * 让后端 OCR 识别刚上传的营业执照，用于**辅助填写**企业信息。
 *
 * 失败（图片不清晰、PDF、渠道异常）会抛错，调用方应提示手工填写即可，不要阻断提交流程。
 * 响应里不含渠道流水号：后端只回白名单字段。
 */
export async function ocrBusinessLicense(
  token: string,
  businessLicenseFile: string,
): Promise<BusinessLicenseOcrResult> {
  return requestJson<BusinessLicenseOcrResult>(
    '/realname/business-license-ocr',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ business_license_file: businessLicenseFile }),
    },
    '营业执照识别失败',
  )
}

/** 法人身份证的哪一面：`front` = 人像面，`back` = 国徽面（与两个上传端点一一对应）。 */
export type LegalCertOcrSide = 'front' | 'back'

/**
 * 法人证件有效期 OCR 结果：只回有效期起止（`YYYYMMDD`），识别不到的项为 `null`。
 *
 * 与营业执照 OCR 同口径的白名单：身份证号、姓名等敏感字段后端一律不外露。
 */
export type LegalCertOcrResult = {
  cert_begin_on: string | null
  cert_expires_on: string | null
}

/** 后端返回体的原始形状：两种命名都收（见 `recognizeLegalCertPeriod` 的注释）。 */
type RawLegalCertOcrResult = {
  cert_begin_on?: string | null
  cert_expires_on?: string | null
  certBeginOn?: string | null
  certExpiresOn?: string | null
}

/**
 * 让后端 OCR 识别**已上传**的法人身份证，取出证件有效期起止，用于辅助填写「法人证件有效期」。
 *
 * 后端按 `side` 从 `realname_legal_cert` 取对应的那张已上传照片（本地压图后）送爱签识别，
 * 所以必须先上传照片再调；对应面还没上传时后端回 400（中文提示「请先上传…」）。
 *
 * 失败（图片不清晰、渠道异常、未上传）会抛错，调用方应**静默降级**：保留手填、不阻断提交。
 *
 * 字段名两种写法都收：任务书里写的是 `certBeginOn` / `certExpiresOn`，后端定稿的契约
 * （R025 任务-02）是 `cert_begin_on` / `cert_expires_on`——与本模块营业执照 OCR 的命名一致。
 * **以后端为准**，这里再做一层兼容读取，免得两种命名之间来回改。
 */
export async function recognizeLegalCertPeriod(
  token: string,
  side: LegalCertOcrSide = 'front',
): Promise<LegalCertOcrResult> {
  const raw = await requestJson<RawLegalCertOcrResult>(
    '/realname/legal-cert-ocr',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ side }),
    },
    '法人证件有效期识别失败',
  )
  return {
    cert_begin_on: raw.cert_begin_on ?? raw.certBeginOn ?? null,
    cert_expires_on: raw.cert_expires_on ?? raw.certExpiresOn ?? null,
  }
}
