export type DepositRatioResp = {
  deposit_ratio_percent: number
  min_percent?: number
  max_percent?: number
}

export type UpdateProfileResp = {
  username: string
  token: string
}

export type UserProfileResp = {
  username: string
  profile_description?: string
  email?: string | null
  avatar_url?: string | null
  home_background_static?: string | null
  home_background_dynamic?: string | null
  home_background_static_focus?: string | null
  home_background_dynamic_focus?: string | null
  two_factor_enabled: boolean
  subscribe_official_activity: boolean
  subscribe_dev_hall_deposit_paid?: boolean
  wechat_bound?: boolean
}

export type ProfileSubscriptionsResp = {
  subscribe_official_activity: boolean
  subscribe_dev_hall_deposit_paid: boolean
}

export type UserSubscriptionsResp = Partial<ProfileSubscriptionsResp> & {
  subscribe_official_activity: boolean
}

export type ActivityCampaignClaimResp = {
  activity_id: number
  title: string
  coupon_type: 'amount' | 'percent'
  coupon_name: string
  assigned_coupon_code: string
  claimed_at: string
  already_claimed: boolean
  points_awarded?: number | null
}
