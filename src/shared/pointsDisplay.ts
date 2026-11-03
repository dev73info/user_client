import type { PointsTransfer, UserPointsLog } from '@/api/points'

export function pointsSelfName(username: string, me: string): string {
  return username === me ? '我' : username
}

export function pointsTransferMeta(transfer: PointsTransfer): string {
  const fee = transfer.fee > 0 ? ` · 手续费 ${transfer.fee}` : ''
  const note = transfer.note ? ` · ${transfer.note}` : ''
  return `${transfer.created_at}${fee}${note}`
}

export function pointsTransferBadgeLabel(transfer: PointsTransfer, me: string): string {
  return transfer.to_username === me ? `+${transfer.received}` : `-${transfer.amount}`
}

export function pointsTransferBadgeClass(transfer: PointsTransfer, me: string): string {
  return transfer.to_username === me ? 'wb-badge--success' : ''
}

export function pointsTransferFee(amount: number | null | undefined, feeRate: number): number {
  if (!amount || amount <= 0) return 0
  return Math.floor((amount * feeRate) / 100)
}

export function pointsTransferReceived(amount: number | null | undefined, feeRate: number): number {
  if (!amount || amount <= 0) return 0
  return amount - pointsTransferFee(amount, feeRate)
}

export function pointsTransferStatusLabel(transfer: PointsTransfer): string {
  if (transfer.pending_review || transfer.status === 'pending_review') return '待审核'
  if (transfer.status === 'rejected') return '已拒绝'
  return '已完成'
}

export function pointsLogTitle(log: UserPointsLog): string {
  return log.reason || '积分变动'
}

export function pointsLogMeta(log: UserPointsLog): string {
  return `${log.created_at} · 变动后余额 ${log.balance_after}`
}

export function pointsLogDeltaLabel(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`
}

export function pointsLogBadgeClass(delta: number): string {
  return delta > 0 ? 'wb-badge--success' : 'wb-badge--danger'
}
