import { afterSalesExpectationLabel } from '@/shared/afterSalesStatus'
import type { AfterSalesCase, AfterSalesDecision } from '@/api/afterSales'

/**
 * 解除合作弹窗的展示层纯函数（R047 从 `components/AfterSalesModal.vue` 下沉）。
 *
 * 只做「状态 → 文案」「案件行 → 资金明细」这两件事，不读 props、不碰响应式：
 * 组件里留着的 `computed` 只负责挑当前案件，文案与算式一律走这里，单测与日志都好写。
 */

/** 终态案件不再有可执行动作，只作为历史记录展示。 */
export const CLOSED_STATUSES = ['succeeded', 'rejected', 'withdrawn']

/**
 * 有结论的收口状态：只有「结案」与「驳回」是平台或双方给出的结论。
 *
 * 撤回不算结论——它是发起人自己收手，既不产生责任认定也没有资金动作，
 * 把它的诉求字段摆成一张「上次解除合作」的结论表，只会让人以为平台对此有过说法。
 */
export const CONCLUDED_STATUSES = ['succeeded', 'rejected']

/** 表态与撤回都只放行尚未进入资金执行的案件，与后端的状态守卫一致。 */
export function actionAllowed(status: AfterSalesCase['status']) {
  return ['submitted', 'support_reviewing'].includes(status)
}

export function statusText(status: AfterSalesCase['status']) {
  switch (status) {
    case 'submitted':
      return '待对方表态'
    case 'support_reviewing':
      return '平台裁决中'
    case 'processing':
      // 与平台侧（管理端 / 客服端）同口径：`processing` 指的是资金执行中，不是「平台在审」。
      // 双方一致与平台裁决走的是同一条资金链路，责任方在 `liableParty` 上（`mutual` = 双方一致）。
      return '资金执行中'
    case 'agreed':
      // 对方接受了诉求，但没有需要执行的资金动作（没要钱，或两个上限都是 0），等发起人确认落实。
      return '待确认落实'
    case 'rework_pending':
      // 对方接受了返工要求，等发起人验收（若还谈了钱，钱在这之前已按认定执行完）；
      // 发起人可点「确认已落实」或「未落实，申请平台介入」。
      return '返工中'
    case 'manual_required':
      // 渠道扣划失败或超时无人处理后的兜底状态，等客服人工介入。
      return '需人工处理'
    case 'succeeded':
      return '已结案'
    case 'rejected':
      return '已驳回'
    case 'withdrawn':
      return '已撤回'
    default:
      return '需人工处理'
  }
}

/**
 * 在办案件的一句话状态说明：先说清「现在到哪一步、你要做什么」。
 *
 * 待对方表态这类不需要解释的状态不给文案，省掉一行噪音。
 * `processing` 不在这张表里：它的说法要看责任方（见 [`processingTip`]）。
 */
export const STATUS_TIPS: Partial<Record<AfterSalesCase['status'], string>> = {
  support_reviewing: '已提交平台裁决，等待客服认定责任方与金额。',
  agreed: '双方已就诉求达成一致，落实后由发起人点「确认已落实」结案。',
  rework_pending:
    '对方已接受返工要求（若同时谈了钱，钱已按认定执行完），返工完成后由发起人点「确认已落实」结案。',
}

/**
 * 资金执行中的说明分两种来路，不能混成一句。
 *
 * `liable_party = 'mutual'` 是双方在案件里自己谈成的（对方点了「接受诉求」），平台没做过任何
 * 裁决，只是照约定把钱退给发起人——写成「平台裁决已落地」会让人以为平台介入过，明明两边
 * 已经谈好了。只有客服认定（`customer` / `developer`）才是真的裁决。
 */
export function processingTip(liableParty: AfterSalesCase['liableParty']) {
  return liableParty === 'mutual'
    ? '双方已达成一致，退款正在原路退回（渠道退款有等待期），到账后自动结案。'
    : '平台裁决已落地，资金正在执行，完成后自动结案。'
}

/** 折进折叠区的流程分支细节：只给确实有分支可说的状态，避免点开是空盒子。 */
export const STATUS_DETAILS: Partial<Record<AfterSalesCase['status'], string>> = {
  support_reviewing:
    '客服给出责任方与金额认定后，由平台执行尾款退还 / 保证金赔付并结案（尾款已分账时按原分账份额原路退回）。这期间发起人仍可撤回申请；资金一旦开始执行就只能等落地。',
  agreed:
    '这条诉求没有需要平台执行的钱（没要钱，或两个上限都是 0），落实完成后由发起人确认结案；一直不确认会在解除合作窗口关闭后转人工客服。',
  rework_pending:
    '若对方没有落实，发起人可点「未落实，申请平台介入」转客服裁决，届时可动用尾款退还与保证金赔付两个渠道；一直不确认会在解除合作窗口关闭后转人工客服。',
}

/** 分 → 「¥12.34」：差额行要拿两个金额相加，所以这里按金额分格式化一次。 */
export function moneyFromFen(fen: number) {
  return `¥${(fen / 100).toFixed(2)}`
}

/** 案件卡上的「期望」一行：发起人想要什么（要钱 / 返工 / 两者都要 / 只是反馈）。 */
export function expectationText(row: AfterSalesCase) {
  return afterSalesExpectationLabel({
    expectsMoney: row.expectsMoney,
    expectsRework: row.expectsRework,
  })
}

/**
 * 一条资金动作的落地凭据是**渠道单号**，不是案件行上的金额。
 *
 * `refundAmountFen` / `compensationAmountFen` 是裁决**认定**的额度，`claim_for_verdict` 一认领案件
 * 就写进去了；真的执行了才会带上 `providerRefundId`（渠道退款单号）/ `providerDepositConfirmId`
 * （保证金扣划确认单号）。赔付腿失败会转 `manual_required`，那时额度已经写好、钱却没动过
 * （实测：`compensation_amount_fen=20000`，而开发者的保证金冻结仍是整额、台账里没有补偿分录）。
 */
export function executedFunds(row: AfterSalesCase): string[] {
  const parts: string[] = []
  if (row.refundAmountFen && row.providerRefundId) {
    // 「退还客户已付款」，不是「退还尾款」：结单后定金与尾款都能原路退，诉求不超过已付时
    // 全走退款，所以这一笔可能是两笔渠道退款（尾款 + 定金）合起来的结果。
    parts.push(`退还客户已付款 ${row.refundAmountCny} 元`)
  }
  if (row.compensationAmountFen && row.providerDepositConfirmId) {
    parts.push(`保证金赔付 ${row.compensationAmountCny} 元`)
  }
  return parts
}

/** 认定了但渠道还没受理的那几笔：单独说清「尚未执行」，不能混进「已执行资金」。 */
export function pendingFunds(row: AfterSalesCase): string[] {
  const parts: string[] = []
  if (row.refundAmountFen && !row.providerRefundId) {
    parts.push(`退还客户已付款 ${row.refundAmountCny} 元`)
  }
  if (row.compensationAmountFen && !row.providerDepositConfirmId) {
    parts.push(`保证金赔付 ${row.compensationAmountCny} 元`)
  }
  return parts
}

/**
 * **已执行**的资金合计（分）：只有带渠道单号的那几笔算数。
 *
 * 诉求差额要拿它算，不能拿主张额度算——否则一分钱没落地的案件也会显示「本次共执行 360 元」。
 */
export function executedFundsFen(row: AfterSalesCase): number {
  let total = 0
  if (row.refundAmountFen && row.providerRefundId) {
    total += row.refundAmountFen
  }
  if (row.compensationAmountFen && row.providerDepositConfirmId) {
    total += row.compensationAmountFen
  }
  return total
}

export function decisionText(decision: AfterSalesDecision | null) {
  if (decision === 'opened') {
    // 发起人发起时就已经表态了：诉求本身就是他的立场，因此不会显示成「未表态」。
    return '已发起诉求'
  }
  if (decision === 'accept') {
    return '接受诉求'
  }
  if (decision === 'reject') {
    return '不接受，转平台裁决'
  }
  if (decision === 'unfulfilled') {
    return '返工未落实，已申请平台介入'
  }
  return '未表态'
}

/** 发起人撤回：`agreed`（等确认落实）与 `rework_pending`（返工中）也放行，不想再追究就收口。 */
export function withdrawAllowed(status: AfterSalesCase['status']) {
  return actionAllowed(status) || status === 'agreed' || status === 'rework_pending'
}
