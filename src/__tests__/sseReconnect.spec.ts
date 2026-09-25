import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { subscribeJsonEventStream } from '@/shared/api/sse'

const sseUrl = 'http://localhost/api/conversations/events'

/** 立即结束的事件流，用来模拟「连上后马上断开」。 */
const emptyStreamBody = {
  getReader: () => ({ read: async () => ({ done: true, value: undefined }) }),
}

/** 先吐一段事件再结束的事件流，用来模拟「连上、收到首帧、然后断开」。 */
function streamBodyWithEvent(text: string) {
  const encoder = new TextEncoder()
  let step = 0

  return {
    getReader: () => ({
      read: () => {
        if (step === 0) {
          step = 1
          return Promise.resolve({ done: false, value: encoder.encode(text) })
        }
        return Promise.resolve({ done: true, value: undefined })
      },
    }),
  }
}

/** 吐一段事件后一直挂着的流，用来模拟一条稳定在线的连接。 */
function openStreamBody(text: string) {
  const encoder = new TextEncoder()
  let sent = false

  return {
    getReader: () => ({
      read: () => {
        if (!sent) {
          sent = true
          return Promise.resolve({ done: false, value: encoder.encode(text) })
        }
        return new Promise<{ done: boolean; value: undefined }>(() => {})
      },
    }),
  }
}

/** 只有 `get` 的响应头，够用且不依赖运行环境是否提供 fetch 的 Headers。 */
function retryAfterHeaders(seconds: string) {
  return {
    get: (name: string) => (name.toLowerCase() === 'retry-after' ? seconds : null),
  }
}

function gapOf(timestamps: number[]): number[] {
  const gaps: number[] = []
  let previous: number | null = null
  for (const at of timestamps) {
    if (previous !== null) {
      gaps.push(at - previous)
    }
    previous = at
  }
  return gaps
}

/** 推进若干轮微任务，让 fetch / body 的异步链路走完（不触发重连定时器）。 */
async function settle() {
  for (let round = 0; round < 8; round += 1) {
    await Promise.resolve()
  }
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

  it('重连间隔逐次翻倍并封顶，只拿到 200 不算连上', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        attempts.push(Date.now())
        // 前两次失败，第三次响应 200 但流里一个事件都没有，之后继续失败
        if (attempts.length === 3) {
          return Promise.resolve({ ok: true, status: 200, body: emptyStreamBody })
        }
        return Promise.reject(new Error('后端不可用'))
      }),
    )

    const stop = subscribeJsonEventStream(sseUrl, {}, 'conversation.updated', {
      onEvent: () => {},
      onError: () => {},
    })

    await vi.advanceTimersByTimeAsync(60_000)
    stop()

    // 基础 2s：2s → 4s → 8s → 封顶 15s。没有收到事件就不能把退避复位，
    // 否则「连上就断」会退化成固定 2s 的硬重连。
    expect(gapOf(attempts)).toEqual([2000, 4000, 8000, 15000, 15000, 15000])
  })

  it('收到事件后断开，退避回落到基础间隔', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        attempts.push(Date.now())
        if (attempts.length <= 2) {
          return Promise.reject(new Error('后端不可用'))
        }
        // 服务端首帧就是 `event: connected`，收到它才算真的连上
        return Promise.resolve({
          ok: true,
          status: 200,
          body: streamBodyWithEvent('event: connected\ndata: {}\n\n'),
        })
      }),
    )

    const stop = subscribeJsonEventStream(sseUrl, {}, 'conversation.updated', {
      onEvent: () => {},
      onError: () => {},
    })

    await vi.advanceTimersByTimeAsync(10_000)
    stop()

    // 2s → 4s 之后连上并收到首帧，退避复位：之后每次都回到 2s
    expect(gapOf(attempts).slice(0, 4)).toEqual([2000, 4000, 2000, 2000])
  })

  it('429 时尊重 Retry-After，不按自己的节奏硬打', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        attempts.push(Date.now())
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: retryAfterHeaders('7'),
          text: async () => '请求过于频繁，请稍后再试',
        })
      }),
    )

    const stop = subscribeJsonEventStream(sseUrl, {}, 'conversation.updated', {
      onEvent: () => {},
      onError: () => {},
    })

    await vi.advanceTimersByTimeAsync(30_000)
    stop()

    // 服务端要求 7s 后重试：首次重连就是 7s（而不是自己的 2s），之后仍按退避继续放大
    expect(gapOf(attempts)).toEqual([7000, 14000])
  })

  it('掉线后重新连上触发 onReconnect，首次连上不触发', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, status: 200, body: emptyStreamBody })),
    )

    const onOpen = vi.fn()
    const onReconnect = vi.fn()

    const stop = subscribeJsonEventStream(sseUrl, {}, 'conversation.updated', {
      onEvent: () => {},
      onOpen,
      onReconnect,
    })

    await vi.advanceTimersByTimeAsync(10_000)
    stop()

    // 每次连上都会 onOpen（连上后流立刻结束 → 重连），但只有第二次及以后才算「重连」
    expect(onOpen.mock.calls.length).toBeGreaterThan(1)
    expect(onReconnect).toHaveBeenCalledTimes(onOpen.mock.calls.length - 1)
  })
})

describe('subscribeJsonEventStream 连接复用', () => {
  const sharedInit = { headers: { Authorization: 'Bearer token-a' } }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('同一 url 与令牌的多个订阅者共用一条连接，事件各自派发', async () => {
    const body = openStreamBody(
      'event: connected\ndata: {}\n\nevent: conversation.updated\ndata: {"conversation":"c1"}\n\n',
    )
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, body }))
    vi.stubGlobal('fetch', fetchMock)

    const first = vi.fn()
    const second = vi.fn()

    const stopFirst = subscribeJsonEventStream(sseUrl, sharedInit, 'conversation.updated', {
      onEvent: first,
    })
    const stopSecond = subscribeJsonEventStream(sseUrl, sharedInit, 'conversation.updated', {
      onEvent: second,
    })

    await settle()

    // 消息页与会话弹窗订阅同一个地址时只建一条连接，否则建连配额会被自己人打满
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // 同一个流的载荷要 fan-out 给所有订阅者，`connected` 首帧不算业务事件
    expect(first).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledWith({ conversation: 'c1' })
    expect(second).toHaveBeenCalledWith({ conversation: 'c1' })

    // 退订其中一个不动连接，剩下的订阅者还在用同一条流
    stopFirst()
    const stopThird = subscribeJsonEventStream(sseUrl, sharedInit, 'conversation.updated', {
      onEvent: () => {},
    })
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // 最后一个订阅者退订后连接才断开，再订阅就要重新建连
    stopSecond()
    stopThird()
    const stopAgain = subscribeJsonEventStream(sseUrl, sharedInit, 'conversation.updated', {
      onEvent: () => {},
    })
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    stopAgain()
  })

  it('令牌不同则各自建连', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, body: openStreamBody('event: connected\ndata: {}\n\n') }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const stopFirst = subscribeJsonEventStream(sseUrl, sharedInit, 'conversation.updated', {
      onEvent: () => {},
    })
    const stopOther = subscribeJsonEventStream(
      sseUrl,
      { headers: { Authorization: 'Bearer token-b' } },
      'conversation.updated',
      { onEvent: () => {} },
    )

    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    stopFirst()
    stopOther()
  })
})
