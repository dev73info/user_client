/**
 * 「已授权应用」与「分享数据」的假路由。
 *
 * 两条都不长，但漏了都是硬伤：
 * - `GET /oauth/authorizations` 漏了 → 已授权应用页恒为空，看起来像从没授权过任何站点；
 * - `GET /share/stats` 漏了 → 邀榜页读 `stats.records.length` 直接抛，
 *   连排行榜本身都不渲染（兜底的 `[]` 上没有 `records`）。
 *
 * 数据量小、形状固定，所以两条放在同一个文件里。
 */

import type { components } from '@/api/generated/schema'

import type { MockRoute } from '../../router'
import { datetime } from '../../db/shared'
import { jsonResponse, noContentResponse } from '../../response'

type UserAuthorization = components['schemas']['UserAuthorizationResponse']
type ShareStats = components['schemas']['ShareStatsResponse']

/** 已授权的开发者站点：一条有效、一条历史（用来演示撤销按钮）。 */
const authorizations: UserAuthorization[] = [
  {
    developer_username: 'dev_flow_03562487',
    external_user_ids: ['73info_0d3f'],
    authorized_at: datetime(-18, 10, 20),
    updated_at: datetime(-18, 10, 20),
  },
  {
    developer_username: 'toolsmith_demo',
    external_user_ids: ['73info_88a1'],
    authorized_at: datetime(-64, 15, 5),
    updated_at: datetime(-64, 15, 5),
  },
]

export const shareRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/oauth/authorizations',
    note: '我授权过的开发者站点（契约 `UserAuthorizationResponse[]`）',
    handler: () => jsonResponse(authorizations),
  },
  {
    method: 'DELETE',
    path: '/oauth/authorizations/:developer_username',
    note: '撤销授权',
    handler: (_request, params) => {
      const index = authorizations.findIndex(
        (item) => item.developer_username === params.developer_username,
      )
      if (index >= 0) {
        authorizations.splice(index, 1)
      }

      return noContentResponse()
    },
  },
  {
    method: 'GET',
    path: '/share/stats',
    note: '我的分享数据（契约 `ShareStatsResponse`；records 必须在，页面直接读它的 length）',
    handler: () => {
      const body: ShareStats = {
        total_visits: 128,
        total_registrations: 9,
        records: [
          { share_type: 'invite', target_id: null, visits: 74, registrations: 6 },
          { share_type: 'resource', target_id: '9001', visits: 41, registrations: 2 },
          {
            share_type: 'requirement',
            target_id: 'REQ-20260907-0051',
            visits: 13,
            registrations: 1,
          },
        ],
      }

      return jsonResponse(body)
    },
  },
]
