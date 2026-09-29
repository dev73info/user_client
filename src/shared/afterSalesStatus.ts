/**
 * 售后案件状态与诉求类型的中文文案。
 *
 * 取值与后端状态机一一对应（`backend_73info/src/modules/after_sales/service.rs`）。
 *
 * 这里只做**短标签**（「待对方表态」「平台裁决中」这种），给系统通知卡与列表用；
 * 案件详情弹窗里另有一套更长的话术（按「现在到哪一步、你要做什么」组织），
 * 两者口径不同，不要互相抄。
 *
 * 四个前端各自维护一份同口径文案：它们是四个独立仓库，没有共享包，
 * 跨仓引用要新建构建产物，代价大于收益。
 */

/** 售后案件状态（与后端状态机一致）。 */
export type AfterSalesCaseStatus =
  | 'submitted'
  | 'support_reviewing'
  | 'processing'
  | 'agreed'
  | 'rework_pending'
  | 'manual_required'
  | 'succeeded'
  | 'rejected'
  | 'withdrawn'

/** 售后案件状态短标签（键集必须覆盖全部 `AfterSalesCaseStatus`）。 */
export const AFTER_SALES_STATUS_LABELS: Record<AfterSalesCaseStatus, string> = {
  submitted: '待对方表态',
  support_reviewing: '平台裁决中',
  processing: '资金执行中',
  agreed: '待确认落实',
  rework_pending: '返工中',
  manual_required: '需人工处理',
  succeeded: '已结案',
  rejected: '已驳回',
  withdrawn: '已撤回',
}

/** 取售后案件状态中文；空值给占位符，未知码回退原码便于发现漏配文案。 */
export function afterSalesStatusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return AFTER_SALES_STATUS_LABELS[status as AfterSalesCaseStatus] ?? status
}

/** 售后诉求类型（与后端 `kind` 一致）。 */
export type AfterSalesKind = 'refund' | 'compensation' | 'repair' | 'other'

/** 售后诉求类型文案。 */
export const AFTER_SALES_KIND_LABELS: Record<AfterSalesKind, string> = {
  refund: '要求退款',
  compensation: '要求赔偿',
  repair: '要求返工',
  other: '其它问题',
}

/** 取诉求类型中文；未知码回退原码。 */
export function afterSalesKindLabel(kind: string | null | undefined): string {
  if (!kind) return '—'
  return AFTER_SALES_KIND_LABELS[kind as AfterSalesKind] ?? kind
}
