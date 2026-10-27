import { authHeaders, requestJson } from '@/api/http'

import type {
  StartAsignIdentifyPayload,
  StartAsignIdentifyResponse,
  StartCompanyIdentifyPayload,
  StartCompanyIdentifyResponse,
  QuickStartIdentifyPayload,
  UserRealnameVerification,
} from './types'

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

export async function quickStartAsignIdentify(
  token: string,
  payload: QuickStartIdentifyPayload,
): Promise<StartAsignIdentifyResponse> {
  return requestJson<StartAsignIdentifyResponse>(
    '/realname/asign/quick-start',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '发起爱签实名认证失败',
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
