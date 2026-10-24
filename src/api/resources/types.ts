import type { components } from '@/api/generated/schema'
import type { McResourceKind } from '@/api/mcResources'

type Schemas = components['schemas']

/** 公开资源接口的统一前缀（子域文件共用，避免各写一份字面量）。 */
export const PUBLIC_RESOURCE_API_PREFIX = '/resource/resources'

export type McResourcePlatform = string

export type McResourceTagSelectionPayload = {
  group_id: number
  group_name: string
  group_alias?: string
  group_path: string[]
  group_path_aliases?: string[]
  tag_ids: number[]
  tag_names: string[]
  tag_aliases?: string[]
}

export type PublicMcResourceItem = {
  id: number
  creator: string
  creator_avatar_url?: string | null
  requirement_id: string | null
  platform: McResourcePlatform
  title: string
  author: string
  description: string
  tag_selections: McResourceTagSelectionPayload[]
  file_name: string
  source_url: string
  cover_url: string | null
  docs_url: string | null
  visibility: 'draft' | 'review' | 'published'
  release_note: string | null
  created_at: string
  updated_at: string
  like_count: number
  download_count: number
  view_count: number
  /** 有效精选（后端 query-time） */
  is_featured?: boolean
  featured_at?: string | null
  featured_until?: string | null
  /** 有效置顶（后端 query-time） */
  is_pinned?: boolean
  pinned_until?: string | null
  creator_credit_score?: number | null
  creator_username_gradient?: boolean
  author_username_gradient?: boolean
  creator_username_color?: string | null
  author_username_color?: string | null
  creator_home_background_static?: string | null
  creator_home_background_dynamic?: string | null
  liked_by_me: boolean
  ownership_type: string
  team_id: number | null
  team_name: string | null
  team_avatar_url?: string | null
  origin_type: 'original' | 'repost'
  origin_author: string | null
  origin_url: string | null
  origin_org: string | null
  origin_note: string | null
  /** 买断价（分）；0 = 不卖买断。 */
  buyout_price_fen: number
  /** 冻结的历史现金售价，不参与售卖判定。 */
  price_fen: number
  /** 积分售价；0=不走积分购；与 price_fen 互斥 */
  price_points: number
  /** 是否已勾选版权声明 */
  copyright_declared: boolean
  copyright_declared_at?: string | null
  /**
   * 资源类别：`api` 不会出现在公开列表里（公开面本来就收不到，加上只是为了类型完整）。
   */
  resource_kind?: McResourceKind | null
  /** 售卖推广分成比例（万分比）；0 = 未开启；公开面用于购买面板的轻提示 */
  promo_share_bps?: number
  /** 当前登录买家是否已有有效已购订单 */
  purchased_by_me: boolean
}

/** 资源版本：直接取契约 `VersionResponse`（`is_current` / `purchasable` / `price_fen` 都在里面）。 */
export type PublicMcResourceVersionItem = Schemas['VersionResponse']

/** 资源评论：直接取契约 `CommentResponse`（正文就是 `comment`，没有炫彩用户名字段）。 */
export type PublicMcResourceCommentItem = Schemas['CommentResponse']

export type CreatePublicMcResourceCommentPayload = {
  comment: string
}

export type PublicMcResourceLikeState = {
  resource_id: number
  liked_by_me: boolean
  like_count: number
}

export type DownloadProgress = {
  loaded: number
  total: number
  percent: number
}
