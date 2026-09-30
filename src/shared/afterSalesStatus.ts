/**
 * 售后案件状态与诉求类型的中文文案。
 *
 * 取值与后端状态机一一对应（`backend_73info/src/modules/after_sales/service.rs`）。
 *
 * 这里只做**短标签**（「待对方表态」「平台裁决中」这种）与**待办判定**（`isAwaitingViewerAction`，
 * 给列表行的「售后」入口挂角标），给系统通知卡与列表用；
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

/** 判断待办所需的最小字段（两个页面传进来的正是 `AfterSalesCase`）。 */
export type AfterSalesActionSubject = {
  status: string
  openerRole: string
  viewerRole: string | null
  customerDecision: string | null
  developerDecision: string | null
}

/**
 * 案件是否**在等当前登录人动作** —— 需求列表行上的「售后」入口据此挂待办角标。
 *
 * 口径直接对齐后端的动作白名单，不要凭状态名猜：
 *   - 发起人（甲方）：`agreed`（待确认落实）与 `rework_pending`（待验收）只能由发起人收口
 *     （`confirm_agreed_case` 的 `complete` / `unfulfilled`），所以这两个状态算他的待办；
 *   - 对方（乙方）：`submitted` / `support_reviewing` 且自己还没表态 —— `respond_case`
 *     只在这两个状态、且本方表态列为空时放行；
 *   - 发起人在「待表态」阶段只能撤回，那是可选动作，不算待办；
 *   - `processing` / `manual_required` 在等渠道回调或客服，不是当事双方的待办。
 */
export function isAwaitingViewerAction(row: AfterSalesActionSubject): boolean {
  if (row.viewerRole === null) {
    return false
  }
  if (row.status === 'agreed' || row.status === 'rework_pending') {
    return row.viewerRole === row.openerRole
  }
  if (row.status !== 'submitted' && row.status !== 'support_reviewing') {
    return false
  }
  if (row.viewerRole === row.openerRole) {
    return false
  }
  return row.viewerRole === 'developer'
    ? row.developerDecision === null
    : row.customerDecision === null
}

/** 待办角标读数：超过 99 收成 `99+`，与工作台菜单角标同一口径。 */
export function afterSalesBadgeText(count: number): string {
  return count > 99 ? '99+' : String(count)
}
