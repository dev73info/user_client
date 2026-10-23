import type { AfterSalesCase } from '@/api/afterSales'
import type { CommentWarning, CommunityPost } from '@/api/community'
import type { ConversationHistoryDisclosure } from '@/api/conversations'
import type { ResourceTransferPayload } from '@/api/resourceTransfers'
import type { NotificationCard } from '@/shared/notifications'

/** 三类来源的字段很多，测试只关心被聚合层读到的那些，用工厂补齐其余字段，别在用例里铺一整份对象。 */
export function warning(overrides: Partial<CommentWarning> = {}): CommentWarning {
  return {
    id: 1,
    comment_type: 'community',
    comment_id: 10,
    comment_snapshot: '这条评论被删了',
    reason: '包含广告信息',
    operator: 'admin',
    created_at: '2026-01-02 10:00:00',
    ...overrides,
  }
}

export function post(overrides: Partial<CommunityPost> = {}): CommunityPost {
  return {
    id: 7,
    author: 'admin',
    title: '平台维护公告',
    status: 'published',
    tags: [{ id: 1, name: '公告' }],
    content_html: '<p>本周日凌晨维护，期间暂停下单。</p>',
    like_count: 0,
    comment_count: 0,
    liked_by_me: false,
    favorited_by_me: false,
    published_at: '2026-02-01 12:00:00',
    updated_at: '2026-02-01 12:00:00',
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    bounty_points: 0,
    bounty_status: 'none',
    bounty_accepted_comment_id: null,
    is_featured: false,
    featured_at: null,
    bumped_at: null,
    highlight_until: null,
    homepage_until: null,
    section_until: null,
    hot_until: null,
    ...overrides,
  }
}

export function disclosure(
  overrides: Partial<ConversationHistoryDisclosure> = {},
): ConversationHistoryDisclosure {
  return {
    id: 3,
    conversation_id: 'CONV-1',
    requirement_id: 'REQ-1',
    requirement_title: '企业官网改版',
    customer: 'cust',
    previous_developer: 'dev_old',
    current_developer: 'dev_new',
    developer_consent: 'pending',
    customer_consent: 'pending',
    status: 'pending',
    created_at: '2026-03-05T09:00:00+08:00',
    ...overrides,
  }
}

export function afterSalesCase(overrides: Partial<AfterSalesCase> = {}): AfterSalesCase {
  return {
    id: 5,
    caseNo: 'AFTERSALES_1_abc',
    requirementId: 'REQ-1',
    requirementTitle: '企业官网改版',
    requirementStatus: 'completed',
    openedBy: 'cust',
    openerRole: 'customer',
    expectsMoney: true,
    expectsRework: false,
    requiresRework: false,
    description: '交付物未满足验收标准，协商不成。',
    status: 'support_reviewing',
    liableParty: null,
    claimAmountFen: 1000,
    claimAmountCny: '10.00',
    refundAmountFen: 0,
    refundAmountCny: '0.00',
    compensationAmountFen: 0,
    compensationAmountCny: '0.00',
    shortfallFen: 0,
    shortfallCny: '0.00',
    providerRefundId: null,
    providerDepositConfirmId: null,
    resolutionNote: null,
    resolvedBy: null,
    resolvedAt: null,
    decisionDeadlineAt: '2026-04-03T09:00:00+08:00',
    customerDecision: 'opened',
    customerDecidedAt: '2026-04-01T09:00:00+08:00',
    developerDecision: 'reject',
    developerDecidedAt: '2026-04-01T10:00:00+08:00',
    createdAt: '2026-04-01T09:00:00+08:00',
    updatedAt: '2026-04-01T10:00:00+08:00',
    windowClosesAt: '2026-04-16T09:00:00+08:00',
    viewerRole: 'customer',
    ...overrides,
  }
}

export function transfer(
  overrides: Partial<ResourceTransferPayload> = {},
): ResourceTransferPayload {
  return {
    transfer_id: 1,
    resource_id: 100,
    resource_name: '企业官网模板',
    from_user: 'dev_old',
    from_team_id: null,
    from_team_name: null,
    to_user: 'dev_new',
    to_team_id: null,
    to_team_name: null,
    status: 'pending',
    message: null,
    from_ownership_type: 'individual',
    initiated_at: '2026-04-10 09:00:00',
    responded_at: null,
    responded_by: null,
    cancelled_at: null,
    ...overrides,
  }
}

export const kinds = (cards: NotificationCard[]) => cards.map((card) => card.kind)
export const keys = (cards: NotificationCard[]) => cards.map((card) => card.key)
