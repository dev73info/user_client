import { authHeaders, requestJson } from '@/api/http'

export type UserPointsSelf = {
  username: string
  points_balance: number
  logs: UserPointsLog[]
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

export async function getMyPoints(token: string): Promise<UserPointsSelf> {
  return requestJson<UserPointsSelf>(
    '/points/me',
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
