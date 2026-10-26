import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getWechatBindQrStatus, getWechatBindQrUrl } from '@/api/auth/wechat'

const mocks = vi.hoisted(() => ({
  requestJson: vi.fn(),
  authHeaders: vi.fn(),
}))

vi.mock('@/api/http', () => ({
  requestJson: mocks.requestJson,
  authHeaders: mocks.authHeaders,
}))

describe('微信绑定接口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authHeaders.mockReturnValue({ Authorization: 'Bearer test-token' })
    mocks.requestJson.mockResolvedValue({})
  })

  it('建码同时返回轮询凭据', async () => {
    await getWechatBindQrUrl('test-token', 'https://73info.cn/account?settle=1')

    const [path, init] = mocks.requestJson.mock.calls[0] ?? []
    expect(path).toBe(
      '/auth/wechat/bind/qr/url?redirect_to=https%3A%2F%2F73info.cn%2Faccount%3Fsettle%3D1',
    )
    expect(init.headers).toEqual({ Authorization: 'Bearer test-token' })
  })

  it('轮询必须携带 state 与 poll_secret', async () => {
    await getWechatBindQrStatus('state-1', 'poll-secret')

    expect(mocks.requestJson.mock.calls[0]?.[0]).toBe(
      '/auth/wechat/bind/qr/status?state=state-1&poll_secret=poll-secret',
    )
  })
})
