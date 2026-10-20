/**
 * R010 开发者主页打赏的纯逻辑：档位 ↔ 金额换算、自定义区间校验、通道可用性判定。
 *
 * 与后端 `backend_73info/src/modules/tip/service.rs` 的校验口径保持一致
 * （`resolve_cash_amount` / `resolve_points_amount` / `normalize_settings`），
 * 前端只做「提交前的本地提示」，最终以后端为准。
 */
import { fenToYuanText, parseYuanPriceInput } from '@/shared/resourceSale'

/** 留言最长字数（与后端 `MAX_MESSAGE_CHARS` 一致） */
export const TIP_MESSAGE_MAX_LENGTH = 200
/** 感谢语最长字数（与后端 `MAX_THANKS_CHARS` 一致） */
export const TIP_THANKS_MAX_LENGTH = 100
/** 固定档位最多数量（与后端 `MAX_TIERS` 一致） */
export const TIP_MAX_TIERS = 6
/** 单档现金上限（分） */
export const TIP_MAX_CASH_FEN = 99_999_900
/** 单档积分上限 */
export const TIP_MAX_POINTS = 1_000_000

/** 打赏设置的展示用结构（公开档案里的 `tip` 块与设置页响应都满足它）。 */
export type TipConfigLike = {
  /** 只读派生状态：两条通道任一开启即为 true（与后端 `is_enabled` 同口径） */
  enabled?: boolean | null
  cash_enabled?: boolean | null
  points_enabled?: boolean | null
  cash_tiers_fen?: number[] | null
  points_tiers?: number[] | null
  allow_custom_cash?: boolean | null
  custom_cash_min_fen?: number | null
  custom_cash_max_fen?: number | null
  allow_custom_points?: boolean | null
  custom_points_min?: number | null
  custom_points_max?: number | null
}

export type TipChannelAvailability = {
  cash: boolean
  points: boolean
}

/**
 * 通道可用性：两条通道各自看自己的开关（缺省视为开启，与建表默认一致）。
 *
 * 打赏整体是否可用由后端派生的 `enabled` 表达；这里只管「哪条通道能用」，
 * 所以不再有总开关参与判定——总开关已移除（见 `TipConfigLike.enabled`）。
 */
export function tipChannelAvailability(tip?: TipConfigLike | null): TipChannelAvailability {
  if (!tip) {
    return { cash: false, points: false }
  }
  return {
    cash: tip.cash_enabled !== false,
    points: tip.points_enabled !== false,
  }
}

/** 打开弹窗时的默认通道：优先现金，不行退积分，都不行也回现金（调用方据此禁提交）。 */
export function defaultTipChannel(availability: TipChannelAvailability): 'cash' | 'points' {
  if (availability.cash) {
    return 'cash'
  }
  return 'points'
}

/** 现金档位展示：分 → `¥x.xx`。 */
export function formatTipCashTier(fen: number | null | undefined): string {
  return `¥${fenToYuanText(fen ?? 0)}`
}

/** 积分档位展示：`N 积分`。 */
export function formatTipPointsTier(points: number | null | undefined): string {
  const value = Number(points ?? 0)
  return `${Number.isFinite(value) ? Math.trunc(value) : 0} 积分`
}

export type TipAmountOk = { ok: true; fen: number }
export type TipAmountErr = { ok: false; message: string }
export type TipCashAmountResult = TipAmountOk | TipAmountErr

/**
 * 校验「自填现金金额（元）」：非负、最多两位小数、> 0，且（允许自填时）落在配置区间内。
 * 不校验是否等于固定档位——自填输入框本来就只在 `allow_custom_cash` 下出现。
 */
export function validateTipCustomCash(
  raw: string | number | null | undefined,
  tip?: TipConfigLike | null,
): TipCashAmountResult {
  if (!tip?.allow_custom_cash) {
    return { ok: false, message: '该开发者未开启现金自填' }
  }
  const parsed = parseYuanPriceInput(raw)
  if (!parsed.ok) {
    return { ok: false, message: parsed.message }
  }
  if (parsed.fen <= 0) {
    return { ok: false, message: '打赏金额必须大于 0' }
  }
  const min = Number(tip.custom_cash_min_fen ?? 0)
  const max = Number(tip.custom_cash_max_fen ?? 0)
  if (parsed.fen < min || parsed.fen > max) {
    return {
      ok: false,
      message: `自填金额需在 ${formatTipCashTier(min)} ~ ${formatTipCashTier(max)} 之间`,
    }
  }
  return { ok: true, fen: parsed.fen }
}

export type TipPointsAmountResult = TipAmountOk | { ok: false; message: string }

/** 校验「自填积分」：正整数，且（允许自填时）落在配置区间内。 */
export function validateTipCustomPoints(
  raw: string | number | null | undefined,
  tip?: TipConfigLike | null,
): TipPointsAmountResult {
  if (!tip?.allow_custom_points) {
    return { ok: false, message: '该开发者未开启积分自填' }
  }
  const text = raw === null || raw === undefined ? '' : String(raw).trim()
  if (!text) {
    return { ok: false, message: '请填写打赏积分' }
  }
  if (!/^\d+$/.test(text)) {
    return { ok: false, message: '打赏积分须为正整数' }
  }
  const points = Number(text)
  if (!Number.isFinite(points) || points <= 0) {
    return { ok: false, message: '打赏积分必须大于 0' }
  }
  const min = Number(tip.custom_points_min ?? 0)
  const max = Number(tip.custom_points_max ?? 0)
  if (points < min || points > max) {
    return { ok: false, message: `自填积分需在 ${min} ~ ${max} 之间` }
  }
  return { ok: true, fen: points }
}

export type TipTierValidation =
  | { ok: true; tiers: number[] }
  | { ok: false; message: string }

/** 校验现金档位列表（元输入）：每项为非负两位小数，1..=TIP_MAX_CASH_FEN 分，最多 6 个。 */
export function validateTipCashTiers(rawTiers: (string | number)[]): TipTierValidation {
  if (rawTiers.length > TIP_MAX_TIERS) {
    return { ok: false, message: `现金档位最多 ${TIP_MAX_TIERS} 个` }
  }
  const tiers: number[] = []
  for (const raw of rawTiers) {
    const parsed = parseYuanPriceInput(raw)
    if (!parsed.ok) {
      return { ok: false, message: parsed.message }
    }
    if (parsed.fen < 1 || parsed.fen > TIP_MAX_CASH_FEN) {
      return { ok: false, message: '现金档位须大于 0 且不超过 ¥999999.00' }
    }
    tiers.push(parsed.fen)
  }
  return { ok: true, tiers }
}

/** 校验积分档位列表：每项为正整数，1..=TIP_MAX_POINTS，最多 6 个。 */
export function validateTipPointsTiers(rawTiers: (string | number)[]): TipTierValidation {
  if (rawTiers.length > TIP_MAX_TIERS) {
    return { ok: false, message: `积分档位最多 ${TIP_MAX_TIERS} 个` }
  }
  const tiers: number[] = []
  for (const raw of rawTiers) {
    const text = String(raw ?? '').trim()
    if (!/^\d+$/.test(text)) {
      return { ok: false, message: '积分档位须为正整数' }
    }
    const value = Number(text)
    if (value < 1 || value > TIP_MAX_POINTS) {
      return { ok: false, message: `积分档位须在 1 ~ ${TIP_MAX_POINTS} 之间` }
    }
    tiers.push(value)
  }
  return { ok: true, tiers }
}

/** 校验现金自填区间（元）：下限 ≥ 1 分、上限 ≤ 单档上限、下限 ≤ 上限。 */
export function validateTipCustomCashRange(
  minYuan: string | number,
  maxYuan: string | number,
): { ok: true; minFen: number; maxFen: number } | { ok: false; message: string } {
  const min = parseYuanPriceInput(minYuan)
  if (!min.ok) {
    return { ok: false, message: min.message }
  }
  const max = parseYuanPriceInput(maxYuan)
  if (!max.ok) {
    return { ok: false, message: max.message }
  }
  if (min.fen < 1 || max.fen > TIP_MAX_CASH_FEN || min.fen > max.fen) {
    return { ok: false, message: '现金自填区间不合法（下限须 ≤ 上限，且不超过单档上限）' }
  }
  return { ok: true, minFen: min.fen, maxFen: max.fen }
}

/** 校验积分自填区间：下限 ≥ 1、上限 ≤ 单档积分上限、下限 ≤ 上限。 */
export function validateTipCustomPointsRange(
  minPoints: string | number,
  maxPoints: string | number,
): { ok: true; minPoints: number; maxPoints: number } | { ok: false; message: string } {
  const readInt = (raw: string | number) => {
    const text = String(raw ?? '').trim()
    return /^\d+$/.test(text) ? Number(text) : NaN
  }
  const min = readInt(minPoints)
  const max = readInt(maxPoints)
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { ok: false, message: '积分自填区间须为正整数' }
  }
  if (min < 1 || max > TIP_MAX_POINTS || min > max) {
    return { ok: false, message: '积分自填区间不合法（下限须 ≤ 上限，且不超过单档上限）' }
  }
  return { ok: true, minPoints: min, maxPoints: max }
}

/** 收到的打赏金额展示：积分单优先，否则现金。 */
export function tipOrderAmountLabel(order: {
  amount_fen?: number | null
  amount_points?: number | null
}): string {
  const points = Number(order.amount_points ?? 0)
  if (Number.isFinite(points) && points > 0) {
    return `${Math.trunc(points)} 积分`
  }
  return `¥${fenToYuanText(order.amount_fen ?? 0)}`
}

/** 打赏订单状态文案。 */
export function tipStatusLabel(status: string): string {
  switch ((status ?? '').trim()) {
    case 'pending':
      return '待支付'
    case 'paid':
      return '已支付'
    case 'refunding':
      return '退款中'
    case 'refunded':
      return '已退款'
    case 'failed':
      return '失败'
    case 'closed':
      return '已关闭'
    default:
      return status || '未知'
  }
}

/** 公开记录里打赏者显示名：匿名固定显示「匿名」，不显示打赏者名。 */
export function tipperDisplayLabel(message: {
  anonymous?: boolean | null
  tipper_display?: string | null
}): string {
  if (message.anonymous) {
    return '匿名'
  }
  const name = (message.tipper_display ?? '').trim()
  return name || '匿名'
}

/** 「收到打赏」区块的累计现金文案。 */
export function tipReceivedCashText(fen: number | null | undefined): string {
  return `¥${fenToYuanText(fen ?? 0)}`
}

/** 「收到打赏」区块的累计积分文案。 */
export function tipReceivedPointsText(points: number | null | undefined): string {
  const value = Number(points ?? 0)
  return `${Number.isFinite(value) ? Math.trunc(value) : 0} 积分`
}
