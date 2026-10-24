import { authHeader, requestJson } from '@/api/http'
import { getPaymentLimits } from '@/api/payments'

import type { ActivityCampaignClaimResp, DepositRatioResp } from './types'

/**
 * 定金比例。
 *
 * 契约里**没有** 1.x 的 `/system/settings/deposit-ratio`；定金比例与平台费率都在
 * `GET /api/payment/limits/system` 的 `PaymentConfig` 上，值是**基点** `deposit_ratio_bps`
 * （1000 = 10%）。既有调用方读的是百分数 `deposit_ratio_percent`，所以这里换算一次后按
 * 视图形状返回，调用方（`useDepositPayment` / `useMyRequirementsData` /
 * `useConversationActionState`）不用改。
 *
 * 失败一律抛给调用方（`getPaymentLimits` 内部就是 `requestJson`）：不要吞成 `null`，
 * 否则定金比例静默停在默认值，页面上的钱按错的比例展示。
 */
export async function getDepositRatio(token: string): Promise<DepositRatioResp> {
  const config = await getPaymentLimits(token)
  const bps = config.deposit_ratio_bps
  if (!Number.isFinite(bps)) {
    throw new Error('定金比例响应缺少 deposit_ratio_bps')
  }
  return { deposit_ratio_percent: bps / 100 }
}

/** 领取活动福利（`POST /api/system/settings/activity-campaigns/claim`）。 */
export async function claimActivityCampaign(
  token: string,
  claimCode: string,
): Promise<ActivityCampaignClaimResp> {
  return requestJson<ActivityCampaignClaimResp>(
    '/settings/activity-campaigns/claim',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ code: claimCode }),
    },
    '领取活动福利失败',
  )
}
