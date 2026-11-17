import { parseBackendDateTime } from '@/shared/datetime'
import { countdownRemainingMs, formatCountdownDuration } from '@/shared/paymentDisplay'

/** 支付码下方的建议支付窗口：纯展示引导，不代表渠道硬过期（订单契约没有 expires_at）。 */
export const RESOURCE_PAYMENT_GUIDANCE_MS = 15 * 60 * 1000

export type ResourcePaymentCountdownInput = {
  createdAt: string
  status: string
  hasQr: boolean
  now: number
  /**
   * 本次支付码展示时间（毫秒）。
   *
   * 后端会复用同一渠道的 pending 单，`created_at` 可能是几天前；倒计时从
   * 「码真正展示给用户」起算，取 `created_at` 与它的较晚者，避免旧单直接显示已过期。
   */
  surfaceShownAt?: number
  guidanceMs?: number
}

export function resourcePaymentCountdownText(input: ResourcePaymentCountdownInput): string {
  if (!input.hasQr || input.status !== 'pending') {
    return ''
  }
  const createdAtMs = parseBackendDateTime(input.createdAt.trim())?.getTime()
  if (!createdAtMs) {
    return ''
  }
  const startedAtMs = Math.max(createdAtMs, input.surfaceShownAt ?? 0)
  const guidanceMs = input.guidanceMs ?? RESOURCE_PAYMENT_GUIDANCE_MS
  const remainingMs = countdownRemainingMs(startedAtMs + guidanceMs, input.now)
  return remainingMs > 0
    ? `建议在 ${formatCountdownDuration(remainingMs)} 内完成支付`
    : '支付码已生成较久，可切换渠道刷新'
}
