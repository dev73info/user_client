import { authHeaders, requestJson } from '@/api/http'

import type { UserPerk, UserPointsQuery, UserPointsSelf, UsernameGradientStatus } from './types'

export async function getMyPoints(
  token: string,
  query: UserPointsQuery = {},
): Promise<UserPointsSelf> {
  const params = new URLSearchParams()
  if (query.page != null) params.set('page', String(query.page))
  if (query.page_size != null) params.set('page_size', String(query.page_size))
  const suffix = params.toString() ? `?${params.toString()}` : ''

  return requestJson<UserPointsSelf>(
    `/points/me${suffix}`,
    { headers: authHeaders(token) },
    '加载积分失败',
  )
}

export async function setUsernameGradient(
  token: string,
  equipped: boolean,
): Promise<UsernameGradientStatus> {
  return requestJson<UsernameGradientStatus>(
    '/points/mall/gradient',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ equipped }),
    },
    '更新渐变展示状态失败',
  )
}

export async function setUsernameAppearance(
  token: string,
  appearance: 'gradient' | 'color',
  color?: string,
): Promise<UsernameGradientStatus> {
  return requestJson<UsernameGradientStatus>(
    '/points/appearance/username',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ appearance, color: color || null }),
    },
    '设置用户名展示样式失败',
  )
}

export async function setPerkEquipped(
  token: string,
  perkCode: string,
  equipped: boolean,
): Promise<UserPerk> {
  return requestJson<UserPerk>(
    `/points/perks/${encodeURIComponent(perkCode)}`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ equipped }),
    },
    '更新权益佩戴状态失败',
  )
}
