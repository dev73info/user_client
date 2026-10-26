import type { AfterSalesCaseSummary } from '@/api/afterSales'
import type { CommunityCommentWarning } from '@/api/community'
import type { ConversationHistoryDisclosure } from '@/api/conversations'
import type { NotificationCard } from '@/shared/notifications'

/** 几类来源的字段很多，测试只关心被聚合层读到的那些，用工厂补齐其余字段，别在用例里铺一整份对象。 */
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

export function afterSalesCase(
  overrides: Partial<AfterSalesCaseSummary> = {},
): AfterSalesCaseSummary {
  return {
    case_no: 'AFTERSALES_1_abc',
    requirement_id: 'REQ-1',
    filed_by: 'cust',
    respondent: 'dev',
    kind: 'after_sales',
    kind_label: '售后争议',
    status: 'support_reviewing',
    status_label: '平台裁决中',
    open: true,
    claim_amount_fen: 1000,
    claim_amount: 10,
    created_time: '2026-04-01T09:00:00+08:00',
    updated_time: '2026-04-01T10:00:00+08:00',
    ...overrides,
  }
}

export function commentWarning(
  overrides: Partial<CommunityCommentWarning> = {},
): CommunityCommentWarning {
  return {
    id: 2,
    comment_id: 5,
    comment_type: 'community',
    comment_snapshot: '含有联系方式的测试评论',
    reason: '包含广告联系方式',
    operator: 'admin',
    created_at: '2026-05-01 10:00:00',
    ...overrides,
  }
}

export const kinds = (cards: NotificationCard[]) => cards.map((card) => card.kind)
export const keys = (cards: NotificationCard[]) => cards.map((card) => card.key)
