import { HttpError } from '@/api/http'
import type {
  ResourceTransferPayload,
  ResourceTransferStatus,
} from '@/api/resourceTransfers'

/** 发起过户表单里选中的接收方（用户名与团队二选一）。 */
export type TransferReceiverInput = {
  /** 'user'：接收个人开发者；'team'：接收团队 */
  receiverType: 'user' | 'team'
  toUser: string
  toTeamId: number | null
}

/**
 * 接收方二选一校验。
 *
 * 与后端同口径：两边都填、都不填都算不合法；用户名会去掉首尾空白后再判空，
 * 避免「只敲了空格」被当成有效用户名发出去。返回中文提示，`null` 表示通过。
 */
export function validateTransferReceiver(input: TransferReceiverInput): string | null {
  if (input.receiverType === 'user') {
    if (input.toUser.trim()) {
      return null
    }
    return '请填写接收方的开发者用户名'
  }

  if (typeof input.toTeamId === 'number' && Number.isFinite(input.toTeamId)) {
    return null
  }

  return '请选择接收团队'
}

/** 只有待处理的申请可以撤销（同意 / 拒绝 / 撤销之后一律不可再操作）。 */
export function isTransferCancelable(status: ResourceTransferStatus | string): boolean {
  return status === 'pending'
}

/** 过户状态的中文名。 */
export function transferStatusLabel(status: ResourceTransferStatus | string): string {
  switch (status) {
    case 'pending':
      return '等待对方同意'
    case 'accepted':
      return '已同意'
    case 'rejected':
      return '已拒绝'
    case 'cancelled':
      return '已撤销'
    default:
      return status
  }
}

/** 过户状态对应的标签配色。 */
export function transferStatusTone(
  status: ResourceTransferStatus | string,
): 'accent' | 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'pending':
      return 'warning'
    case 'accepted':
      return 'success'
    case 'rejected':
      return 'danger'
    case 'cancelled':
      return 'neutral'
    default:
      return 'neutral'
  }
}

/** 接收方展示名：个人取用户名，团队取团队名。 */
export function describeTransferReceiver(
  transfer: Pick<ResourceTransferPayload, 'to_user' | 'to_team_id' | 'to_team_name'>,
): string {
  if (transfer.to_user) {
    return `开发者 ${transfer.to_user}`
  }
  if (transfer.to_team_id !== null && transfer.to_team_id !== undefined) {
    return `团队 ${transfer.to_team_name ?? `#${transfer.to_team_id}`}`
  }
  return '—'
}

/**
 * 把过户接口的失败翻译成用户能读的文案。
 *
 * 后端已经为每种拒绝给了中文提示（例如「该资源正被需求绑定，暂不能过户」），
 * 所以 4xx 优先原样展示后端文案；只有 401/403 与空 body 才回落到固定文案，
 * 免得把 `forbidden` 这类英文串直接甩给用户。
 */
export function describeTransferError(
  error: unknown,
  fallback = '操作失败，请稍后重试',
): {
  message: string
  needRefresh: boolean
} {
  if (error instanceof HttpError) {
    const body = error.message?.trim() ?? ''
    if (error.status === 401) {
      return { message: '登录状态已失效，请重新登录', needRefresh: false }
    }
    if (error.status === 403) {
      return { message: '只有过户的接收方本人（或该团队的管理者）可以处理这条申请', needRefresh: false }
    }
    if (error.status === 404 && (!body || body === 'not found' || body === 'Not Found')) {
      return { message: '过户申请不存在或已被删除', needRefresh: true }
    }
    if (!body) {
      return { message: fallback, needRefresh: false }
    }
    // 409「已处理 / 已有待处理」说明列表已经过期，调用方刷新即可，不必再弹错误。
    const needRefresh = error.status === 409
    return { message: body, needRefresh }
  }

  if (error instanceof Error && error.message.trim()) {
    return { message: error.message, needRefresh: false }
  }

  return { message: fallback, needRefresh: false }
}
