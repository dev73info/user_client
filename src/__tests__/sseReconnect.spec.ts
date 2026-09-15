import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { subscribeJsonEventStream } from '@/shared/api/sse'

/** 立即结束的事件流，用来模拟「连上后马上断开」。 */
const emptyStreamBody = {
  getReader: () => ({ read: async () => ({ done: true, value: undefined }) }),
}

describe('subscribeJsonEventStream 重连退避', () => {
  let attempts: number[]

  beforeEach(() => {
    vi.useFakeTimers()
    attempts = []
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('重连间隔逐次翻倍并封顶，连上后回到基础间隔', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        attempts.push(Date.now())
        // 前两次失败，第三次连上后立刻断开，之后继续失败
        if (attempts.length === 3) {
          return Promise.resolve({ ok: true, status: 200, body: emptyStreamBody })
        }
        return Promise.reject(new Error('后端不可用'))
      }),
    )

    const stop = subscribeJsonEventStream(
      'http://localhost/api/conversations/events',
      {},
      'conversation.updated',
      { onEvent: () => {}, onError: () => {} },
    )

    await vi.advanceTimersByTimeAsync(60_000)
    stop()

    // 基础 2s：2s → 4s →（连上后重置）2s → 4s → 8s → 封顶 15s，不再是固定 2s
    const gaps: number[] = []
    let previous: number | null = null
    for (const at of attempts) {
      if (previous !== null) {
        gaps.push(at - previous)
      }
      previous = at
    }
    expect(gaps).toEqual([2000, 4000, 2000, 4000, 8000, 15000, 15000])
  })
})
