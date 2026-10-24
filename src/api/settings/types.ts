/**
 * 设置域的响应 / 请求类型。
 *
 * 能取生成物的一律取 `components['schemas'][...]`；只有契约里确实没有结构的才手写并注明原因。
 */
import type { components } from '@/api/generated/schema'

type Schemas = components['schemas']

/** 我的档案（`GET / PUT /system/settings/profile`）。 */
export type ProfileResponse = Schemas['ProfileResponse']

/** 改档案请求体。注意只有 `profile_description` 与 `new_username`（后者不接受自助改名）。 */
export type UpdateProfileRequest = Schemas['UpdateProfileRequest']

/** 订阅开关响应。 */
export type SubscriptionResponse = Schemas['SubscriptionResponse']

/**
 * 我的消息订阅开关（读写同一形状）。
 *
 * ⚠️ **契约这里贴错了模型**：`GET / PUT /system/settings/profile/subscriptions` 声明回
 * `SubscriptionResponse{requirement_id, subscribe_status_change}`——那是「需求状态变更订阅」
 * 的形状，而同一端点的请求体 `UpdateSubscriptionsRequest` 与档案 `ProfileResponse` 都是
 * 这两个布尔开关。前端按布尔开关消费（与 `ProfileResponse.subscribe_*` 同源），
 * 后端把 schema 改对之后直接换成生成物。
 */
export type ProfileSubscriptionsResp = {
  subscribe_official_activity: boolean
  subscribe_dev_hall_deposit_paid: boolean
}

/** 改订阅开关请求体：`null` / 缺省表示不改该项。 */
export type UpdateSubscriptionsRequest = Schemas['UpdateSubscriptionsRequest']

/** 活动福利领取结果。 */
export type ActivityCampaignClaimResp = Schemas['ActivityCampaignClaimResponse']

/**
 * 定金比例（**视图形状**，契约里没有这个结构）。
 *
 * 契约里**没有** 1.x 的 `/system/settings/deposit-ratio`；2.0 的定金比例与平台费率在
 * `GET /payment/limits/system` 上，值是基点 `deposit_ratio_bps`（1000 = 10%）。既有调用方
 * （`useDepositPayment` / `useMyRequirementsData` / `useConversationActionState`）读百分数，
 * 所以 `getDepositRatio` 在取数处换算成这个形状返回。1.x 的 `min_percent` / `max_percent`
 * 契约里没有，已删。
 */
export type DepositRatioResp = {
  /** 定金占总额的百分比（`deposit_ratio_bps / 100`，如 10 表示 10%） */
  deposit_ratio_percent: number
}
