/**
 * R010 开发者主页打赏：**所有**打赏相关的请求/响应类型与请求函数集中在此模块。
 *
 * 组件不得直接拼路径或写 fetch/axios —— 后端（任务-01）与本模块是契约的两端，
 * 字段名若要微调，只改这一个文件。路径走 `requestJson` 的 `apiUrl()` 自动补 `/api`，
 * 因此这里写的是 `/tips/**`（不带 `/api` 前缀）。
 *
 * 契约（后端 `backend_73info/src/modules/tip/{routes,handlers}.rs` 与 `src/models/tip.rs`）：
 * - GET  `/tips/settings`                     读本人打赏设置（含 `settlement_ready` / `notice`）
 * - PUT  `/tips/settings`                     保存本人打赏设置
 * - GET  `/tips/received?limit&offset&status` 本人收到的打赏（含未公开）
 * - POST `/tips`                              发起打赏（现金落 pending，积分一步 paid）
 * - GET  `/tips/{order_no}`                   打赏人查单（pending 时后端主动回落）
 * - 公开中间页（无登录态，靠短时 token）：
 *   GET  `/tips/{order_no}/wechat-auth-url?token&redirect_to`
 *   POST `/tips/{order_no}/wechat-jsapi`      body `{ token }`
 *   GET  `/tips/{order_no}/wechat-status?token`
 */
import { authHeaders, requestJson } from '@/api/http'

/** 打赏现金 / 积分两条通道。 */
export type TipPayMethod = 'cash' | 'points'

/**
 * 开发者自己的打赏设置（`dev_tip_config` 一行）。
 *
 * 金额单位：现金档位与上下限为**分**，积分档位与上下限为**积分**。
 * 档位最多 6 个；现金每档 1..=99_999_900 分，积分每档 1..=1_000_000。
 */
export type TipSettings = {
  enabled: boolean
  cash_enabled: boolean
  points_enabled: boolean
  /** 固定现金档位（分），最多 6 个 */
  cash_tiers_fen: number[]
  /** 固定积分档位，最多 6 个 */
  points_tiers: number[]
  allow_custom_cash: boolean
  custom_cash_min_fen: number
  custom_cash_max_fen: number
  allow_custom_points: boolean
  custom_points_min: number
  custom_points_max: number
  /** 打赏页感谢语，≤100 字 */
  thanks_message: string
  /** 是否公开打赏记录（公开主页是否显示累计与留言） */
  public_records: boolean
}

/** `GET/PUT /tips/settings` 响应：设置本体 + 只读状态位 + 合规说明。 */
export type TipSettingsResponse = TipSettings & {
  /** 开发者是否已绑定可用的 Adapay 结算账户（现金打赏前置条件） */
  settlement_ready: boolean
  /** 当前平台服务费比例（万分比），下单时快照进订单 */
  platform_fee_bps: number
  /** 三方定性与退款口径说明，原样展示 */
  notice: string
}

/** 打赏订单（`dev_tip_order`）。 */
export type TipOrder = {
  order_no: string
  tipper: string
  developer: string
  pay_method: string
  /** 现金金额（分）；积分单为 0 */
  amount_fen: number
  /** 积分金额；现金单为 0 */
  amount_points: number
  platform_fee_fen: number
  developer_net_fen: number
  platform_fee_points: number
  developer_net_points: number
  platform_fee_bps: number
  message: string
  anonymous: boolean
  /** `pending` | `paid` | `failed` | `closed` | `refunding` | `refunded` */
  status: string
  pay_channel: string | null
  provider_payment_id: string | null
  provider_confirm_id: string | null
  pay_url: string | null
  split_status: string
  created_at: string
  paid_at: string | null
  updated_at: string
  refund_reason: string | null
  refunded_by: string | null
  provider_refund_id: string | null
  refund_error: string | null
  refunded_at: string | null
}

/** `POST /tips` 请求体。金额给 `tier_index`（固定档位下标）或自填 `amount_fen` / `amount_points`。 */
export type CreateTipPayload = {
  to_username: string
  pay_method: TipPayMethod
  amount_fen?: number
  amount_points?: number
  /** 固定档位下标（0 起）；优先于自填金额 */
  tier_index?: number
  message?: string
  anonymous?: boolean
  /** 现金单支付渠道；缺省 `wx_pub`（PC 微信中间页 / 微信内 JSAPI） */
  pay_channel?: string
  client_platform?: 'pc' | 'mobile'
}

/** 本人收到的打赏列表查询参数。 */
export type ListReceivedTipsQuery = {
  limit?: number
  offset?: number
  status?: string
}

export type TipWechatAuthUrlResp = {
  url: string
  authorized: boolean
}

export type TipWechatJsapiResp = {
  order: TipOrder
  /** AdaPay `expend.pay_info` 原始字符串，供 `WeixinJSBridge` 调起 */
  pay_info: string
}

export type TipWechatStatusResp = {
  order: TipOrder
  authorized: boolean
}

/** GET /tips/settings —— 读本人打赏设置（无记录时后端回默认值） */
export async function getTipSettings(token: string): Promise<TipSettingsResponse> {
  return requestJson<TipSettingsResponse>(
    '/tips/settings',
    { method: 'GET', headers: authHeaders(token) },
    '加载打赏设置失败',
  )
}

/** PUT /tips/settings —— 保存本人打赏设置 */
export async function updateTipSettings(
  token: string,
  payload: TipSettings,
): Promise<TipSettingsResponse> {
  return requestJson<TipSettingsResponse>(
    '/tips/settings',
    {
      method: 'PUT',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '保存打赏设置失败',
  )
}

/** GET /tips/received —— 本人收到的打赏（含未公开的，仅本人可读） */
export async function listReceivedTips(
  token: string,
  query: ListReceivedTipsQuery = {},
): Promise<TipOrder[]> {
  const params = new URLSearchParams()
  if (query.limit != null) {
    params.set('limit', String(query.limit))
  }
  if (query.offset != null) {
    params.set('offset', String(query.offset))
  }
  if (query.status?.trim()) {
    params.set('status', query.status.trim())
  }
  const qs = params.toString()
  return requestJson<TipOrder[]>(
    `/tips/received${qs ? `?${qs}` : ''}`,
    { method: 'GET', headers: authHeaders(token) },
    '加载收到打赏失败',
  )
}

/** POST /tips —— 发起打赏；现金返回 pending 订单（含 pay_url），积分返回 paid 订单 */
export async function createTip(token: string, payload: CreateTipPayload): Promise<TipOrder> {
  const body: Record<string, unknown> = {
    to_username: payload.to_username,
    pay_method: payload.pay_method,
  }
  if (payload.tier_index != null) {
    body.tier_index = payload.tier_index
  }
  if (payload.amount_fen != null) {
    body.amount_fen = payload.amount_fen
  }
  if (payload.amount_points != null) {
    body.amount_points = payload.amount_points
  }
  if (payload.message != null) {
    body.message = payload.message
  }
  if (payload.anonymous != null) {
    body.anonymous = payload.anonymous
  }
  if (payload.pay_channel) {
    body.pay_channel = payload.pay_channel
  }
  if (payload.client_platform) {
    body.client_platform = payload.client_platform
  }
  return requestJson<TipOrder>(
    '/tips',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    },
    '发起打赏失败',
  )
}

/** GET /tips/{order_no} —— 打赏人查单（pending 时后端会主动向渠道回落） */
export async function getTipOrder(token: string, orderNo: string): Promise<TipOrder> {
  return requestJson<TipOrder>(
    `/tips/${encodeURIComponent(orderNo)}`,
    { method: 'GET', headers: authHeaders(token) },
    '查询打赏订单失败',
  )
}

/** GET /tips/{order_no}/wechat-auth-url（公开，靠短时 token） */
export async function getTipWechatAuthUrl(
  orderNo: string,
  token: string,
  redirectTo?: string,
): Promise<TipWechatAuthUrlResp> {
  const query = new URLSearchParams({ token })
  if (redirectTo?.trim()) {
    query.set('redirect_to', redirectTo.trim())
  }
  return requestJson<TipWechatAuthUrlResp>(
    `/tips/${encodeURIComponent(orderNo)}/wechat-auth-url?${query.toString()}`,
    { method: 'GET' },
    '获取微信授权地址失败',
  )
}

/** POST /tips/{order_no}/wechat-jsapi（公开，靠短时 token） */
export async function completeTipWechatJsapi(
  orderNo: string,
  token: string,
): Promise<TipWechatJsapiResp> {
  return requestJson<TipWechatJsapiResp>(
    `/tips/${encodeURIComponent(orderNo)}/wechat-jsapi`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    },
    '创建微信支付失败',
  )
}

/** GET /tips/{order_no}/wechat-status（公开，靠短时 token） */
export async function getTipWechatStatus(
  orderNo: string,
  token: string,
): Promise<TipWechatStatusResp> {
  const query = new URLSearchParams({ token })
  return requestJson<TipWechatStatusResp>(
    `/tips/${encodeURIComponent(orderNo)}/wechat-status?${query.toString()}`,
    { method: 'GET' },
    '查询打赏订单失败',
  )
}
