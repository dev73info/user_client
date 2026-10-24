import type { components } from '@/api/generated/schema'
import type { McResourcePlatform, McResourceTagSelectionPayload } from '@/api/resources'

type Schemas = components['schemas']

/** 概览里的「近期成交」一行，字段与契约 `RecentDealResponse` 逐字对应。 */
export type RecentDeal = Schemas['RecentDealResponse']

/** 工作台首页 / 公开首页的概览，字段与契约 `DashboardResponse` 逐字对应。 */
export type RequirementOverviewResp = Schemas['DashboardResponse']

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

/** 公开精选的一条，字段与契约 `PublicRequirementResponse` 逐字对应。 */
export type PublicRequirementSpotlightItem = Schemas['PublicRequirementResponse']

export type PublicRequirementSpotlightPage = Schemas['PublicSpotlightResponse']

export type RequirementPendingResourceVersionDeleteRequest = {
  version_id: number
  version: string
  requested_at?: string | null
}

/**
 * 需求行：契约 `RequirementResponse` 打底，再叠一层「后端实现里有、契约里没登记」的扩展字段。
 *
 * 分成两段写是有意的：
 * - 契约段（`Schemas['RequirementResponse']`）由后端 `openapi.json` 生成，字段加减跟着契约走；
 *   其中 `status` / `payment_mode` 收窄成字面量联合，UI 的穷举分支才有类型保障。
 * - 扩展段全部是**可选**字段：契约没声明，读不到就是 `undefined`，调用方必须按「未知」处理，
 *   不许用默认值把它填成看起来正常的样子（例如归档时间缺失时不能当成「未锁定」以外的结论）。
 *   这一段每少一条，就说明后端把字段补进 DTO 了——届时顺手删掉对应的扩展声明。
 */
export type RequirementItem = Omit<Schemas['RequirementResponse'], 'status' | 'payment_mode'> & {
  /** 契约里是裸 `string`，前端收窄成状态机取值，UI 的穷举分支才有类型保障。 */
  status: RequirementStatus
  payment_mode: RequirementPaymentMode
  /** 私有 / 审核可见：与 `PATCH /resource-visibility` 的取值一致。 */
  resource_visibility?: 'public' | 'review' | 'private' | null
  /** 交付关联资源的删除申请（审核流水），契约未登记。 */
  resource_version_delete_request_id?: number | null
  resource_version_delete_request_version?: string | null
  resource_version_delete_request_status?: 'pending' | 'rejected' | null
  resource_version_delete_requested_at?: string | null
  resource_version_delete_reviewed_at?: string | null
  resource_version_delete_review_note?: string | null
  pending_resource_version_delete_requests?: RequirementPendingResourceVersionDeleteRequest[] | null
  /** 交付关联资源的展示字段（需求详情里那张资源卡）。 */
  bound_resource_id?: number | null
  bound_resource_version_count?: number | null
  bound_resource_platform?: McResourcePlatform | null
  bound_resource_title?: string | null
  bound_resource_author?: string | null
  bound_resource_description?: string | null
  bound_resource_tag_selections?: McResourceTagSelectionPayload[] | null
  bound_resource_source_url?: string | null
  bound_resource_cover_url?: string | null
  bound_resource_docs_url?: string | null
  bound_resource_updated_at?: string | null
  /** 客户侧评价（需求创建者提交）。 */
  comment_rating?: number | null
  comment_text?: string | null
  commented_at?: string | null
  /** 开发者侧评价（绑定开发者提交）。 */
  developer_comment_rating?: number | null
  developer_comment_text?: string | null
  developer_commented_at?: string | null
  /** 排队中分账里最晚的计划分账时间（东八区），没有排队分账时为空；前端据此算结算倒计时。 */
  settlement_available_at?: string | null
  /**
   * 交付资源转为需求方自己资源的时间（`YYYY-MM-DD HH:mm:ss`，北京时间）；未转换为 `null`。
   * 有值即「已转为我的资源」：入口隐藏、会话已关闭、`bound_resource_author` 变成需求方本人。
   */
  resource_claimed_at?: string | null
  /**
   * 进入「超期锁定」（合同有效期届满后的 30 天资料保留期）的时间（东八区）；从未锁定为 `null`。
   * 见 `shared/requirementArchive.ts`。
   */
  archive_locked_at?: string | null
  /** 锁定到期时间 = `archive_locked_at` + 平台配置的锁定期天数；未锁定为 `null`。 */
  archive_lock_expires_at?: string | null
  /** 内容被清除的时间（东八区）；非空即「已清除」终态：资料下载不可用、写操作一律拒绝。 */
  archive_cleared_at?: string | null
  /** 锁定期内「把交付资源转为我的资源」引导标记，由后端判定。 */
  archive_can_claim_resource?: boolean | null
}

/** 发布需求：字段与契约 `CreateRequirementRequest` 一致（`budget` 按契约是**元**）。 */
export type CreateRequirementPayload = Schemas['CreateRequirementRequest'] & {
  payment_mode: RequirementPaymentMode
}

/** 需求评价：字段与契约 `CommentRequirementRequest` 一致。 */
export type CommentRequirementPayload = Schemas['CommentRequirementRequest']

export type RequirementResourceVisibility = 'public' | 'private'

/** 交付资源可见性：字段与契约 `VisibilityRequest` 一致。 */
export type UpdateRequirementResourceVisibilityPayload = Schemas['VisibilityRequest'] & {
  visibility: RequirementResourceVisibility
}

/** 交付资源删除审核：字段与契约 `DeleteReviewRequest` 一致。 */
export type ReviewRequirementResourceDeletePayload = Schemas['DeleteReviewRequest'] & {
  action: 'approve' | 'reject'
}

/** 状态变更订阅：字段与契约 `UpdateSubscriptionRequest` 一致。 */
export type UpdateRequirementSubscriptionPayload = Schemas['UpdateSubscriptionRequest']
