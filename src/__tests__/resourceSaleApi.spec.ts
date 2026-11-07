import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getResourceSaleFee } from '@/api/resourceSale'

const fetchMock = vi.fn()

function lastCall() {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] ?? []
  return { url: String(url), init: init as RequestInit }
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ platform_fee_bps: 1000 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('资源售卖抽成 API', () => {
  it('走 /api/resource/sale/fee，带 Bearer 令牌，响应映射出 platform_fee_bps', async () => {
    const fee = await getResourceSaleFee('token')

    const { url, init } = lastCall()
    expect(url).toContain('/api/resource/sale/fee')
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer token')
    expect(fee).toEqual({ platform_fee_bps: 1000 })
  })
})
