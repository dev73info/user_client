import { streamIdentity } from './sse/identity'
import { DEFAULT_RECONNECT_DELAY_MS } from './sse/parse'
import { connectStream } from './sse/stream'
import { createStream, disposeStream, sharedStreams } from './sse/state'
import type { JsonEventStreamCallbacks, Subscriber } from './sse/types'

export type { JsonEventStreamCallbacks } from './sse/types'

export function subscribeJsonEventStream<T>(
  url: string,
  init: RequestInit,
  eventName: string,
  callbacks: JsonEventStreamCallbacks<T>,
): () => void {
  const key = streamIdentity(url, init)
  const reconnectDelayMs = callbacks.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS

  let stream = sharedStreams.get(key)
  let needsConnect = false

  if (stream?.stopped) {
    // 被 401/403 拒绝过的流不会再重连，复用它是拿不到数据的；重建一条并把订阅者接过去
    const revived = createStream(url, init, reconnectDelayMs)
    for (const existing of stream.subscribers) {
      revived.subscribers.add(existing)
    }
    sharedStreams.set(key, revived)
    stream = revived
    needsConnect = true
  } else if (!stream) {
    stream = createStream(url, init, reconnectDelayMs)
    sharedStreams.set(key, stream)
    needsConnect = true
  }

  const subscriber: Subscriber = {
    eventName,
    callbacks: {
      onEvent: (payload) => {
        callbacks.onEvent(payload as T)
      },
      onOpen: callbacks.onOpen,
      onReconnect: callbacks.onReconnect,
      onClose: callbacks.onClose,
      onError: callbacks.onError,
    },
    opened: false,
    openedOnce: false,
  }
  stream.subscribers.add(subscriber)

  if (stream.connected) {
    // 连接是复用的：把「已连上」补给新订阅者，否则它的界面会一直停在「连接中」。
    // 这里不是掉线重连，所以只发 onOpen，不发 onReconnect（它自己刚拉过数据）。
    subscriber.opened = true
    subscriber.openedOnce = true
    queueMicrotask(() => {
      if (!stream.stopped && subscriber.opened) {
        subscriber.callbacks.onOpen?.()
      }
    })
  }

  // 订阅者先入列再建连：connectStream 开头会检查「没有订阅者就直接退出」，
  // 反过来的话首次连接会被自己掐掉。
  if (needsConnect) {
    void connectStream(stream)
  }

  return () => {
    stream.subscribers.delete(subscriber)
    if (stream.subscribers.size === 0) {
      disposeStream(stream)
      if (sharedStreams.get(key) === stream) {
        sharedStreams.delete(key)
      }
    }
  }
}
