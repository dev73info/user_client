/**
 * 活动域接口：列表 / 详情 / 报名 / key 兑换 / 我的活动 / 我的奖励 / 查单。
 *
 * 数据与状态变更在 `db/activities.ts`：报名后名额真的减少、奖励真的出现，
 * 查单真的生成带 `package_info` 的待确认转账单，页面不会出现「提示成功但数字没动」的假象。
 *
 * 路由顺序有讲究：`/activities/rewards`、`/activities/mine` 必须排在 `/activities/:code` 前面，
 * 否则会被当成 code 为 `rewards` / `mine` 的活动详情。
 */

import { defineRouteTable, type MockRoute } from '../router'
import { jsonResponse, readString } from '../response'
import {
  getActivityDetailByCode,
  listActivities,
  myActivities,
  myActivityRewards,
  redeemKey,
  signup,
  syncActivityRewards,
  type ActivityError,
} from '../db/activities'

function errorResponse(error: ActivityError) {
  return jsonResponse({ code: error.code, message: error.message }, error.status)
}

function notFound() {
  return jsonResponse({ code: 'ACTIVITY_NOT_FOUND', message: '活动不存在' }, 404)
}

const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/activities',
    note: '活动列表（keyword / activity_type，不分页）',
    handler: (request) =>
      jsonResponse(
        listActivities(
          readString(request.query, 'keyword'),
          readString(request.query, 'activity_type'),
        ),
      ),
  },
  {
    method: 'GET',
    path: '/activities/mine',
    note: '我参与过的活动',
    handler: () => jsonResponse(myActivities()),
  },
  {
    method: 'GET',
    path: '/activities/rewards',
    note: '我的活动奖励与转账单',
    handler: () => jsonResponse(myActivityRewards()),
  },
  {
    method: 'POST',
    path: '/activities/rewards/sync',
    note: '查单：推进处理中的转账单，并把待入账奖励合成待确认转账单',
    handler: () => jsonResponse(syncActivityRewards()),
  },
  {
    method: 'POST',
    path: '/activities/redeem-key',
    note: 'key 兑换名额',
    handler: (request) => {
      const body = (request.body ?? {}) as { code?: string }
      const result = redeemKey((body.code ?? '').trim())
      return result.ok ? jsonResponse(result.value) : errorResponse(result.error)
    },
  },
  {
    method: 'POST',
    path: '/activities/:code/signup',
    note: '报名：占一个名额并生成待入账奖励',
    handler: (_request, params) => {
      const result = signup(params.code ?? '')
      return result.ok ? jsonResponse(result.value) : errorResponse(result.error)
    },
  },
  {
    method: 'GET',
    path: '/activities/:code',
    note: '活动详情',
    handler: (_request, params) => {
      const detail = getActivityDetailByCode(params.code ?? '')
      return detail ? jsonResponse(detail) : notFound()
    },
  },
]

export const activityRoutes = defineRouteTable('activities', routes)
