import { authHeaders, requestJson } from '@/api/http'

import type {
  PointsTransfer,
  PointsTransferMeta,
  TransferPointsPayload,
  TransferPointsResponse,
} from './types'

export async function transferPoints(
  token: string,
  payload: TransferPointsPayload,
): Promise<TransferPointsResponse> {
  return requestJson<TransferPointsResponse>(
    '/points/transfer',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '打赏失败',
  )
}

export async function listMyTransfers(token: string, limit = 50): Promise<PointsTransfer[]> {
  return requestJson<PointsTransfer[]>(
    `/points/transfers?limit=${limit}`,
    { headers: authHeaders(token) },
    '加载打赏记录失败',
  )
}

export async function getTransferMeta(token: string): Promise<PointsTransferMeta> {
  return requestJson<PointsTransferMeta>(
    '/points/transfer/meta',
    { headers: authHeaders(token) },
    '加载打赏规则失败',
  )
}
