import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listOAuthAuthorizations, revokeOAuthAuthorization } from '@/api/oauthAuthorizations'

const mocks = vi.hoisted(() => ({
  requestJson: vi.fn(),
  requestVoid: vi.fn(),
  authHeaders: vi.fn(),
}))

vi.mock('@/api/http', () => ({
  requestJson: mocks.requestJson,
  requestVoid: mocks.requestVoid,
  authHeaders: mocks.authHeaders,
}))

describe('已授权应用接口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authHeaders.mockReturnValue({ Authorization: 'Bearer token' })
    mocks.requestJson.mockResolvedValue([])
    mocks.requestVoid.mockResolvedValue(undefined)
  })

  it('列表按当前账号读取', async () => {
    await listOAuthAuthorizations('token')
    expect(mocks.requestJson.mock.calls[0]?.[0]).toBe('/oauth/authorizations')
    expect(mocks.authHeaders).toHaveBeenCalledWith('token')
  })

  it('撤销时把开发者用户名编码进路径', async () => {
    await revokeOAuthAuthorization('token', 'dev name')
    expect(mocks.requestVoid.mock.calls[0]?.[0]).toBe('/oauth/authorizations/dev%20name')
    expect(mocks.requestVoid.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' })
  })
})
