import { requestJson } from '@/api/http'

/** 公开主页「最近留言」条目（后端的 `PublicTipMessage`）。 */
export type PublicTipMessage = {
  /** 打赏者显示名；匿名时后端固定回「匿名」 */
  tipper_display: string
  message: string
  anonymous: boolean
  created_at: string
}

/**
 * 公开主页嵌套 `tip` 块（后端的 `PublicTipBlock`）。
 *
 * 开发者未开启打赏时后端只回 `{ enabled: false }`（不泄漏档位与金额），
 * 因此除 `enabled` / `public_records` 外的字段都可缺省。
 * `public_records=true` 时才带 `received_cash_fen` / `received_points` / `recent_messages`。
 */
export type PublicTipBlock = {
  enabled: boolean
  /** 平台服务费比例（万分比），打赏前展示给打赏者 */
  platform_fee_bps?: number
  /** 三方定性与退款口径说明 */
  notice?: string
  cash_enabled?: boolean
  points_enabled?: boolean
  /** 固定现金档位（分） */
  cash_tiers_fen?: number[]
  /** 固定积分档位 */
  points_tiers?: number[]
  allow_custom_cash?: boolean
  custom_cash_min_fen?: number
  custom_cash_max_fen?: number
  allow_custom_points?: boolean
  custom_points_min?: number
  custom_points_max?: number
  thanks_message?: string
  public_records?: boolean
  /** 公开记录开启时：累计收到现金（分，仅 paid） */
  received_cash_fen?: number
  /** 公开记录开启时：累计收到积分（仅 paid） */
  received_points?: number
  /** 公开记录开启时：最近留言（≤20 条） */
  recent_messages?: PublicTipMessage[]
}

export type PublicUserProfile = {
  username: string
  profile_description: string
  avatar_url: string | null
  home_background_static: string | null
  home_background_dynamic: string | null
  home_background_static_focus: string | null
  home_background_dynamic_focus: string | null
  username_gradient: boolean
  username_color: string | null
  /** R010 打赏：公开主页打赏块；老后端没有该字段时为 undefined */
  tip?: PublicTipBlock | null
}

/**
 * 公开用户档案：无需登录，任何人可读。用于用户主页展示头像、简介、背景与用户名渐变，
 * 不再依赖该用户是否发布过公开资源。
 */
export async function getPublicUserProfile(username: string): Promise<PublicUserProfile> {
  return requestJson<PublicUserProfile>(
    `/user/${encodeURIComponent(username)}`,
    { method: 'GET' },
    '加载用户公开资料失败',
  )
}
