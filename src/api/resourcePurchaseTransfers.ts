import type { components } from '@/api/generated/schema'
import { authHeaders, requestJson } from '@/api/http'

type Schemas = components['schemas']

export type PurchaseTransfer = Schemas['PurchaseTransferResponse']
export type CreatePurchaseTransferPayload = Schemas['CreatePurchaseTransferRequest']

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

export async function listIncomingPurchaseTransfers(token: string): Promise<PurchaseTransfer[]> {
  return requestJson<PurchaseTransfer[]>(
    '/dev/resources/purchase-transfers/incoming',
    { headers: authHeaders(token) },
    '加载待接收的使用权转移失败',
  )
}

export async function listOutgoingPurchaseTransfers(token: string): Promise<PurchaseTransfer[]> {
  return requestJson<PurchaseTransfer[]>(
    '/dev/resources/purchase-transfers/outgoing',
    { headers: authHeaders(token) },
    '加载我发起的使用权转移失败',
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
  return act(token, transferId, 'accept', '接受使用权转移失败')
}

export function rejectPurchaseTransfer(token: string, transferId: number) {
  return act(token, transferId, 'reject', '拒绝使用权转移失败')
}

export function cancelPurchaseTransfer(token: string, transferId: number) {
  return act(token, transferId, 'cancel', '撤销使用权转移失败')
}
