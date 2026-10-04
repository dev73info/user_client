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
  id_card_no_masked?: string | null
  birthday?: string | null
  mobile_masked?: string | null
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
