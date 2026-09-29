/**
 * mock 登录令牌。
 *
 * 之所以要造一个「像 JWT」的串而不是随便一个字符串：`src/shared/auth/token.ts`
 * 会解出 payload 里的 `exp` 来安排刷新时机，格式不对就会退化成兜底值。
 * 这里签名段写死 `mock`，一眼能认出是假的；`exp` 给 12 小时，刷新定时器不会频繁触发。
 */

import type { MockIdentity } from './identity'
import { MOCK_IDENTITY_PROFILES } from './identity'

const MOCK_TOKEN_TTL_SECONDS = 12 * 60 * 60

export type MockTokenSubject = {
  identity: MockIdentity
  username: string
  role: string
  expMs: number
}

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return atob(padded)
}

export function createMockToken(identity: MockIdentity): string {
  const profile = MOCK_IDENTITY_PROFILES[identity]
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: profile.username,
      role: profile.role,
      identity,
      iss: '73info-mock',
      exp: Math.floor(Date.now() / 1000) + MOCK_TOKEN_TTL_SECONDS,
    }),
  )

  return `${header}.${payload}.mock`
}

/** 解析 mock 令牌；真实后端签发的令牌（或垃圾串）一律返回 null。 */
export function parseMockToken(token: string): MockTokenSubject | null {
  const segments = token.split('.')
  if (segments.length !== 3 || segments[2] !== 'mock') {
    return null
  }

  try {
    const payload = JSON.parse(base64UrlDecode(segments[1] ?? '')) as {
      sub?: unknown
      role?: unknown
      identity?: unknown
      exp?: unknown
    }

    if (payload.identity !== 'client' && payload.identity !== 'dev') {
      return null
    }

    return {
      identity: payload.identity,
      username: typeof payload.sub === 'string' ? payload.sub : '',
      role: typeof payload.role === 'string' ? payload.role : '',
      expMs: typeof payload.exp === 'number' ? payload.exp * 1000 : Number.NaN,
    }
  } catch {
    return null
  }
}
