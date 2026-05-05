import { authHeaders, requestJson } from '@dev/api/http'

export type DevRealnameAuthType = 'IDENTITY_CARD' | 'RESIDENCE_HK_MC' | 'RESIDENCE_TAIWAN'
export type DevRealnameStatus = 'pending' | 'approved' | 'rejected'

export type DevRealnameVerification = {
  username: string
  auth_type: DevRealnameAuthType
  status: DevRealnameStatus
  real_name?: string | null
  id_card_no?: string | null
  company_name?: string | null
  unified_social_credit_code?: string | null
  business_license_no?: string | null
  operator_name?: string | null
  operator_id_card_no?: string | null
  review_note?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  created_at: string
  updated_at: string
}

export type DevSubmitRealnamePayload = {
  auth_type: DevRealnameAuthType
  real_name?: string
  id_card_no?: string
  company_name?: string
  unified_social_credit_code?: string
  business_license_no?: string
  operator_name?: string
  operator_id_card_no?: string
}

export async function getMyRealnameVerification(token: string): Promise<DevRealnameVerification> {
  return requestJson<DevRealnameVerification>(
    '/realname/me',
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    '加载实名认证信息失败',
  )
}

export async function submitRealnameVerification(
  token: string,
  payload: DevSubmitRealnamePayload,
): Promise<DevRealnameVerification> {
  return requestJson<DevRealnameVerification>(
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