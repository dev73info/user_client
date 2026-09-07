export type BudgetedRequirement = {
  budget?: number | null
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
