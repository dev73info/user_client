import { authHeaders, requestJson } from '@/api/http'

export type RealnameAuthType = 'IDENTITY_CARD' | 'RESIDENCE_HK_MC' | 'RESIDENCE_TAIWAN'
export type UserRealnameStatus = 'pending' | 'approved' | 'rejected'

export type UserRealnameVerification = {
  username: string
  auth_type: RealnameAuthType
  status: UserRealnameStatus
  real_name?: string | null
  id_card_no_masked?: string | null
  company_name?: string | null
  unified_social_credit_code?: string | null
  business_license_no?: string | null
  operator_name?: string | null
  operator_id_card_no_masked?: string | null
  review_note?: string | null
  reviewed_by?: string | null
  reviewed_by_avatar_url?: string | null
  reviewed_at?: string | null
  created_at: string
  updated_at: string
}

export type SubmitRealnameVerificationPayload = {
  auth_type: RealnameAuthType
  real_name?: string | null
  id_card_no?: string | null
  company_name?: string | null
  unified_social_credit_code?: string | null
  business_license_no?: string | null
  operator_name?: string | null
  operator_id_card_no?: string | null
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
