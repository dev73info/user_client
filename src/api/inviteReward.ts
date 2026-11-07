/**
 * 邀请现金奖励：概览、领取、查单。
 *
 * 契约见根仓 `docs/任务/2026-11-07-邀请奖励现金发放.md` 第 5 节。
 * 后端先落地、OpenAPI 生成物还没刷新，所以响应形状先按契约原样写在这里；
 * 生成物更新后（主会话统一 `pnpm contract:write`），这些类型应换成
 * `components['schemas'][...]`，页面调用点不需要动。
 *
 * 错误：请求层已把 `{code,message}` 归一成 `HttpError`（`err.code` / `err.message`），
 * 这里不吞错、不改公共层行为，调用方按 `err.code` 分支。
 */

import { authHeaders, requestJson } from '@/api/http'

/** 奖励明细状态：待满足条件 / 可领取 / 已并入转账单 / 已到账 / 发放失败（已回到可领取）。 */
export type InviteRewardStatus = 'pending' | 'available' | 'claimed' | 'paid' | 'failed'

/** 转账单状态：建单中 / 等用户确认 / 渠道处理中 / 成功 / 失败 / 已关闭。 */
export type InviteRewardPayoutStatus =
  | 'creating'
  | 'wait_user_confirm'
  | 'processing'
  | 'success'
  | 'failed'
  | 'cancelled'

/** 一条奖励明细（按被邀请人唯一）。`invitee` 已由后端脱敏。 */
export interface InviteRewardItem {
  id: string
  invitee: string
  amount_fen: number
  status: InviteRewardStatus
  /** 未满足条件时的原因文案（例如「待被邀请人完成实名认证」），可能为空。 */
  reason: string
  created_at: string
}

/** 一张转账单。`package_info` 是微信 JSAPI 拉起参数，为空表示要稍后查单。 */
export interface InviteRewardPayout {
  out_bill_no: string
  amount_fen: number
  reward_count: number
  status: InviteRewardPayoutStatus
  package_info: string | null
  created_at: string
}

export interface InviteRewardOverview {
  /** 活动开关：关闭时页面不展示领取入口。 */
  enabled: boolean
  /** 每邀请 1 位好友的固定金额（分），落库快照。 */
  amount_fen: number
  /** 被邀请人是否必须实名通过才能领取。 */
  require_invitee_realname: boolean
  /** 被邀请人注册满 N 天后才可领取。 */
  min_invitee_age_days: number
  total_invited: number
  /** 累计奖励（含待满足、可领取、已到账）。 */
  total_rewarded_fen: number
  available_fen: number
  pending_fen: number
  paid_fen: number
  rewards: InviteRewardItem[]
  payouts: InviteRewardPayout[]
}

/** 领取接口返回的单张转账单：字段名与微信 `requestMerchantTransfer` 入参一致。 */
export interface InviteRewardClaimPayout {
  out_bill_no: string
  amount_fen: number
  /** 与 `InviteRewardPayoutStatus` 同口径，当前只会返回 `wait_user_confirm` / `processing`。 */
  state: InviteRewardPayoutStatus
  package_info: string | null
  mch_id: string
  app_id: string
}

export interface InviteRewardClaimResponse {
  payouts: InviteRewardClaimPayout[]
}

export function getInviteRewards(token: string): Promise<InviteRewardOverview> {
  return requestJson('/invite/rewards', { headers: authHeaders(token) }, '加载邀请奖励失败')
}

/** 领取：无请求体；成功只返回需要用户确认或等查单的转账单。 */
export function claimInviteRewards(token: string): Promise<InviteRewardClaimResponse> {
  return requestJson(
    '/invite/rewards/claim',
    { method: 'POST', headers: authHeaders(token) },
    '领取邀请奖励失败',
  )
}

/** 查单：对非终态转账单向渠道核对，返回最新概览。 */
export function syncInviteRewards(token: string): Promise<InviteRewardOverview> {
  return requestJson(
    '/invite/rewards/sync',
    { method: 'POST', headers: authHeaders(token) },
    '同步邀请奖励失败',
  )
}
