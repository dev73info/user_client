import { authHeaders, requestJson } from '@/api/http'

import type { DevAccessStatus } from './types'

export async function requestDevRole(token: string): Promise<{ username: string; role: string }> {
  return requestJson<{ username: string; role: string }>(
    '/auth/request-dev-role',
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    '申请开发者权限失败',
  )
}

/**
 * 只读查询当前用户的开发者资格与入驻协议签约状态。
 *
 * 与 `requestDevRole` 不同：本接口不会授予角色，也不会因未签署入驻协议而失败，
 * 前端用它展示签约状态，并在担保接单前提示开发者签署入驻协议。
 */
export async function getDevAccessStatus(token: string): Promise<DevAccessStatus> {
  return requestJson<DevAccessStatus>(
    '/auth/dev-access-status',
    { headers: authHeaders(token) },
    '获取开发者权限状态失败',
  )
}
