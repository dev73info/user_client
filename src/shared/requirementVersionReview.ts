import type {
  RequirementItem,
  RequirementPendingResourceVersionDeleteRequest,
} from '@/api/requirements'

type PendingVersionRequest = RequirementPendingResourceVersionDeleteRequest

export function versionDeleteRejectNote(item: RequirementItem) {
  const note = item.resource_version_delete_review_note
  return note ? `你上次拒绝删除版本：${note}` : ''
}

export function pendingResourceVersionTitle(item?: PendingVersionRequest | null) {
  return `版本号 ${item?.version?.trim() || '未命名版本'}`
}

export function formatPendingVersionRequestedAt(item: PendingVersionRequest) {
  return item.requested_at?.trim() || '时间未知'
}

export function pendingVersionRejectNote(
  notes: Record<number, string>,
  request: PendingVersionRequest,
) {
  return notes[request.version_id] ?? ''
}
