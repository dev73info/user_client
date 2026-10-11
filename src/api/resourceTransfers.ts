import { authHeader, requestJson } from '@/api/http'

/** 过户申请状态。`pending` 是唯一可处理（同意 / 拒绝 / 撤销）的状态。 */
export type ResourceTransferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled'

/** 一条资源过户申请（「我发起的」与「待我同意」列表同形状）。 */
export type ResourceTransferPayload = {
  transfer_id: number
  resource_id: number
  resource_name: string
  /** 发起时刻资源的所有者用户名 */
  from_user: string
  /** 发起时为团队资源则记该团队 */
  from_team_id: number | null
  from_team_name: string | null
  /** 接收个人 */
  to_user: string | null
  /** 接收团队 */
  to_team_id: number | null
  to_team_name: string | null
  status: ResourceTransferStatus
  message: string | null
  /** 发起时归属类型快照 */
  from_ownership_type: 'individual' | 'team'
  initiated_at: string
  responded_at: string | null
  responded_by: string | null
  cancelled_at: string | null
}

/** 发起过户请求体：`to_user` 与 `to_team_id` 二选一。 */
export type CreateResourceTransferRequest = {
  to_user?: string | null
  to_team_id?: number | null
  message?: string | null
}

/**
 * 发起过户（`POST /api/resources/resources/{resource_id}/transfers`）。
 *
 * 后端会在这些前提下拒绝并返回中文提示：不是资源所有者（403）、接收方是自己（400）、
 * 接收方不存在（404）、资源正被活跃需求绑定（409）、已有待处理申请（409）。
 */
export async function createResourceTransfer(
  token: string,
  resourceId: number,
  payload: CreateResourceTransferRequest,
): Promise<ResourceTransferPayload> {
  return requestJson<ResourceTransferPayload>(
    `/dev/resources/resources/${resourceId}/transfers`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '发起过户失败',
  )
}

/** 我发起的过户（`GET /api/resources/transfers/mine`，含已处理的历史记录）。 */
export async function listMyResourceTransfers(
  token: string,
): Promise<ResourceTransferPayload[]> {
  return requestJson<ResourceTransferPayload[]>(
    '/dev/resources/transfers/mine',
    { headers: authHeader(token) },
    '加载我发起的过户失败',
  )
}

/** 待我同意的过户（`GET /api/resources/transfers/inbox`，仅 `pending`）。 */
export async function listMyResourceTransferInbox(
  token: string,
): Promise<ResourceTransferPayload[]> {
  return requestJson<ResourceTransferPayload[]>(
    '/dev/resources/transfers/inbox',
    { headers: authHeader(token) },
    '加载待我同意的过户失败',
  )
}

/** 接收方同意（`POST /api/resources/transfers/{id}/accept`）。 */
export async function acceptResourceTransfer(
  token: string,
  transferId: number,
): Promise<ResourceTransferPayload> {
  return requestJson<ResourceTransferPayload>(
    `/dev/resources/transfers/${transferId}/accept`,
    { method: 'POST', headers: authHeader(token) },
    '同意过户失败',
  )
}

/** 接收方拒绝（`POST /api/resources/transfers/{id}/reject`）。 */
export async function rejectResourceTransfer(
  token: string,
  transferId: number,
): Promise<ResourceTransferPayload> {
  return requestJson<ResourceTransferPayload>(
    `/dev/resources/transfers/${transferId}/reject`,
    { method: 'POST', headers: authHeader(token) },
    '拒绝过户失败',
  )
}

/** 发起方撤销（`POST /api/resources/transfers/{id}/cancel`）。 */
export async function cancelResourceTransfer(
  token: string,
  transferId: number,
): Promise<ResourceTransferPayload> {
  return requestJson<ResourceTransferPayload>(
    `/dev/resources/transfers/${transferId}/cancel`,
    { method: 'POST', headers: authHeader(token) },
    '撤销过户失败',
  )
}
