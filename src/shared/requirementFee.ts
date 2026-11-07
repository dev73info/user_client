/**
 * 需求单费用快照的展示口径（纯函数）。
 *
 * 金额只用整数分、比例只用基点，除法一律整数运算；格式化统一走 `shared/money`。
 * 合同签署页、定金 / 尾款弹窗、需求详情共用这里的文案与取数口径。
 */
import type { RequirementFeeTerms } from '@/api/requirementFee'
import { formatFenAsCny, parseCnyToFen } from '@/shared/money'

export type FeeViewerRole = 'customer' | 'developer'
export type FeePaymentStage = 'deposit' | 'final'

/** 基点 → 百分比文本：1000 → `10`，450 → `4.5`，425 → `4.25`。 */
export function formatBpsPercent(bps: number | null | undefined): string {
  const value = Number.isFinite(bps) ? Number(bps) : 0
  const hundredths = Math.trunc(value)
  const whole = Math.trunc(hundredths / 100)
  const fraction = Math.abs(hundredths % 100)
  if (fraction === 0) {
    return String(whole)
  }
  return `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`
}

/** 分 → `¥1.00`。负号放在 `¥` 前面。 */
export function formatFeeCny(fen: number | null | undefined): string {
  const value = Number(fen ?? 0)
  if (value < 0) {
    return `-¥${formatFenAsCny(-value)}`
  }
  return `¥${formatFenAsCny(value)}`
}

/** 当前阶段平台服务费（分）：定金阶段用定金快照，尾款阶段用尾款快照。 */
export function stagePlatformFeeFen(terms: RequirementFeeTerms, stage: FeePaymentStage): number {
  return stage === 'deposit' ? terms.deposit_platform_fee_fen : terms.final_platform_fee_fen
}

/** 当前阶段开发者到手（分）。 */
export function stageDeveloperNetFen(terms: RequirementFeeTerms, stage: FeePaymentStage): number {
  return stage === 'deposit' ? terms.deposit_developer_net_fen : terms.final_developer_net_fen
}

export type FeeLine = {
  label: string
  value: string
  /** 强调项：需求方看「您实付」，开发者看「到手」。 */
  emphasis?: boolean
}

/**
 * 合同签署页的「费用与结算」行。
 *
 * 需求方与开发者看的是同一份快照：需求方强调不额外收费，开发者强调扣费后到手。
 */
export function requirementFeeLines(terms: RequirementFeeTerms, role: FeeViewerRole): FeeLine[] {
  const platformPercent = formatBpsPercent(terms.platform_fee_bps)
  const taxPercent = formatBpsPercent(terms.personal_income_tax_bps)
  if (role === 'customer') {
    return [
      { label: '合同总额（您实付）', value: formatFeeCny(terms.total_fen), emphasis: true },
      {
        label: `平台服务费 ${platformPercent}%（从合同款中扣除，不额外向您收取）`,
        value: formatFeeCny(terms.platform_fee_fen),
      },
      { label: '开发者实收', value: formatFeeCny(terms.developer_net_fen) },
    ]
  }
  return [
    { label: '合同额', value: formatFeeCny(terms.total_fen) },
    {
      label: `平台服务费 −${platformPercent}%`,
      value: formatFeeCny(-terms.platform_fee_fen),
    },
    {
      label: `代扣个税 −${taxPercent}%`,
      value: formatFeeCny(-terms.tax_fen),
    },
    { label: '到手', value: formatFeeCny(terms.developer_net_fen), emphasis: true },
  ]
}

/** 费率锁定提示；`snapshot_at` 为空时退回「费率已锁定」。 */
export function feeLockNote(terms: RequirementFeeTerms): string {
  const lockedAt = terms.snapshot_at?.trim()
  return lockedAt
    ? `费率已于 ${lockedAt} 锁定，后续调整不影响本单。`
    : '费率已锁定，后续调整不影响本单。'
}

export const FEE_TERMS_PENDING_TEXT = '费率待确认'

/** 自管模式的说明：平台不代收代付，不展示金额拆分。 */
export const SELF_MANAGED_FEE_NOTE = '自管模式：平台不代收代付，不收取平台服务费'

/**
 * 资源预计到手（分）：按成交价与当前抽成比例向下取整，与后端落单快照同口径。
 * 只用于「预计」，真实金额以后端订单的 `platform_fee_fen` / `seller_net_fen` 为准。
 */
export function estimateResourceFeeFen(amountFen: number, platformFeeBps: number): number {
  if (!Number.isFinite(amountFen) || amountFen <= 0) {
    return 0
  }
  if (!Number.isFinite(platformFeeBps) || platformFeeBps <= 0) {
    return 0
  }
  const bps = Math.min(10_000, Math.trunc(platformFeeBps))
  return Math.trunc((Math.trunc(amountFen) * bps) / 10_000)
}

/** 资源预计到手（分）。 */
export function estimateResourceNetFen(amountFen: number, platformFeeBps: number): number {
  const amount = Number.isFinite(amountFen) ? Math.max(0, Math.trunc(amountFen)) : 0
  return amount - estimateResourceFeeFen(amount, platformFeeBps)
}

/** 资源发布页的费用提示：比例 + 买家价不变 + 预计到手；算不出到手时只给前半句。 */
export function resourceFeeHintText(platformFeeBps: number, expectedNetLabel?: string): string {
  const percent = formatBpsPercent(platformFeeBps)
  const base = `平台抽成 ${percent}%（按成交价扣除），买家支付价不变`
  return expectedNetLabel ? `${base}，预计到手 ${expectedNetLabel}` : base
}

export const RESOURCE_FEE_UNAVAILABLE_TEXT = '费率暂不可用，请刷新'

/**
 * 资源发布 / 编辑页的「预计到手」文本：现金价（元字符串）优先，其次积分价。
 * 没有有效定价时返回空串，提示只写费率与「买家支付价不变」。
 */
export function resourceExpectedNetLabel(
  cashYuanText: string,
  pointsText: string,
  platformFeeBps: number,
): string {
  const cashFen = parseCnyToFen(cashYuanText.trim() || '0') ?? 0
  if (cashFen > 0) {
    return `¥${formatFenAsCny(estimateResourceNetFen(cashFen, platformFeeBps))}`
  }
  const trimmedPoints = pointsText.trim()
  if (/^\d+$/.test(trimmedPoints)) {
    const points = Number(trimmedPoints)
    if (points > 0) {
      return `${points - estimateResourceFeeFen(points, platformFeeBps)} 积分`
    }
  }
  return ''
}

/** 平台费率调整的公告期口径（资源发布 / 资源管理页常驻一句）。 */
export const RESOURCE_FEE_NOTICE_TEXT = '费率调整提前 7 天公告，已下单订单不受影响'
