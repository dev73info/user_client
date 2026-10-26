import { beforeEach, describe, expect, it, vi } from 'vitest'

import { devDashboardWsUrl, getDevDashboard } from '@/api/devDashboard'

const mocks = vi.hoisted(() => ({ requestJson: vi.fn(), authHeaders: vi.fn() }))

vi.mock('@/api/http', () => ({
  requestJson: mocks.requestJson,
  authHeaders: mocks.authHeaders,
}))

describe('开发者看板接口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authHeaders.mockReturnValue({ Authorization: 'Bearer token' })
    mocks.requestJson.mockResolvedValue({})
  })

  it('读取本人看板快照', async () => {
    await getDevDashboard('token')
    expect(mocks.requestJson.mock.calls[0]?.[0]).toBe('/requirement/dev/dashboard')
  })

  it('WebSocket 地址带登录令牌并做 URL 编码', () => {
    expect(devDashboardWsUrl('a b')).toBe(
      'ws://localhost:3000/api/requirement/dev/dashboard/ws?token=a%20b',
    )
  })
})
