import { authHeader, requestJson } from '@/api/http'

import type { ResourceApiChannelPayload, UpdateResourceApiChannelRequest } from './types'

/** 读取某个资源的接口渠道配置；资源没配过渠道时后端回默认值（不 404）。 */
export async function getResourceApiChannel(
  token: string,
  resourceId: number,
): Promise<ResourceApiChannelPayload> {
  return requestJson<ResourceApiChannelPayload>(
    `/dev/resources/resources/${resourceId}/api-channel`,
    {
      method: 'GET',
      headers: {
        ...authHeader(token),
      },
    },
    '加载接口资源渠道配置失败',
  )
}

/** 写入某个资源的接口渠道配置；字段缺省 = 不改这一项。 */
export async function updateResourceApiChannel(
  token: string,
  resourceId: number,
  payload: UpdateResourceApiChannelRequest,
): Promise<ResourceApiChannelPayload> {
  return requestJson<ResourceApiChannelPayload>(
    `/dev/resources/resources/${resourceId}/api-channel`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '保存接口资源渠道配置失败',
  )
}
