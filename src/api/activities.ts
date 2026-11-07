/**
 * 活动中心：浏览活动、报名 / key 兑换名额、我的参与与奖励、奖励转账单。
 *
 * 契约类型来自后端 OpenAPI 生成物（`components['schemas'][...]`），不手写响应形状。
 * 后端 spec 见 `src/api/generated/openapi.json`（`../backend_73info/openapi.json` 的副本）。
 *
 * 时间：东八区 `YYYY-MM-DD HH:MM:SS`（展示走 `@/shared/datetime`）。
 * 金额：整数分（展示走 `@/shared/money`）。
 * 错误：请求层已归一成 `HttpError`，调用方按 `err.code` 分支（清单见 `@/shared/api/errorCodes`）。
 */

import type { components } from '@/api/generated/schema'
import { authHeaders, requestJson } from '@/api/http'

type Schemas = components['schemas']

/** 活动阶段：草稿 / 未开始 / 进行中 / 已暂停 / 已结束。契约里是字符串，这里只收窄前端要分支的值。 */
export type ActivityPhase = 'draft' | 'not_started' | 'active' | 'paused' | 'ended'

/** 奖励状态：待发放 / 待绑定微信 / 发放中 / 已到账 / 已取消。 */
export type ActivityRewardStatus =
  | 'pending'
  | 'waiting_wechat'
  | 'transferring'
  | 'paid'
  | 'cancelled'

/** 转账单状态。`wait_user_confirm` 带 `package_info` 时才能拉起微信确认页。 */
export type ActivityPayoutStatus =
  | 'creating'
  | 'wait_user_confirm'
  | 'processing'
  | 'success'
  | 'failed'
  | 'cancelled'

export type ActivitySummary = Schemas['ActivitySummaryResponse']
export type ActivityDetail = Schemas['ActivityDetailResponse']
export type ActivityRewardItem = Schemas['ActivityRewardItemResponse']
export type ActivityPayoutItem = Schemas['ActivityPayoutItemResponse']
export type ActivitySignupResponse = Schemas['ActivitySignupResponse']
export type ActivityListResponse = Schemas['ActivityListResponse']
export type MyActivityRewardsResponse = Schemas['MyActivityRewardsResponse']
export type MyActivityRewardsSummary = Schemas['MyRewardSummaryResponse']
export type ActivityParticipation = Schemas['ParticipationResponse']
export type ActivityInviteSummary = Schemas['InviteSummaryResponse']

function jsonHeaders(token: string): Headers {
  return authHeaders(token, { 'Content-Type': 'application/json' })
}

/** 活动列表：已发布活动，支持按标题 / 标识搜索与 `general` / `invite` 类型筛选。 */
export function listActivities(
  token: string,
  params: { keyword?: string; activityType?: string } = {},
): Promise<ActivityListResponse> {
  const search = new URLSearchParams()
  const keyword = params.keyword?.trim()
  if (keyword) search.set('keyword', keyword)
  const activityType = params.activityType?.trim()
  if (activityType) search.set('activity_type', activityType)
  const query = search.toString()
  return requestJson(
    `/activities${query ? `?${query}` : ''}`,
    { headers: authHeaders(token) },
    '加载活动失败',
  )
}

export function getActivityDetail(token: string, code: string): Promise<ActivityDetail> {
  return requestJson(
    `/activities/${encodeURIComponent(code)}`,
    { headers: authHeaders(token) },
    '加载活动详情失败',
  )
}

/** 报名：报名即占名额；奖励随后自动发起微信商家转账（无 openid 时为 `waiting_wechat`）。 */
export function signupActivity(token: string, code: string): Promise<ActivitySignupResponse> {
  return requestJson(
    `/activities/${encodeURIComponent(code)}/signup`,
    { method: 'POST', headers: authHeaders(token) },
    '报名失败',
  )
}

/** 输入 key 兑换名额（请求体里的 `code` 是 key，不是活动 code）。 */
export function redeemActivityKey(token: string, key: string): Promise<ActivitySignupResponse> {
  return requestJson(
    '/activities/redeem-key',
    { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ code: key }) },
    '兑换失败',
  )
}

/** 我参加过的活动。 */
export function listMyActivities(token: string): Promise<ActivityListResponse> {
  return requestJson('/activities/mine', { headers: authHeaders(token) }, '加载我的活动失败')
}

/** 我的全部活动奖励与转账单。 */
export function getMyActivityRewards(token: string): Promise<MyActivityRewardsResponse> {
  return requestJson('/activities/rewards', { headers: authHeaders(token) }, '加载活动奖励失败')
}

/** 查单：对非终态转账单向渠道核对，并返回最新奖励 / 转账单。 */
export function syncMyActivityRewards(token: string): Promise<MyActivityRewardsResponse> {
  return requestJson(
    '/activities/rewards/sync',
    { method: 'POST', headers: authHeaders(token) },
    '同步活动奖励失败',
  )
}
