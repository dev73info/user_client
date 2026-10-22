import type { McResourcePlatform, McResourceTagSelectionPayload } from '@/api/resources'

export type RecentDeal = {
  payment_id: string
  requirement_id: string
  title: string
  amount_cny: number
  paid_at: string
  comment_rating?: number | null
  comment_text?: string | null
  commented_at?: string | null
}

export type RequirementOverviewResp = {
  developer_count?: number
  total_orders: number
  total_orders_change_rate: number
  positive_rate: number
  positive_rate_change_rate: number
  total_turnover_cny: number
  total_turnover_change_rate: number
  recent_deals: RecentDeal[]
}

export type RequirementStatus =
  | 'pending_review'
  | 'rejected'
  | 'pending_deposit'
  | 'deposit_paid'
  | 'in_development'
  | 'pending_final'
  // 尾款已缴、等渠道分账完成；分账成功后才转 `completed`。
  | 'pending_settlement'
  | 'completed'
  | 'cancelled'

export type RequirementPaymentMode = 'platform_guarantee' | 'self_managed'

export type PublicRequirementSpotlightItem = {
  requirement_id: string
  creator?: string
  title: string
  description?: string | null
  acceptance_criteria?: string | null
  budget?: number | null
  payment_mode: RequirementPaymentMode
  status: RequirementStatus
  created_at: string
  updated_at: string
}

export type PublicRequirementSpotlightPage = {
  total: number
  page: number
  page_size: number
  items: PublicRequirementSpotlightItem[]
}

export type RequirementPendingResourceVersionDeleteRequest = {
  version_id: number
  version: string
  requested_at?: string | null
}

export type RequirementItem = {
  id: number
  requirement_id: string
  subscribe_status_change: boolean
  bound_resource_id?: number | null
  bound_resource_version_count?: number | null
  resource_visibility?: 'public' | 'review' | 'private' | null
  resource_version_delete_request_id?: number | null
  resource_version_delete_request_version?: string | null
  resource_version_delete_request_status?: 'pending' | 'rejected' | null
  resource_version_delete_requested_at?: string | null
  resource_version_delete_reviewed_at?: string | null
  resource_version_delete_review_note?: string | null
  pending_resource_version_delete_requests?: RequirementPendingResourceVersionDeleteRequest[] | null
  bound_resource_platform?: McResourcePlatform | null
  bound_resource_title?: string | null
  bound_resource_author?: string | null
  bound_resource_description?: string | null
  bound_resource_tag_selections?: McResourceTagSelectionPayload[] | null
  bound_resource_source_url?: string | null
  bound_resource_cover_url?: string | null
  bound_resource_docs_url?: string | null
  bound_resource_updated_at?: string | null
  created_time?: string
  creator?: string
  title: string
  description?: string | null
  acceptance_criteria?: string | null
  review_note?: string | null
  /** 客户侧评价（需求创建者提交） */
  comment_rating?: number | null
  comment_text?: string | null
  commented_at?: string | null
  /** 开发者侧评价（绑定开发者提交） */
  developer_comment_rating?: number | null
  developer_comment_text?: string | null
  developer_commented_at?: string | null
  status: RequirementStatus
  budget?: number | null
  payment_mode: RequirementPaymentMode
  updated_at: string
  developer?: string | null
  /** 排队中分账里最晚的计划分账时间（东八区），没有排队分账时为空；前端据此算结算倒计时。 */
  settlement_available_at?: string | null
  /**
   * 交付资源转为需求方自己资源的时间（`YYYY-MM-DD HH:mm:ss`，北京时间）；未转换为 `null`。
   * 有值即「已转为我的资源」：入口隐藏、会话已关闭、`bound_resource_author` 变成需求方本人。
   */
  resource_claimed_at?: string | null
  /**
   * 开发周期（天，R014）：担保需求（`payment_mode = platform_guarantee`）创建 / 编辑时必填，
   * 等于合同自双方签署完成到截止的有效期天数；无担保需求或未填时为 `null`。
   * 下限以平台配置为准，前端只做「正整数」的粗校验，最终以后端返回的中文提示为准。
   */
  development_cycle_days?: number | null
  /**
   * 进入「超期锁定」（合同有效期届满后的 30 天资料保留期）的时间（东八区）；从未锁定为 `null`。
   * 见 `shared/requirementArchive.ts`，页面上据此给锁定横幅、只保留下载入口、置灰写操作。
   */
  archive_locked_at?: string | null
  /** 锁定到期时间 = `archive_locked_at` + 平台配置的锁定期天数；未锁定为 `null`。 */
  archive_lock_expires_at?: string | null
  /** 内容被清除的时间（东八区）；非空即「已清除」终态：资料下载不可用、写操作一律拒绝。 */
  archive_cleared_at?: string | null
  /**
   * 锁定期内「把交付资源转为我的资源」引导标记：已锁定且未清除、需求已结单、尚未转换、
   * 有交付资源时为 `true`。转换能力复用 R006 的既有接口，前端据此展示引导入口。
   */
  archive_can_claim_resource?: boolean | null
}

export type CreateRequirementPayload = {
  title: string
  description: string
  budget: number
  acceptance_criteria: string
  payment_mode: RequirementPaymentMode
  /**
   * 开发周期（天，R014）：`platform_guarantee` 时必填且不得低于平台配置的最短下限
   * （下限由后端校验并返回中文提示）；`self_managed` 时忽略。不传 / 传 null 表示未填。
   */
  development_cycle_days?: number | null
}

export type CommentRequirementPayload = {
  rating: number
  comment?: string
}

export type RequirementResourceVisibility = 'public' | 'private'

export type UpdateRequirementResourceVisibilityPayload = {
  visibility: RequirementResourceVisibility
}

export type ReviewRequirementResourceDeletePayload = {
  version_id: number
  action: 'approve' | 'reject'
  note?: string
}

export type UpdateRequirementSubscriptionPayload = {
  subscribe_status_change: boolean
}
