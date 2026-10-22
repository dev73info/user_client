import { authHeaders, requestJson } from '@/api/http'

import type {
  SubmitRealnameVerificationPayload,
  SubmitRealnameVerificationResponse,
  UserRealnameVerification,
  WithdrawRealnameVerificationResponse,
} from './types'

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
