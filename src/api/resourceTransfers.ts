import type { components } from '@/api/generated/schema'
import { authHeaders, requestJson } from '@/api/http'

type Schemas = components['schemas']

export type ResourceTransfer = Schemas['ResourceTransferResponse']
export type CreateResourceTransferPayload = Schemas['CreateTransferRequest']

export async function createResourceTransfer(
  token: string,
  resourceId: number,
  payload: CreateResourceTransferPayload,
): Promise<ResourceTransfer> {
  return requestJson<ResourceTransfer>(
    `/dev/resources/resources/${resourceId}/transfers`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '发起资源过户失败',
  )
}

export async function listMyResourceTransfers(token: string): Promise<ResourceTransfer[]> {
  return requestJson<ResourceTransfer[]>(
    '/dev/resources/transfers/mine',
    { headers: authHeaders(token) },
    '加载我发起的资源过户失败',
  )
}

export async function listMyResourceTransferInbox(token: string): Promise<ResourceTransfer[]> {
  return requestJson<ResourceTransfer[]>(
    '/dev/resources/transfers/inbox',
    { headers: authHeaders(token) },
    '加载待接收的资源过户失败',
  )
}

async function act(
  token: string,
  transferId: number,
  action: 'accept' | 'reject' | 'cancel',
  fallback: string,
): Promise<ResourceTransfer> {
  return requestJson<ResourceTransfer>(
    `/dev/resources/transfers/${transferId}/${action}`,
    { method: 'POST', headers: authHeaders(token) },
    fallback,
  )
}

export function acceptResourceTransfer(token: string, transferId: number) {
  return act(token, transferId, 'accept', '接受资源过户失败')
}

export function rejectResourceTransfer(token: string, transferId: number) {
  return act(token, transferId, 'reject', '拒绝资源过户失败')
}

export function cancelResourceTransfer(token: string, transferId: number) {
  return act(token, transferId, 'cancel', '撤销资源过户失败')
}
