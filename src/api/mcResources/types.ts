import type { components } from '@/api/generated/schema'

type Schemas = components['schemas']

export type McResourceVisibility = 'draft' | 'review' | 'published' | 'rejected'
export type McResourcePlatform = string

/** 资源类别：normal = 大厅公开展示（默认）；api = 不在公开面展示，只能由指定来源下单 */
export type McResourceKind = 'normal' | 'api'

export type CreateMcResourceTagSelection = {
  group_id: number
  tag_ids: number[]
}

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

export type CreateMcResourceRequest = {
  platform: McResourcePlatform
  title: string
  author: string
  description: string
  tag_selections: CreateMcResourceTagSelection[]
  file_name: string
  source_url: string
  cover_url?: string | null
  docs_url?: string | null
  visibility: McResourceVisibility
  release_note?: string | null
  ownership_type?: 'individual' | 'team' | null
  team_id?: number | null
  origin_type?: 'original' | 'repost' | null
  origin_author?: string | null
  origin_url?: string | null
  origin_org?: string | null
  origin_note?: string | null
  /** 买断价（分）；0 = 不卖买断。 */
  buyout_price_fen?: number | null
  /** 积分售价；0=不走积分购；与 price_fen 互斥 */
  price_points?: number | null
  /** 版权声明勾选 */
  copyright_declared?: boolean | null
  /** 资源类别在创建时确定，创建后不可更改；传与当前值不同的值后端会拒绝 */
  resource_kind?: McResourceKind | null
  /** 资源售卖推广分成比例（万分比）：0 = 关闭，1..5000 = 0.01%..50% */
  promo_share_bps?: number | null
}

export type McResourcePayload = {
  id: number
  creator: string
  ownership_type: 'individual' | 'team'
  team_id?: number | null
  requirement_id: string | null
  delete_request_status?: 'pending' | 'rejected' | null
  delete_requested_at?: string | null
  delete_reviewed_at?: string | null
  delete_review_note?: string | null
  platform: McResourcePlatform
  title: string
  author: string
  description: string
  tag_selections: McResourceTagSelectionPayload[]
  file_name: string
  source_url: string
  cover_url: string | null
  docs_url: string | null
  visibility: McResourceVisibility
  release_note: string | null
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
   * 资源类别：normal = 大厅公开展示；api = 不在公开面展示，只能由指定来源下单。
   * 契约上是必回字段，这里写成可选是为了兼容旧 mock 数据与旧后端；判定一律走
   * `shared/resourceApi.ts` 的 `isApiResourceKind()`（缺省按 normal 处理）。
   */
  resource_kind?: McResourceKind
  /** 售卖推广分成比例（万分比）；0 = 未开启 */
  promo_share_bps: number
  /** 曾设过现金售价：设过即不可再改积分售价（改回免费后也一样） */
  cash_price_locked?: boolean
  /** 当前登录买家是否已有有效已购订单（列表通常为 false） */
  purchased_by_me?: boolean
  created_at: string
  updated_at: string
  like_count?: number
  /** 有效精选（后端 query-time） */
  is_featured?: boolean
  featured_at?: string | null
  featured_until?: string | null
  /** 有效置顶（后端 query-time） */
  is_pinned?: boolean
  pinned_until?: string | null
  /**
   * R014：资源所属需求是否已进入「超期锁定 / 已清除」阶段。
   * 为真时锁定期内只能下载历史版本文件，不能编辑主页 / 发新版 / 删除（后端 409 闸门）。
   */
  requirement_archive_locked?: boolean
  /** R014：资源所属需求的内容是否已被「到期清除」。 */
  requirement_archive_cleared?: boolean
}

export type CreateMcResourceVersionRequest = {
  version: string
  file: File
  note?: string | null
  price_fen?: number | null
}

export type UpdateMcResourceVersionRequest = {
  version: string
  note?: string | null
  file?: File
  price_fen?: number | null
}

export type McResourceVersionPayload = {
  id: number
  resource_id: number
  version: string
  resource: string
  note: string | null
  delete_request_status?: 'pending' | 'rejected' | null
  delete_requested_at?: string | null
  delete_reviewed_at?: string | null
  delete_review_note?: string | null
  creator: string
  created_at: string
  is_current: boolean
  price_fen: number
  purchasable: boolean
}

export type UpdateMcResourceHomepageRequest = {
  title: string
  author: string
  description: string
  tag_selections?: CreateMcResourceTagSelection[]
  cover_url?: string | null
  docs_url?: string | null
  visibility?: McResourceVisibility
  release_note?: string | null
  ownership_type?: 'individual' | 'team' | null
  team_id?: number | null
  origin_type?: 'original' | 'repost' | null
  origin_author?: string | null
  origin_url?: string | null
  origin_org?: string | null
  origin_note?: string | null
  /** 买断价（分）；0 = 不卖买断。 */
  buyout_price_fen?: number | null
  /** 积分售价；0=不走积分购；与 price_fen 互斥 */
  price_points?: number | null
  /** 版权声明勾选；付费提交审核时必须为 true */
  copyright_declared?: boolean | null
  /** 资源类别：normal = 大厅公开展示（默认）；api = 不公开展示，只能由指定来源下单 */
  resource_kind?: McResourceKind | null
  /** 资源售卖推广分成比例（万分比）：0 = 关闭，1..5000 = 0.01%..50% */
  promo_share_bps?: number | null
}

/**
 * R028 接口资源的渠道配置（`GET` 响应；`PUT` 响应同构），直接取契约 `ApiChannelResponse`。
 *
 * 契约回 `allowed_origins` / `callback_url` / `repeat_purchasable` /
 * `has_secret` / `callback_secret_prefix`，外加「本次生成的明文」
 * `callback_secret_plain`（只有创建 / 轮换那一次有值）。
 */
export type ResourceApiChannelPayload = Schemas['ApiChannelResponse']

/** `PUT` 请求体：回调地址、密钥、允许来源与重复购买；未传字段由后端保留原值。 */
export type UpdateResourceApiChannelRequest = Schemas['UpdateApiChannelRequest']
