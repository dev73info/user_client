/**
 * 解除合作案件的界面判定与文案（纯函数：不发请求、不碰 pinia）。
 *
 * 只认契约里的 `BreachCaseItemResponse` / `CaseSummaryResponse` 字段：
 * `status` / `status_label` / `is_open` / `filed_by` / `respondent` / `turn` / `turn_label`。
 * 状态码到中文的映射**不在前端维护**——后端 `CaseStatus::label()` 已经通过 `status_label` 给出来了。
 *
 * 为什么单拉一层：`MyRequirementsView` 没有挂载测试，这一域的行为回归全靠
 * `src/__tests__/requirementBreach.spec.ts`。凡是「是不是我」的判定一律收 `username` 参数，
 * 由调用方注入当前登录人——组件与 composable 都不自己去 store 里再取一遍。
 */
import type { RequirementBreachCaseItem } from '@/api/afterSales'

/**
 * 「能不能表态 / 能不能撤回」只读这四个字段，所以宽到两种响应都能直接喂：
 * 需求页的 `BreachCaseItemResponse`（`is_open`）与列表的 `CaseSummaryResponse`（`open`，
 * 调用方折成 `is_open` 再传）。判定只有一份，不按响应形状各写一套。
 *
 * `respondent` 写成 `string | null | undefined`：契约里它是**可选**字段
 * （`respondent?: string | null`），窄成 `string | null` 会让整条链路的赋值全红。
 */
export type BreachActionSubject = {
  status: string
  is_open: boolean
  filed_by: string
  respondent?: string | null
}

/**
 * 后端状态机里「对方能表态」与「立案人能撤回」的窗口（见后端 `dispute::domain::case`）：
 * 表态只能从 `filed` / `negotiating` 出发，撤回还多一个 `platform_review`。
 * 前端照着这两条列，不凭状态名的字面意思猜。
 */
const RESPONDABLE_STATUSES = ['filed', 'negotiating']
const WITHDRAWABLE_STATUSES = ['filed', 'negotiating', 'platform_review']

/** 已收口（结案 / 驳回）：结论不能翻案，同一需求可以另立新案。 */
const SETTLED_STATUSES = ['closed', 'rejected']

/**
 * 能不能由本人对案件表态（同意 / 不同意）。
 *
 * 后端只放行「对方当事人」，且只在表态窗口内：`actor_of(operator)` 算出来的不是
 * `Respondent` 一律 403。所以判据是「我是对方的那个账号」而不是「我不是立案人」——
 * 无关账号也不是立案人，但它同样不能表态。
 */
export function canRespondBreachCase(item: BreachActionSubject | null, username: string): boolean {
  return (
    item != null &&
    item.is_open &&
    RESPONDABLE_STATUSES.includes(item.status) &&
    item.respondent === username
  )
}

/** 立案人本人在撤回窗口内能撤回自己的申请（后端 `CaseAction::Withdraw` 只给 `Filer`）。 */
export function canWithdrawBreachCase(item: BreachActionSubject | null, username: string): boolean {
  return (
    item != null &&
    item.is_open &&
    WITHDRAWABLE_STATUSES.includes(item.status) &&
    item.filed_by === username
  )
}

/** 上一轮撤回人是不是本人：只有本人撤回才叫「重新申报」，对方撤回时本人是首次申报。 */
export function breachWithdrawnByMe(item: BreachActionSubject | null, username: string): boolean {
  return item?.status === 'withdrawn' && item.filed_by === username
}

/** 已结案 / 已驳回：结论定案不可翻案，新一轮申报会新建一条案件。 */
export function isBreachCaseSettled(item: RequirementBreachCaseItem | null): boolean {
  return item != null && SETTLED_STATUSES.includes(item.status)
}

/**
 * 撤回后再次申报沿用同一条案件（后端复用该行、案件编号不变），只有驳回 / 结案才会新建案件。
 * 标题与提交按钮都按这个口径措辞，避免出现「标题写新一轮、提示写沿用同一条」的自相矛盾。
 */
export function breachDialogTitle(
  item: RequirementBreachCaseItem | null,
  newRound: boolean,
  withdrawnByMe: boolean,
): string {
  if (!newRound && item) {
    return '解除合作进展'
  }
  if (item?.status === 'withdrawn') {
    return withdrawnByMe ? '重新发起解除合作' : '解除合作'
  }
  return newRound ? '发起新的解除合作' : '解除合作'
}

/** 提交按钮文案：与 `breachDialogTitle` 同一口径（沿用同一条 vs 新建一条）。 */
export function breachSubmitLabel(
  item: RequirementBreachCaseItem | null,
  newRound: boolean,
  withdrawnByMe: boolean,
): string {
  if (item?.status === 'withdrawn') {
    return withdrawnByMe ? '重新发起' : '提交解除合作申请'
  }
  return newRound ? '发起新一轮解除合作' : '提交解除合作申请'
}

/**
 * 申请表单上方的「上一轮」说明：讲清楚结论不能翻案，以及本次提交是新建案件还是沿用同一条。
 *
 * 撤回沿用同一条案件（编号不变），驳回 / 结案才新建；结案更狠一层——合同作废、需求退回大厅，
 * 所以不是「再提一条新案件」而是「重新接单并签约」（BUG-038）。这三句口径不能合并简化。
 */
export function breachRoundHint(
  item: RequirementBreachCaseItem | null,
  withdrawnByMe: boolean,
): string {
  if (!item) {
    return ''
  }
  if (item.status === 'withdrawn') {
    return withdrawnByMe
      ? '上一轮由你撤回，本次提交沿用同一条案件（案件编号不变），申请人与理由以本次提交为准，双方继续跟踪这一条。'
      : '上一轮由对方申请后撤回，本次提交沿用同一条案件（案件编号不变），按你本次提交的事实与依据重新判定。'
  }
  // 结案（`closed`）会按「结案即自动解除」作废合同、把需求退回大厅：同一需求上已经没有
  // 可裁决的合同，所以不是「再提一条新案件」而是「重新接单并签约」（BUG-038）。
  if (item.status === 'closed') {
    return '上一轮案件已结案，需求已退回大厅、原合同已作废；需重新接单并签约后才能再次发起解除合作。'
  }
  return '上一轮案件已驳回，结论不能翻案；本次提交会新建一条案件，只针对驳回之后新发生的事实。'
}
