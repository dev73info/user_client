export type BudgetedRequirement = {
  budget?: number | null
}

export type StatusedRequirement = {
  status?: string | null
}

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

export function requirementBudgetAmount(item: BudgetedRequirement): number {
  return typeof item.budget === 'number' ? item.budget : 1
}

export function calculateFinalDepositAmount(
  item: BudgetedRequirement,
  depositRatioPercent: number,
): number {
  const base = Number(requirementBudgetAmount(item))
  if (!Number.isFinite(base) || base < 0.01) {
    return 0.01
  }

  const ratio = Number(depositRatioPercent)
  const scaled = Number.isFinite(ratio) && ratio > 0 ? (base * ratio) / 100 : base
  return Number(Math.max(0.01, scaled).toFixed(2))
}

export function calculateFinalPaymentAmount(
  item: BudgetedRequirement,
  depositRatioPercent: number,
): number {
  const base = Number(requirementBudgetAmount(item))
  if (!Number.isFinite(base) || base < 0.01) {
    return 0.01
  }

  const tail = Math.max(0.01, base - calculateFinalDepositAmount(item, depositRatioPercent))
  return Number(tail.toFixed(2))
}

/**
 * 本次应付金额：尾款按「总额 − 定金」，定金按比例算，口径都来自上面两个函数。
 *
 * 比例由调用方注入（视图从 `useMyRequirementsData` 取 `depositRatioPercent`），
 * 这里**不读设置接口、也不做默认值兜底**——两处各自兜底就会算出两个金额。
 */
export function requirementPayAmount(
  item: BudgetedRequirement & StatusedRequirement,
  depositRatioPercent: number,
): number {
  return isRequirementFinalPayment(item)
    ? calculateFinalPaymentAmount(item, depositRatioPercent)
    : calculateFinalDepositAmount(item, depositRatioPercent)
}
