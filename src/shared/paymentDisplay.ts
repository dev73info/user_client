/**
 * 支付页「支付信息」栏与剩余时间的显示口径（纯函数，不依赖 Vue）。
 *
 * 中间页（资源 / 打赏）的 query 本身不含金额，展示要靠 `wechat-status` 回填的订单；
 * 三套订单域的主语不同（需求号 / 资源号 / 打赏给），所以「显示成什么」在这里一次定死，
 * 不再散落在模板的三元表达式里。
 */

import { parseBackendDateTime } from '@/shared/datetime'
import { formatFenAsCny } from '@/shared/money'

/** 分 → 元；非法值给空串（模板按假值整行不渲染） */
export function fenToCny(fen: number | null | undefined): string {
  if (typeof fen !== 'number' || !Number.isSafeInteger(fen)) {
    return ''
  }
  return formatFenAsCny(fen)
}

/** 订单号：中间页优先用回填订单的号，退回到 query 上的 order_no；主通道用 payment_id，意图模式还没单号 */
export function pickDisplayOrderNo(input: {
  isWechatMiddlePage: boolean
  isTipWechat: boolean
  tipDetailOrderNo: string
  resourceDetailOrderNo: string
  tipOrderNo: string
  resourceOrderNo: string
  paymentId: string
  isIntentMode: boolean
}): string {
  if (input.isWechatMiddlePage) {
    return input.isTipWechat
      ? input.tipDetailOrderNo || input.tipOrderNo
      : input.resourceDetailOrderNo || input.resourceOrderNo
  }
  return input.paymentId || (input.isIntentMode ? '待创建' : '')
}

/** 金额：中间页用回填订单的金额，主通道用 query 上的 amount_cny */
export function pickDisplayAmountCny(input: {
  isTipWechat: boolean
  isResourceWechat: boolean
  tipAmountCny: string
  resourceAmountCny: string
  amountCny: string
}): string {
  if (input.isTipWechat) return input.tipAmountCny
  if (input.isResourceWechat) return input.resourceAmountCny
  return input.amountCny
}

/** 「需求号 / 资源号 / 打赏给」 */
export function pickSubjectLabel(isTipWechat: boolean, isResourceWechat: boolean): string {
  if (isTipWechat) return '打赏给'
  if (isResourceWechat) return '资源号'
  return '需求号'
}

/** 主语的具体值：打赏是开发者，资源是资源号，主通道是需求号 */
export function pickSubjectId(input: {
  isTipWechat: boolean
  isResourceWechat: boolean
  tipDeveloper: string
  resourceId: number | null | undefined
  requirementId: string
}): string {
  if (input.isTipWechat) return input.tipDeveloper
  if (input.isResourceWechat) {
    return typeof input.resourceId === 'number' ? String(input.resourceId) : ''
  }
  return input.requirementId
}

/** `expires_at` 解析成毫秒时间戳；空值 / 非法格式给 NaN（支付机构订单没回截止时间） */
export function parseExpiresAtMs(raw: string): number {
  const parsed = parseBackendDateTime(raw)
  return parsed ? parsed.getTime() : NaN
}

/** 剩余毫秒：时间戳非法给 NaN，已过期给 0 */
export function countdownRemainingMs(expiresAtMs: number, now: number): number {
  if (!Number.isFinite(expiresAtMs)) {
    return NaN
  }
  return Math.max(0, expiresAtMs - now)
}

/** 剩余时间文案：`hh:mm:ss`，过期 / 缺失 / 格式非法各有一句话 */
export function formatCountdownText(expiresAt: string, remainingMs: number): string {
  if (!expiresAt.trim()) {
    return '以支付机构订单为准'
  }
  if (!Number.isFinite(remainingMs)) {
    return '时间格式无效'
  }
  if (remainingMs <= 0) {
    return '已过期'
  }

  const totalSeconds = Math.floor(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}
