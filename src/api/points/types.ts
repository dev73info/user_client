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

export type PointsProduct = {
  id: number
  name: string
  points_cost: number
  stock: number
  kind: 'permission' | 'badge' | 'product' | 'consumable'
  payload: string | null
  enabled: boolean
  duration_days: number
  perk_code: string | null
}

/** 背包消耗卡（精选卡 / 置顶卡） */
export type PromoCard = {
  id: number
  card_code: string
  product_id: number
  redeem_order_id: number
  duration_days: number
  status: 'unused' | 'used' | string
  used_resource_id: number | null
  used_at: string | null
  created_at: string
}

/** 首页高赞门槛等公开配置 */
export type ResourcePromoMeta = {
  high_like_threshold: number
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

export type PointsTransferMeta = {
  fee_rate: number
  daily_cap: number
  receive_daily_cap: number
  new_user_cap: number
  new_user_min_days: number
}
