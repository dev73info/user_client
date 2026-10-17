import { authHeader, requestJson } from '@/api/http'

export type McResourceVisibility = 'draft' | 'review' | 'published'
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
  /** 售价（分）；0=免费；与 price_points 互斥 */
  price_fen?: number | null
  /** 积分售价；0=不走积分购；与 price_fen 互斥 */
  price_points?: number | null
  /** 版权声明勾选 */
  copyright_declared?: boolean | null
  /** 资源类别：normal = 大厅公开展示（默认）；api = 不公开展示，只能由指定来源下单 */
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
  /** 售价（分）；0=免费；与 price_points 互斥 */
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
}

export type UpdateMcResourceVersionRequest = {
  version: string
  note?: string | null
  file?: File
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
  /** 售价（分）；0=免费；已发布改价不强制重新审核；与 price_points 互斥 */
  price_fen?: number | null
  /** 积分售价；0=不走积分购；与 price_fen 互斥 */
  price_points?: number | null
  /** 版权声明勾选；付费提交审核时必须为 true */
  copyright_declared?: boolean | null
  /** 资源类别：normal = 大厅公开展示（默认）；api = 不公开展示，只能由指定来源下单 */
  resource_kind?: McResourceKind | null
  /** 资源售卖推广分成比例（万分比）：0 = 关闭，1..5000 = 0.01%..50% */
  promo_share_bps?: number | null
}

export async function createMcResource(
  token: string,
  payload: CreateMcResourceRequest,
): Promise<McResourcePayload> {
  return requestJson<McResourcePayload>(
    '/dev/resources/resources',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '发布资源失败',
  )
}

export async function listMcResources(token: string): Promise<McResourcePayload[]> {
  return requestJson<McResourcePayload[]>(
    '/dev/resources/resources',
    {
      method: 'GET',
      headers: {
        ...authHeader(token),
      },
    },
    '加载资源列表失败',
  )
}

export async function listTeamResources(token: string): Promise<McResourcePayload[]> {
  return requestJson<McResourcePayload[]>(
    '/dev/resources/resources/team',
    {
      method: 'GET',
      headers: {
        ...authHeader(token),
      },
    },
    '加载团队资源列表失败',
  )
}

export async function getMcResource(token: string, resourceId: number): Promise<McResourcePayload> {
  return requestJson<McResourcePayload>(
    `/dev/resources/resources/${resourceId}`,
    {
      method: 'GET',
      headers: {
        ...authHeader(token),
      },
    },
    '加载资源详情失败',
  )
}

export async function createMcResourceVersion(
  token: string,
  resourceId: number,
  payload: CreateMcResourceVersionRequest,
): Promise<McResourceVersionPayload> {
  const formData = new FormData()
  formData.append('version', payload.version)
  if (payload.note?.trim()) {
    formData.append('note', payload.note.trim())
  }
  formData.append('file', payload.file)

  return requestJson<McResourceVersionPayload>(
    `/dev/resources/resources/${resourceId}/versions`,
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '发布新版本失败',
  )
}

export async function listMcResourceVersions(
  token: string,
  resourceId: number,
): Promise<McResourceVersionPayload[]> {
  return requestJson<McResourceVersionPayload[]>(
    `/dev/resources/resources/${resourceId}/versions`,
    {
      method: 'GET',
      headers: {
        ...authHeader(token),
      },
    },
    '加载版本列表失败',
  )
}

export async function updateMcResourceVersion(
  token: string,
  resourceId: number,
  versionId: number,
  payload: UpdateMcResourceVersionRequest,
): Promise<McResourceVersionPayload> {
  if (payload.file) {
    const formData = new FormData()
    formData.append('version', payload.version)
    if (payload.note?.trim()) {
      formData.append('note', payload.note.trim())
    }
    formData.append('file', payload.file)
    return requestJson<McResourceVersionPayload>(
      `/dev/resources/resources/${resourceId}/versions/${versionId}`,
      {
        method: 'PATCH',
        headers: {
          ...authHeader(token),
        },
        body: formData,
      },
      '更新版本失败',
    )
  }

  return requestJson<McResourceVersionPayload>(
    `/dev/resources/resources/${resourceId}/versions/${versionId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '更新版本失败',
  )
}

export async function deleteMcResourceVersion(
  token: string,
  resourceId: number,
  versionId: number,
): Promise<void> {
  await requestJson<unknown>(
    `/dev/resources/resources/${resourceId}/versions/${versionId}`,
    {
      method: 'DELETE',
      headers: {
        ...authHeader(token),
      },
    },
    '删除版本失败',
  )
}

export async function deleteMcResource(token: string, resourceId: number): Promise<void> {
  await requestJson<unknown>(
    `/dev/resources/resources/${resourceId}`,
    {
      method: 'DELETE',
      headers: {
        ...authHeader(token),
      },
    },
    '删除资源失败',
  )
}

export async function updateMcResourceHomepage(
  token: string,
  resourceId: number,
  payload: UpdateMcResourceHomepageRequest,
): Promise<McResourcePayload> {
  return requestJson<McResourcePayload>(
    `/dev/resources/resources/${resourceId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '更新资源主页失败',
  )
}

export async function uploadMcResourceCover(
  token: string,
  resourceId: number,
  file: File,
): Promise<McResourcePayload> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<McResourcePayload>(
    `/dev/resources/resources/${resourceId}/cover`,
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '上传主页图标失败',
  )
}

/** 对我的资源使用背包中的精选/置顶卡。 */
export async function applyResourcePromoCard(
  token: string,
  resourceId: number,
  cardId: number,
): Promise<McResourcePayload> {
  return requestJson<McResourcePayload>(
    `/dev/resources/resources/${resourceId}/promo-cards/apply`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ card_id: cardId }),
    },
    '使用道具卡失败',
  )
}

/**
 * R028 接口资源的渠道配置（`GET` 响应；`PUT` 响应同构）。
 * 「不在大厅展示」由后端固定为 `true`，前端只读展示，不给开关。
 */
export type ResourceApiChannelPayload = {
  resource_id: number
  resource_kind: McResourceKind
  repeat_purchasable: boolean
  callback_url: string | null
  /** 掩码，例如 sk***ab；明文任何响应都不回 */
  callback_secret_masked: string | null
  callback_secret_set: boolean
  /** 仅记录并透传，平台不做判定 */
  allow_strangers: boolean
  hidden_from_catalog: boolean
  allowed_origins: string[]
  updated_at: string | null
  updated_by: string | null
  /** 仅「后端首次生成密钥」的那一次 PUT 响应里有值，之后永远拿不到 */
  callback_secret_plain?: string | null
}

export type UpdateResourceApiChannelRequest = {
  resource_kind?: McResourceKind
  repeat_purchasable?: boolean
  callback_url?: string | null
  /** 省略或空串 = 不改；非空 = 覆盖 */
  callback_secret?: string | null
  allow_strangers?: boolean
  allowed_origins?: string[]
}

/** 读取某个资源的接口渠道配置；资源没配过渠道时后端回默认值（不 404）。 */
export async function getResourceApiChannel(
  token: string,
  resourceId: number,
): Promise<ResourceApiChannelPayload> {
  return requestJson<ResourceApiChannelPayload>(
    `/dev/resources/resources/${resourceId}/api-channel`,
    {
      method: 'GET',
      headers: {
        ...authHeader(token),
      },
    },
    '加载接口资源渠道配置失败',
  )
}

/** 写入某个资源的接口渠道配置；字段缺省 = 不改这一项。 */
export async function updateResourceApiChannel(
  token: string,
  resourceId: number,
  payload: UpdateResourceApiChannelRequest,
): Promise<ResourceApiChannelPayload> {
  return requestJson<ResourceApiChannelPayload>(
    `/dev/resources/resources/${resourceId}/api-channel`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '保存接口资源渠道配置失败',
  )
}
