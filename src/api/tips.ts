/**
 * 打赏（契约 `tips`）。
 *
 * 只有现金一种形态：`POST /api/tips` 的请求体是 `CreateTipRequest{developer, amount_fen,
 * message, anonymous}`，金额是**整数分**。契约里没有积分打赏（无论 `amount_points` /
 * `points_tiers` 还是积分手续费）、没有支付方式 `pay_method` / 渠道 `pay_channel`、
 * 也没有微信打赏中间页（授权地址 / JSAPI / 状态查询三支），所以这里一个都不留。
 *
 * 收银台地址由后端下单时回填在 `pay_url`（`TipOrderResponse` 的「电脑端扫码」），
 * 支付结果一律用 `GET /api/tips/{order_no}` 轮询，前端不另造一套状态。
 */
import type { components } from '@/api/generated/schema'
import { authHeaders, requestJson } from '@/api/http'

type Schemas = components['schemas']

/** 打赏单（契约 `TipOrderResponse`）。 */
export type TipOrder = Schemas['TipOrderResponse']

/** 打赏设置（契约 `TipConfigResponse`）：档位与自填上下限都是整数分。 */
export type TipConfig = Schemas['TipConfigResponse']

/** 写打赏设置（契约 `UpdateTipConfigRequest`，`updated_at` 忽略）。 */
export type TipSettingsPayload = Schemas['UpdateTipConfigRequest']

/** 发起打赏（契约 `CreateTipRequest`）：只发这四项，金额是整数分。 */
export type CreateTipPayload = {
  /** 被打赏的开发者登录名 */
  developer: string
  /** 金额（分） */
  amount_fen: number
  /** 留言，最多 200 字 */
  message?: string
  /** 是否匿名 */
  anonymous?: boolean
}

/** 我的打赏设置（`GET /api/tips/settings`）。 */
export async function getTipSettings(token: string): Promise<TipConfig> {
  return requestJson<TipConfig>(
    '/tips/settings',
    { method: 'GET', headers: authHeaders(token) },
    '加载打赏设置失败',
  )
}

/** 保存打赏设置（`PUT /api/tips/settings`）。 */
export async function updateTipSettings(
  token: string,
  payload: TipSettingsPayload,
): Promise<TipConfig> {
  return requestJson<TipConfig>(
    '/tips/settings',
    {
      method: 'PUT',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '保存打赏设置失败',
  )
}

/** 我收到的打赏（`GET /api/tips/received`，契约上没有分页参数）。 */
export async function listReceivedTips(token: string): Promise<TipOrder[]> {
  return requestJson<TipOrder[]>(
    '/tips/received',
    { method: 'GET', headers: authHeaders(token) },
    '加载收到打赏失败',
  )
}

/** 发起打赏（`POST /api/tips`）：金额须为大于 0 的整数分。 */
export async function createTip(token: string, payload: CreateTipPayload): Promise<TipOrder> {
  if (!Number.isSafeInteger(payload.amount_fen) || payload.amount_fen <= 0) {
    throw new Error('打赏金额须为大于 0 的整数分')
  }
  return requestJson<TipOrder>(
    '/tips',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        developer: payload.developer,
        amount_fen: payload.amount_fen,
        message: payload.message ?? '',
        anonymous: payload.anonymous ?? false,
      }),
    },
    '发起打赏失败',
  )
}

/** 单张打赏单（`GET /api/tips/{order_no}`）。 */
export async function getTipOrder(token: string, orderNo: string): Promise<TipOrder> {
  return requestJson<TipOrder>(
    `/tips/${encodeURIComponent(orderNo)}`,
    { method: 'GET', headers: authHeaders(token) },
    '查询打赏订单失败',
  )
}
