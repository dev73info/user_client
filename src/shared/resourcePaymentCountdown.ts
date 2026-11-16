import { parseBackendDateTime } from '@/shared/datetime'
import { countdownRemainingMs, formatCountdownDuration } from '@/shared/paymentDisplay'

/** 支付码下方的建议支付窗口：纯展示引导，不代表渠道硬过期（订单契约没有 expires_at）。 */
export const RESOURCE_PAYMENT_GUIDANCE_MS = 15 * 60 * 1000

export type ResourcePaymentCountdownInput = {
  createdAt: string
  status: string
  hasQr: boolean
  now: number
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
  const guidanceMs = input.guidanceMs ?? RESOURCE_PAYMENT_GUIDANCE_MS
  const remainingMs = countdownRemainingMs(createdAtMs + guidanceMs, input.now)
  return remainingMs > 0
    ? `建议在 ${formatCountdownDuration(remainingMs)} 内完成支付`
    : '支付码已生成较久，可切换渠道刷新'
}
