/**
 * 违约案件状态枚举与中文文案。
 *
 * 取值与后端 `adapay_breach_case.status` 的 CHECK 约束一一对应
 * （`backend_73info/src/db/schema_postgres/commercial_compliance.sql`）。
 *
 * 四个前端各自持有一份同样的表：它们是四个独立仓库，没有共享包，跨仓引用要新建构建产物，
 * 代价大于收益。防漂移不靠人肉同步，靠 `flow-test/consistency_check.py` 的键集一致性断言——
 * 任何一端漏了状态，自检直接报红。
 */

/** 违约案件状态（与后端状态机一致）。 */
export type BreachCaseStatus =
  | 'submitted'
  | 'ai_reviewing'
  | 'ai_judged'
  | 'support_reviewing'
  | 'withdrawn'
  | 'processing'
  | 'manual_required'
  | 'succeeded'
  | 'rejected'

/** 违约案件状态文案（键集必须覆盖全部 `BreachCaseStatus`）。 */
export const BREACH_STATUS_LABELS: Record<BreachCaseStatus, string> = {
  submitted: '协商中',
  ai_reviewing: 'AI 审核中',
  ai_judged: 'AI 已判定，待双方确认',
  support_reviewing: '客服人工判定中',
  withdrawn: '申请人已撤回',
  processing: '资金处理中',
  manual_required: '资金执行待处理',
  succeeded: '已结案',
  rejected: '已驳回',
}

/** 取违约案件状态中文；空值给占位符，未知码回退原码便于发现漏配文案。 */
export function breachStatusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return BREACH_STATUS_LABELS[status as BreachCaseStatus] ?? status
}
