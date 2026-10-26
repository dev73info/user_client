import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'
import type { PurchaseTransfer } from '@/api/resourcePurchaseTransfers'
import type { ResourceTransfer } from '@/api/resourceTransfers'

export type TransferApplication = ResourceTransfer | PurchaseTransfer
export type TransferKind = 'resource' | 'purchase'
export type TransferDirection = 'incoming' | 'outgoing'

export function canTransferPurchase(
  order: Pick<ResourcePurchaseOrder, 'source_kind' | 'status' | 'entitlement_revoked'>,
): boolean {
  return (
    order.source_kind?.trim().toLowerCase() === 'oauth' &&
    order.status === 'paid' &&
    !order.entitlement_revoked
  )
}

export function validateTransferReceiver(input: {
  receiverType: 'user' | 'team'
  toUser: string
  toTeamId: number | null
}): string | null {
  if (input.receiverType === 'user') {
    return input.toUser.trim() ? null : '请填写接收方的登录用户名'
  }
  return input.toTeamId !== null && Number.isInteger(input.toTeamId) && input.toTeamId > 0
    ? null
    : '请选择接收团队'
}

export function transferStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return '待处理'
    case 'accepted':
      return '已接受'
    case 'rejected':
      return '已拒绝'
    case 'cancelled':
      return '已撤销'
    default:
      return status
  }
}

export function transferStatusTone(status: string): 'warning' | 'success' | 'danger' | 'neutral' {
  if (status === 'pending') return 'warning'
  if (status === 'accepted') return 'success'
  if (status === 'rejected') return 'danger'
  return 'neutral'
}

export function transferTitle(item: TransferApplication): string {
  return 'order_no' in item
    ? item.resource_title || `资源 #${item.resource_id}`
    : item.resource_name || `资源 #${item.resource_id}`
}

export function transferReference(item: TransferApplication): string {
  return 'order_no' in item ? `订单 ${item.order_no}` : `资源 #${item.resource_id}`
}

export function transferParties(item: TransferApplication): string {
  if ('order_no' in item) {
    return `${item.from_username} → ${item.to_username}`
  }
  const receiver = item.to_user
    ? item.to_user
    : item.to_team_id != null
      ? `团队 ${item.to_team_name ?? `#${item.to_team_id}`}`
      : '未知接收方'
  return `${item.from_user} → ${receiver}`
}
