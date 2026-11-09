import { authHeader, requestJson } from '@/api/http'

import type { ActivityCampaignClaimResp, DepositRatioResp, DepositRatioResponse } from './types'

/**
 * 定金比例（用户面只读端点 `GET /api/payment/deposit-ratio`）。
 *
 * 不能读管理端的 `GET /api/payment/limits/system`：那个要 `payment.config.get`，只授超管，
 * 普通用户每次进工作台都会 403，比例只能静默停在写死的默认值。用户面端点登录即可读，
 * 返回值是**基点** `deposit_ratio_bps`（1000 = 10%）。既有调用方读的是百分数
 * `deposit_ratio_percent`，所以这里换算一次后按视图形状返回，调用方
 * （`useDepositPayment` / `useMyRequirementsData` / `useConversationActionState`）不用改。
 *
 * 失败一律抛给调用方：不要吞成 `null`，否则定金比例静默停在默认值，页面上的钱按错的比例展示。
 */
export async function getDepositRatio(token: string): Promise<DepositRatioResp> {
  const config = await requestJson<DepositRatioResponse>(
    '/payment/deposit-ratio',
    { headers: authHeader(token) },
    '加载定金比例失败',
  )
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
