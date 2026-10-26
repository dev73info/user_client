import type { PointsTransfer, UserPointsLog } from '@/api/points'

export type PointsRecordTab = 'transfers' | 'logs'
export const POINTS_RECORD_TABS: ReadonlyArray<{ key: PointsRecordTab; label: string }> = [
  { key: 'transfers', label: '打赏记录' },
  { key: 'logs', label: '积分明细' },
]

export type TransferScope = 'all' | 'sent' | 'received'
export type TransferScopeOption = { value: TransferScope; label: string; count: number }

export function pointsTransferScopes(
  transfers: PointsTransfer[],
  me: string,
): TransferScopeOption[] {
  return [
    { value: 'all', label: '全部', count: transfers.length },
    {
      value: 'sent',
      label: '我打赏的',
      count: transfers.filter((item) => pointsTransferMatchesScope(item, 'sent', me)).length,
    },
    {
      value: 'received',
      label: '我收到的',
      count: transfers.filter((item) => pointsTransferMatchesScope(item, 'received', me)).length,
    },
  ]
}

export function pointsTransferMatchesScope(
  transfer: PointsTransfer,
  scope: TransferScope,
  me: string,
): boolean {
  if (scope === 'all') return true
  return scope === 'sent' ? transfer.from_username === me : transfer.to_username === me
}

export function pointsTransferMatchesKeyword(transfer: PointsTransfer, keyword: string): boolean {
  const search = keyword.trim().toLocaleLowerCase()
  if (!search) return true
  return [transfer.from_username, transfer.to_username, transfer.note ?? ''].some((value) =>
    value.toLocaleLowerCase().includes(search),
  )
}

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
