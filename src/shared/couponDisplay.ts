/** 优惠券展示口径（券中心与账户页共用）。 */
import type { CouponItem } from '@/api/coupons'
import { formatBackendDateTime } from '@/shared/datetime'
import { formatFenAsCny } from '@/shared/money'

/** 券的有效期展示：年份要留着（跨年券），时分可省。 */
const COUPON_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
}

export function formatCouponTime(value: string): string {
  return formatBackendDateTime(value, COUPON_TIME_OPTIONS)
}

export function formatCouponRange(item: CouponItem): string {
  if (!item.starts_at && !item.ends_at) {
    return '永久有效'
  }

  const parts: string[] = []
  if (item.starts_at) {
    parts.push(`起始：${formatCouponTime(item.starts_at)}`)
  }
  if (item.ends_at) {
    parts.push(`截止：${formatCouponTime(item.ends_at)}`)
  }
  return parts.join('，')
}

/** 整数基点 → 百分数文本：2000 → 「20%」，1250 → 「12.5%」（不做浮点金额运算）。 */
export function formatBpsPercent(bps: number | null | undefined): string {
  const value = Math.max(0, Math.trunc(bps ?? 0))
  const whole = Math.floor(value / 100)
  const fraction = value % 100
  if (fraction === 0) {
    return `${whole}%`
  }
  const fractionText = String(fraction).padStart(2, '0').replace(/0+$/, '')
  return `${whole}.${fractionText}%`
}

/** 券面额：「减免 ¥10.00」/「优惠 20%，上限 ¥50.00」（金额一律整数分）。 */
export function formatCouponDiscount(item: CouponItem): string {
  if (item.discount_type === 'amount') {
    return `减免 ¥${formatFenAsCny(item.amount_off_fen)}`
  }
  const cap =
    item.max_discount_fen != null ? `，上限 ¥${formatFenAsCny(item.max_discount_fen)}` : ''
  return `优惠 ${formatBpsPercent(item.discount_bps)}${cap}`
}
