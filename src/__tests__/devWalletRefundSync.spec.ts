import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { syncInflightRefunds } from '@/api/devWallet'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_BASE_URL', '')
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('在途退款主动同步', () => {
  it('调用 /api/payment/refunds/sync 并回传同步结果', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          checked: 2,
          settled: 1,
          still_pending: 1,
          errors: [{ refund_no: 'RFD-1', detail: '渠道未就绪' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const outcome = await syncInflightRefunds('test-token')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/payment/refunds/sync')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token')
    expect(outcome.checked).toBe(2)
    expect(outcome.settled).toBe(1)
    expect(outcome.still_pending).toBe(1)
    expect(outcome.errors).toHaveLength(1)
  })
})
