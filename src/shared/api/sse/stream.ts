import { broadcastError, clearRetryTimer, snapshotSubscribers } from './state'
import type { SharedStream } from './types'
import {
  consumeSseRecords,
  isAbortError,
  parseRetryAfterMs,
  readStreamError,
  toError,
} from './parse'
import type { SseMessage } from './types'
import { MAX_RECONNECT_DELAY_MS } from './parse'
import { dispatchAuthUnauthorized } from '@/shared/api/authEvents'

export function scheduleReconnect(stream: SharedStream, retryAfterMs: number | null) {
  if (stream.stopped || stream.subscribers.size === 0) {
    return
  }

  clearRetryTimer(stream)

  // 服务端要求的等待时间优先；它只抬高「这一次」的等待，后续仍按退避继续翻倍
  let delay = stream.nextReconnectDelayMs
  if (retryAfterMs !== null && retryAfterMs > delay) {
    delay = retryAfterMs
  }

  stream.retryTimer = setTimeout(() => {
    void connectStream(stream)
  }, delay)
  stream.nextReconnectDelayMs = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS)
}

export async function connectStream(stream: SharedStream) {
  if (stream.stopped || stream.subscribers.size === 0) {
    return
  }

  const controller = new AbortController()
  stream.controller = controller
  let retryAfterMs: number | null = null
  // 拿到 200 只说明响应头回来了，不代表这条流真能用。只有收到第一个事件记录
  // （服务端首帧就是 `event: connected`）才算连上，否则「连上即断」会让退避复位成固定间隔。
  let receivedEvent = false

  const handleRecord = (message: SseMessage) => {
    if (!receivedEvent) {
      receivedEvent = true
      stream.nextReconnectDelayMs = stream.baseReconnectDelayMs
    }

    for (const subscriber of snapshotSubscribers(stream)) {
      if (subscriber.eventName !== message.event) {
        continue
      }

      try {
        subscriber.callbacks.onEvent(JSON.parse(message.data) as unknown)
      } catch {
        subscriber.callbacks.onError?.(new Error('实时消息格式错误'))
      }
    }
  }

  try {
    const resp = await fetch(stream.url, {
      ...stream.init,
      credentials: 'omit',
      signal: controller.signal,
    })

    if (!resp.ok) {
      if (resp.status === 401) {
        dispatchAuthUnauthorized({
          status: resp.status,
          path: stream.url,
          message: '未登录或登录已过期，请重新登录',
        })
        stream.stopped = true
      } else if (resp.status === 403) {
        stream.stopped = true
      } else if (resp.status === 429 || resp.status === 503) {
        retryAfterMs = parseRetryAfterMs(resp)
      }
      throw new Error(await readStreamError(resp, '订阅会话失败'))
    }
    if (!resp.body) {
      throw new Error('订阅会话失败：接口未返回事件流')
    }

    stream.connected = true
    for (const subscriber of snapshotSubscribers(stream)) {
      if (subscriber.opened) {
        continue
      }
      const reconnected = subscriber.openedOnce
      subscriber.opened = true
      subscriber.openedOnce = true
      if (reconnected) {
        subscriber.callbacks.onReconnect?.()
      }
      subscriber.callbacks.onOpen?.()
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (!stream.stopped) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      buffer = consumeSseRecords(buffer, handleRecord)
    }

    buffer += decoder.decode()
    consumeSseRecords(`${buffer}\n\n`, handleRecord)
  } catch (error) {
    if (!stream.stopped && !isAbortError(error)) {
      broadcastError(stream, toError(error))
    }
  } finally {
    stream.controller = null
    stream.connected = false
    for (const subscriber of snapshotSubscribers(stream)) {
      if (!subscriber.opened) {
        continue
      }
      subscriber.opened = false
      subscriber.callbacks.onClose?.()
    }
    scheduleReconnect(stream, retryAfterMs)
  }
}
