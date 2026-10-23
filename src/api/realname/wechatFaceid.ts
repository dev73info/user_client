import { authHeaders, requestJson } from '@/api/http'

import type {
  CompleteWechatFaceidVerificationPayload,
  StartWechatFaceidVerificationResponse,
  SubmitRealnameVerificationPayload,
  UserRealnameVerification,
} from './types'

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
