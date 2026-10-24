import { authHeaders, requestJson } from '@/api/http'

import type { CheckinResponse, CheckinStatus } from './types'

export async function doCheckin(token: string): Promise<CheckinResponse> {
  return requestJson<CheckinResponse>(
    '/points/checkin',
    { method: 'POST', headers: authHeaders(token) },
    '签到失败',
  )
}

export async function getCheckinStatus(token: string): Promise<CheckinStatus> {
  return requestJson<CheckinStatus>(
    '/points/checkin/status',
    { headers: authHeaders(token) },
    '加载签到状态失败',
  )
}
