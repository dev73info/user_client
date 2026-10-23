import type { SharedStream, Subscriber } from './types'

export const sharedStreams = new Map<string, SharedStream>()

export function clearRetryTimer(stream: SharedStream) {
  if (stream.retryTimer !== null) {
    clearTimeout(stream.retryTimer)
    stream.retryTimer = null
  }
}

/**
 * 取一份订阅者快照再派发。
 *
 * 回调里可能退订（例如界面卸载时立刻 stop），直接把正在迭代的 Set 改掉会漏发或错发，
 * 所以这里有意复制一份；不要为了省一次分配改回直接迭代。
 */
export function snapshotSubscribers(stream: SharedStream): Subscriber[] {
  return Array.from(stream.subscribers)
}

/** 派发错误给所有订阅者：一条流出问题，几个订阅者都要知道。 */
export function broadcastError(stream: SharedStream, error: Error) {
  for (const subscriber of snapshotSubscribers(stream)) {
    subscriber.callbacks.onError?.(error)
  }
}

export function createStream(
  url: string,
  init: RequestInit,
  reconnectDelayMs: number,
): SharedStream {
  return {
    url,
    init,
    baseReconnectDelayMs: reconnectDelayMs,
    nextReconnectDelayMs: reconnectDelayMs,
    subscribers: new Set(),
    stopped: false,
    connected: false,
    retryTimer: null,
    controller: null,
  }
}

export function disposeStream(stream: SharedStream) {
  stream.stopped = true
  clearRetryTimer(stream)
  const controller = stream.controller
  stream.controller = null
  stream.connected = false
  // 先摘掉订阅者再中断：中断会让 connectStream 走到 finally，那里不该再回调已退订的人
  stream.subscribers.clear()
  controller?.abort()
}
