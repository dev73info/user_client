import { MOCK_IDENTITY_PROFILES, type MockIdentity } from '../../identity'
import { createMockToken } from '../../token'

export type MockAuthPayload = {
  token: string
  refresh_token: string
  access_token_expires_in: number
  refresh_token_expires_in: number
  username: string
  role: string
  roles: string[]
}

const MOCK_ACCESS_TTL_SECONDS = 12 * 60 * 60
const MOCK_REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60

/** 登录 / 刷新响应：访问令牌、刷新令牌与各自有效期，形状与后端 AuthResponse 一致。 */
export function mockAuthPayload(identity: MockIdentity): MockAuthPayload {
  const profile = MOCK_IDENTITY_PROFILES[identity]

  return {
    token: createMockToken(identity),
    refresh_token: createMockToken(identity),
    access_token_expires_in: MOCK_ACCESS_TTL_SECONDS,
    refresh_token_expires_in: MOCK_REFRESH_TTL_SECONDS,
    username: profile.username,
    role: profile.role,
    roles: [profile.role],
  }
}
