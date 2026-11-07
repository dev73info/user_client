/**
 * 邀请现金奖励：概览、领取、查单。
 *
 * 契约类型来自后端 OpenAPI 生成物（`components['schemas'][...]`），不手写响应形状。
 * 规格见根仓 `docs/任务/2026-11-07-邀请奖励现金发放.md` 第 5 节。
 *
 * 错误：请求层已把 `{code,message}` 归一成 `HttpError`（`err.code` / `err.message`），
 * 这里不吞错、不改公共层行为，调用方按 `err.code` 分支。
 */

import type { components } from '@/api/generated/schema'
import { authHeaders, requestJson } from '@/api/http'

type Schemas = components['schemas']

/** 奖励明细状态：待满足条件 / 可领取 / 已并入转账单 / 已到账 / 发放失败（已回到可领取）。 */
export type InviteRewardStatus = 'pending' | 'available' | 'claimed' | 'paid' | 'failed'

export type InviteRewardItem = Schemas['InviteRewardItemResponse']
export type InviteRewardPayout = Schemas['InvitePayoutItemResponse']
export type InviteRewardPayoutStatus = InviteRewardPayout['status']
export type InviteRewardOverview = Schemas['InvitePanelResponse']
export type InviteRewardClaimPayout = Schemas['InviteClaimedPayoutResponse']
export type InviteRewardClaimResponse = Schemas['InviteClaimResponse']

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
