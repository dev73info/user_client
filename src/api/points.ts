import { authHeaders, requestJson } from '@/api/http'

export type UserPointsSelf = {
  username: string
  points_balance: number
  logs: UserPointsLog[]
  logs_total?: number
  logs_page?: number
  logs_page_size?: number
  username_gradient_owned: boolean
  username_gradient: boolean
  perks: UserPerk[]
}

export type UserPerk = {
  perk_code: string
  owned: boolean
  equipped: boolean
  expires_at: string | null
}

export type UsernameGradientStatus = {
  username: string
  username_gradient_owned: boolean
  username_gradient: boolean
}

export type UserPointsLog = {
  id: number
  username: string
  delta: number
  balance_after: number
  reason: string | null
  source_type: string | null
  source_id: string | null
  operator: string | null
  created_at: string
}

export type UserPointsQuery = {
  page?: number
  page_size?: number
}

export async function getMyPoints(
  token: string,
  query: UserPointsQuery = {},
): Promise<UserPointsSelf> {
  const params = new URLSearchParams()
  if (query.page != null) params.set('page', String(query.page))
  if (query.page_size != null) params.set('page_size', String(query.page_size))
  const suffix = params.toString() ? `?${params.toString()}` : ''

  return requestJson<UserPointsSelf>(
    `/points/me${suffix}`,
    { headers: authHeaders(token) },
    '加载积分失败',
  )
}

export type PointsProduct = {
  id: number
  name: string
  points_cost: number
  stock: number
  kind: 'permission' | 'badge'
  payload: string | null
  enabled: boolean
  duration_days: number
  perk_code: string | null
}

export type PointsRedeemOrder = {
  id: number
  username: string
  product_id: number
  product_name: string
  product_kind: string
  points_cost: number
  status: 'pending' | 'fulfilled' | 'rejected'
  handle_note: string | null
  handled_by: string | null
  handled_at: string | null
  created_at: string
}

export async function listMallProducts(token: string): Promise<PointsProduct[]> {
  return requestJson<PointsProduct[]>(
    '/points/mall/products',
    { headers: authHeaders(token) },
    '加载积分商城失败',
  )
}

export async function redeemMallProduct(
  token: string,
  productId: number,
): Promise<PointsRedeemOrder> {
  return requestJson<PointsRedeemOrder>(
    '/points/mall/redeem',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ product_id: productId }),
    },
    '兑换失败',
  )
}

export async function listMyRedeemOrders(token: string): Promise<PointsRedeemOrder[]> {
  return requestJson<PointsRedeemOrder[]>(
    '/points/mall/orders',
    { headers: authHeaders(token) },
    '加载兑换记录失败',
  )
}

export async function setUsernameGradient(
  token: string,
  equipped: boolean,
): Promise<UsernameGradientStatus> {
  return requestJson<UsernameGradientStatus>(
    '/points/mall/gradient',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ equipped }),
    },
    '更新渐变展示状态失败',
  )
}

export async function setUsernameAppearance(
  token: string,
  appearance: 'gradient' | 'color',
  color?: string,
): Promise<UsernameGradientStatus> {
  return requestJson<UsernameGradientStatus>(
    '/points/appearance/username',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ appearance, color: color || null }),
    },
    '设置用户名展示样式失败',
  )
}

export async function setPerkEquipped(
  token: string,
  perkCode: string,
  equipped: boolean,
): Promise<UserPerk> {
  return requestJson<UserPerk>(
    `/points/perks/${encodeURIComponent(perkCode)}`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ equipped }),
    },
    '更新权益佩戴状态失败',
  )
}

// ---------- 签到 ----------

export type CheckinStatus = {
  username: string
  today_checked_in: boolean
  streak_count: number
  today_potential: number
}

export type CheckinResponse = {
  username: string
  checkin_date: string
  streak_count: number
  points_awarded: number
  streak_bonus: number
  week_bonus: number
  month_bonus: number
  total_awarded: number
  already_checked_in: boolean
}

export async function doCheckin(token: string): Promise<CheckinResponse> {
  return requestJson<CheckinResponse>(
    '/points/checkin',
    { method: 'POST', headers: authHeaders(token) },
    '签到失败',
  )
}

export async function getCheckinStatus(token: string): Promise<CheckinStatus> {
  return requestJson<CheckinStatus>(
    '/points/checkin/status',
    { headers: authHeaders(token) },
    '加载签到状态失败',
  )
}

// ---------- 打赏 / 赠礼 ----------

export type TransferPointsPayload = {
  to_username: string
  amount: number
  note?: string
}

export type TransferPointsResponse = {
  from_username: string
  to_username: string
  amount: number
  fee: number
  received: number
  balance_after: number
  note: string | null
  created_at: string
}

export type PointsTransfer = {
  id: number
  from_username: string
  to_username: string
  amount: number
  fee: number
  received: number
  note: string | null
  created_at: string
}

export async function transferPoints(
  token: string,
  payload: TransferPointsPayload,
): Promise<TransferPointsResponse> {
  return requestJson<TransferPointsResponse>(
    '/points/transfer',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '打赏失败',
  )
}

export async function listMyTransfers(token: string, limit = 50): Promise<PointsTransfer[]> {
  return requestJson<PointsTransfer[]>(
    `/points/transfers?limit=${limit}`,
    { headers: authHeaders(token) },
    '加载打赏记录失败',
  )
}

export type PointsTransferMeta = {
  fee_rate: number
  daily_cap: number
  receive_daily_cap: number
  new_user_cap: number
  new_user_min_days: number
}

export async function getTransferMeta(token: string): Promise<PointsTransferMeta> {
  return requestJson<PointsTransferMeta>(
    '/points/transfer/meta',
    { headers: authHeaders(token) },
    '加载打赏规则失败',
  )
}
