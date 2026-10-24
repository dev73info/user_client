/**
 * R010 开发者主页打赏的纯逻辑：档位 ↔ 金额换算、自填区间校验、金额 / 状态 / 显示名文案。
 *
 * 打赏只有**现金**一种形态：契约 `POST /api/tips` 的金额是整数分 `amount_fen`，
 * 打赏设置（`TipConfigResponse`）的档位与自填上下限也是整数分。契约里没有积分打赏
 * （`amount_points` / `points_tiers`）、没有平台服务费基点、也没有微信打赏中间页，
 * 所以这里不再有积分档位、积分自填、积分累计那一套。
 *
 * 元 ↔ 分只走 `@/shared/money`（`parseCnyToFen` / `formatFenAsCny`），本文件不做浮点算钱。
 * 校验口径与后端 `normalize_settings` 同（档位最多 6 个、单档上限、下限不高于上限），
 * 前端只做「提交前的本地提示」，最终以后端为准。
 */
import { formatFenAsCny, parseCnyToFen } from '@/shared/money'

/** 留言最长字数（与后端 `MAX_MESSAGE_CHARS` 一致） */
export const TIP_MESSAGE_MAX_LENGTH = 200
/** 感谢语最长字数（与后端 `MAX_THANKS_CHARS` 一致） */
export const TIP_THANKS_MAX_LENGTH = 100
/** 固定档位最多数量（与后端 `MAX_TIERS` 一致） */
export const TIP_MAX_TIERS = 6
/** 单档现金上限（分） */
export const TIP_MAX_CASH_FEN = 99_999_900

/**
 * 打赏设置的展示用结构（开发者公开主页里的 `tip` 块与设置页响应都满足它）。
 * 字段名与契约的 `TipConfigResponse` 同口径，单位一律分。
 */
export type TipConfigLike = {
  enabled?: boolean | null
  /** 固定档位（分） */
  cash_tiers_fen?: number[] | null
  allow_custom_cash?: boolean | null
  custom_cash_min_fen?: number | null
  custom_cash_max_fen?: number | null
}

/** 现金档位 / 金额展示：分 → `¥x.xx`。 */
export function formatTipCashTier(fen: number | null | undefined): string {
  return `¥${formatFenAsCny(fen ?? 0)}`
}

export type TipCashAmountResult =
  | { ok: true; fen: number }
  | { ok: false; message: string }

/** 元输入 → 分：空串与非两位小数的数字都返回 null（不猜用户意图）。 */
function readCnyFen(raw: string | number | null | undefined): number | null {
  const text = raw === null || raw === undefined ? '' : String(raw).trim()
  if (!text) {
    return null
  }
  return parseCnyToFen(text)
}

/**
 * 校验「自填现金金额（元）」：最多两位小数、> 0，且（允许自填时）落在配置区间内。
 * 不校验是否等于固定档位——自填输入框本来就只在 `allow_custom_cash` 下出现。
 */
export function validateTipCustomCash(
  raw: string | number | null | undefined,
  tip?: TipConfigLike | null,
): TipCashAmountResult {
  if (!tip?.allow_custom_cash) {
    return { ok: false, message: '该开发者未开启现金自填' }
  }
  const fen = readCnyFen(raw)
  if (fen === null) {
    return { ok: false, message: '打赏金额最多两位小数' }
  }
  if (fen <= 0) {
    return { ok: false, message: '打赏金额必须大于 0' }
  }
  const min = Number(tip.custom_cash_min_fen ?? 0)
  const max = Number(tip.custom_cash_max_fen ?? 0)
  if (fen < min || fen > max) {
    return {
      ok: false,
      message: `自填金额需在 ${formatTipCashTier(min)} ~ ${formatTipCashTier(max)} 之间`,
    }
  }
  return { ok: true, fen }
}

export type TipTierValidation =
  | { ok: true; tiers: number[] }
  | { ok: false; message: string }

/** 校验现金档位列表（元输入）：每项最多两位小数，1..=TIP_MAX_CASH_FEN 分，最多 6 个。 */
export function validateTipCashTiers(rawTiers: (string | number)[]): TipTierValidation {
  if (rawTiers.length > TIP_MAX_TIERS) {
    return { ok: false, message: `现金档位最多 ${TIP_MAX_TIERS} 个` }
  }
  const tiers: number[] = []
  for (const raw of rawTiers) {
    const fen = readCnyFen(raw)
    if (fen === null) {
      return { ok: false, message: '现金档位须为最多两位小数的金额' }
    }
    if (fen < 1 || fen > TIP_MAX_CASH_FEN) {
      return { ok: false, message: '现金档位须大于 0 且不超过 ¥999999.00' }
    }
    tiers.push(fen)
  }
  return { ok: true, tiers }
}

/** 校验现金自填区间（元）：下限 ≥ 1 分、上限 ≤ 单档上限、下限 ≤ 上限。 */
export function validateTipCustomCashRange(
  minYuan: string | number,
  maxYuan: string | number,
): { ok: true; minFen: number; maxFen: number } | { ok: false; message: string } {
  const minFen = readCnyFen(minYuan)
  const maxFen = readCnyFen(maxYuan)
  if (minFen === null || maxFen === null) {
    return { ok: false, message: '现金自填区间须为最多两位小数的金额' }
  }
  if (minFen < 1 || maxFen > TIP_MAX_CASH_FEN || minFen > maxFen) {
    return { ok: false, message: '现金自填区间不合法（下限须 ≤ 上限，且不超过单档上限）' }
  }
  return { ok: true, minFen, maxFen }
}

/** 打赏金额展示：`¥x.xx`（金额只有现金一档）。 */
export function tipOrderAmountLabel(order: { amount_fen?: number | null }): string {
  return `¥${formatFenAsCny(order.amount_fen ?? 0)}`
}

/** 打赏订单状态文案（契约状态：`pending` / `paid` / `failed` / `closed` / `refunding` / `refunded`）。 */
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
  return `¥${formatFenAsCny(fen ?? 0)}`
}
