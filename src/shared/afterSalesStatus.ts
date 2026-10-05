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

/**
 * 售后诉求的**期望**文案：发起人想要什么（要钱 / 返工 / 两者都要 / 只是反馈）。
 *
 * 不再是「四类诉求」——`refund` 与 `compensation` 描述的其实是资金来源（客户自己付过的钱 /
 * 开发者的接单保证金），那是平台认定的事；`repair` 是动作项，现在可以与要钱并存。
 * 这里只按期望组合出一个短标签，给系统通知卡与列表用。
 */
export function afterSalesExpectationLabel(row: {
  expectsMoney: boolean
  expectsRework: boolean
}): string {
  if (row.expectsMoney && row.expectsRework) {
    return '要钱 + 返工'
  }
  if (row.expectsMoney) {
    return '要钱'
  }
  if (row.expectsRework) {
    return '要返工'
  }
  return '反馈问题'
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
