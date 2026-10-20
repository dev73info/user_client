import { authHeaders, requestJson } from '@/api/http'

/** R042 使用权转移申请状态。`pending` 是唯一可处理的状态。 */
export type PurchaseTransferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled'

/** 一条接口资源使用权转移申请（待我确认 / 我发起的同形状）。 */
export type PurchaseTransfer = {
  transfer_id: number
  order_no: string
  resource_id: number
  resource_title: string | null
  from_username: string
  to_username: string
  status: PurchaseTransferStatus
  message: string | null
  initiated_at: string
  responded_at: string | null
  responded_by: string | null
  cancelled_at: string | null
}

export type CreatePurchaseTransferPayload = {
  to_username: string
  message?: string
}

/** POST /api/resources/purchases/{order_no}/transfer —— 当前买家发起转移。 */
export async function initiatePurchaseTransfer(
  token: string,
  orderNo: string,
  payload: CreatePurchaseTransferPayload,
): Promise<PurchaseTransfer> {
  return requestJson<PurchaseTransfer>(
    `/dev/resources/purchases/${encodeURIComponent(orderNo)}/transfer`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '发起使用权转移失败',
  )
}

/** GET /api/resources/purchase-transfers/incoming —— 待我确认。 */
export async function listIncomingPurchaseTransfers(token: string): Promise<PurchaseTransfer[]> {
  return requestJson<PurchaseTransfer[]>(
    '/dev/resources/purchase-transfers/incoming',
    { method: 'GET', headers: authHeaders(token) },
    '加载待确认的转移申请失败',
  )
}

/** GET /api/resources/purchase-transfers/outgoing —— 我发起的。 */
export async function listOutgoingPurchaseTransfers(token: string): Promise<PurchaseTransfer[]> {
  return requestJson<PurchaseTransfer[]>(
    '/dev/resources/purchase-transfers/outgoing',
    { method: 'GET', headers: authHeaders(token) },
    '加载我发起的转移申请失败',
  )
}

async function act(
  token: string,
  transferId: number,
  action: 'accept' | 'reject' | 'cancel',
  fallback: string,
): Promise<PurchaseTransfer> {
  return requestJson<PurchaseTransfer>(
    `/dev/resources/purchase-transfers/${transferId}/${action}`,
    { method: 'POST', headers: authHeaders(token) },
    fallback,
  )
}

export function acceptPurchaseTransfer(token: string, transferId: number) {
  return act(token, transferId, 'accept', '接受转移失败')
}

export function rejectPurchaseTransfer(token: string, transferId: number) {
  return act(token, transferId, 'reject', '拒绝转移失败')
}

export function cancelPurchaseTransfer(token: string, transferId: number) {
  return act(token, transferId, 'cancel', '撤销转移失败')
}
