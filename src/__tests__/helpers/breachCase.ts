import type {
  AfterSalesCaseDetail,
  RequirementBreachCase,
  RequirementBreachCaseItem,
} from '@/api/afterSales'

/**
 * 解除合作案件的测试夹具（字段全部照契约，一个字都不多加）。
 *
 * 抽出来是因为三份 spec 都要造同一条案件：案子本体的 `BreachCaseItemResponse`、
 * 需求页拿到的 `RequirementBreachCase`（`has_case` 才是空态判据）、以及详情
 * `CaseDetailResponse`。规格一改只改这一处。
 */

/** 一条「协商中」的案件：立案人 alice，等对方当事人 bob 表态。 */
export function breachCaseItem(
  patch: Partial<RequirementBreachCaseItem> = {},
): RequirementBreachCaseItem {
  return {
    case_no: 'BC-20261028153000-AB12',
    kind: 'mutual_unbind',
    kind_label: '协商解除',
    status: 'negotiating',
    status_label: '协商中',
    is_open: true,
    filed_by: 'alice',
    respondent: 'bob',
    claim_amount_fen: 0,
    claim_amount_cny: 0,
    opened_at: '2026-10-28 15:30:00',
    turn: 'respondent',
    turn_label: '等待 bob 表态',
    ...patch,
  }
}

/** `GET /api/requirement/{id}/breach-case` 的响应：`has_case = false` 是正常空态。 */
export function breachCaseResponse(
  item: RequirementBreachCaseItem | null,
  requirementId = '2026-900000000201',
): RequirementBreachCase {
  return { requirement_id: requirementId, has_case: item != null, case: item }
}

/** 案件详情：摘要字段 + 诉求说明 + 表态流水 + 裁决。 */
export function breachCaseDetail(patch: Partial<AfterSalesCaseDetail> = {}): AfterSalesCaseDetail {
  const item = breachCaseItem()
  return {
    case_no: item.case_no,
    requirement_id: '2026-900000000201',
    filed_by: item.filed_by,
    respondent: item.respondent,
    kind: item.kind,
    kind_label: item.kind_label,
    status: item.status,
    status_label: item.status_label,
    open: item.is_open,
    claim_amount_fen: item.claim_amount_fen,
    claim_amount: item.claim_amount_cny,
    created_time: item.opened_at,
    updated_time: item.opened_at,
    claim_note: '交付内容与合同不符',
    statements: [],
    verdict: null,
    closed_time: null,
    handled_by: null,
    handled_time: null,
    mutual_agreed_time: null,
    ...patch,
  }
}
