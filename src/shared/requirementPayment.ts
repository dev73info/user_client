import { parseCnyToFen } from '@/shared/money'

export type BudgetedRequirement = {
  budget?: number | null
}

export type StatusedRequirement = {
  status?: string | null
}

/** 需求预算缺省（待议价 / 尚未回填）时按 1 元算基数：弹窗在拿到真实预算前不显示 ¥0.00。 */
const FALLBACK_BUDGET_FEN = 100

/** 应付金额的下限：1 分（避免比例为 0 或预算极小时算出 0）。 */
const MIN_PAY_FEN = 1

/**
 * 这一笔付的是尾款还是定金：只有「待付尾款」是尾款，其余（待付定金 / 开发中…）都按定金口径。
 *
 * 视图、支付弹窗与支付流程三处共用这一条判据——各写一遍 `status === 'pending_final'`
 * 迟早会出现「按钮说尾款、下单传 deposit」的错配。
 */
export function isRequirementFinalPayment(item: StatusedRequirement | null | undefined): boolean {
  return item?.status === 'pending_final'
}

/** 支付阶段的中文标签：拼进标题、按钮与 toast（「支付定金」「支付尾款」）。 */
export function requirementPayStageLabel(item: StatusedRequirement | null | undefined): string {
  return isRequirementFinalPayment(item) ? '尾款' : '定金'
}

/**
 * 需求预算（**整数分**）。
 *
 * 契约里 `budget` 是「元」（`number | null`，1.x 沿用的展示口径），进入计算前一次性换成
 * 整数分，之后所有加减乘除都在分上做，不出现浮点元。
 * `null`（待议价 / 尚未回填）按 1 元兜底，显式的 `0` 就是 0——两者不能混成同一个值。
 */
export function requirementBudgetFen(item: BudgetedRequirement): number {
  if (item.budget == null) {
    return FALLBACK_BUDGET_FEN
  }
  const fen = parseCnyToFen(item.budget)
  return fen != null && fen >= 0 ? fen : FALLBACK_BUDGET_FEN
}

/** 定金（整数分）= 预算 × 定金比例，四舍五入到分，最低 1 分。 */
export function calculateDepositFen(
  item: BudgetedRequirement,
  depositRatioPercent: number,
): number {
  const base = requirementBudgetFen(item)
  const ratio = Number(depositRatioPercent)
  const scaled = Number.isFinite(ratio) && ratio > 0 ? Math.round((base * ratio) / 100) : base
  return Math.max(MIN_PAY_FEN, scaled)
}

/** 尾款（整数分）= 预算 − 定金，最低 1 分。 */
export function calculateFinalPaymentFen(
  item: BudgetedRequirement,
  depositRatioPercent: number,
): number {
  const tail = requirementBudgetFen(item) - calculateDepositFen(item, depositRatioPercent)
  return Math.max(MIN_PAY_FEN, tail)
}

/**
 * 本次应付金额（整数分）：尾款按「总额 − 定金」，定金按比例算，口径都来自上面两个函数。
 *
 * 比例由调用方注入（视图从 `useMyRequirementsData` 取 `depositRatioPercent`），
 * 这里**不读设置接口、也不做默认值兜底**——两处各自兜底就会算出两个金额。
 *
 * 注意这只是一个**预估值**：真正的应付以 `POST /api/adapay/requirements/{id}/deposit`
 * 回执里的 `amount_fen` 为准（服务端按合同快照算）。
 */
export function requirementPayFen(
  item: BudgetedRequirement & StatusedRequirement,
  depositRatioPercent: number,
): number {
  return isRequirementFinalPayment(item)
    ? calculateFinalPaymentFen(item, depositRatioPercent)
    : calculateDepositFen(item, depositRatioPercent)
}
