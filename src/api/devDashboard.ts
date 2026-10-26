import { authHeaders, requestJson } from '@/api/http'
import type { components } from '@/api/generated/schema'

type Schemas = components['schemas']

export type DevDashboardSnapshot = Schemas['DevDashboardSnapshotResponse']
export type DevDashboardSocketMessage =
  | { type: 'snapshot'; data: DevDashboardSnapshot }
  | { type: 'ping'; at: string }
  | { type: 'error'; message: string }

export async function getDevDashboard(token: string): Promise<DevDashboardSnapshot> {
  return requestJson<DevDashboardSnapshot>(
    '/requirement/dev/dashboard',
    { headers: authHeaders(token) },
    '加载实时看板失败',
  )
}

export function devDashboardWsUrl(token: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/api/requirement/dev/dashboard/ws?token=${encodeURIComponent(token)}`
}
