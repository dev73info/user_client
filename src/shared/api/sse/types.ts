/** 事件流的消息、订阅者与共享流结构（`shared/api/sse` 的内部契约）。 */

export type SseMessage = {
  event: string
  data: string
}

export type JsonEventStreamCallbacks<T> = {
  onEvent: (payload: T) => void
  /** 连上（含重连）时触发；首次连上也会触发。 */
  onOpen?: () => void
  /**
   * 掉线后重新连上时触发，首次连上不触发。
   *
   * 事件流只推「连上之后」产生的数据，断线期间的内容不会补发，调用方收到这个回调
   * 应当自行补拉一次，否则界面会一直停在断线前那一刻。
   */
  onReconnect?: () => void
  onClose?: () => void
  onError?: (error: Error) => void
  reconnectDelayMs?: number
}

/** 内部订阅者：泛型回调收成 unknown 版本，便于同一条流 fan-out 给多个订阅者。 */
export type InternalCallbacks = {
  onEvent: (payload: unknown) => void
  onOpen?: () => void
  onReconnect?: () => void
  onClose?: () => void
  onError?: (error: Error) => void
}

export type Subscriber = {
  eventName: string
  callbacks: InternalCallbacks
  /** 当前是否处于「已连上」状态，保证 onClose 与 onOpen 成对出现 */
  opened: boolean
  /** 是否连上过，用来区分首次连上（调用方自己刚拉过数据）与掉线后重连（要补拉） */
  openedOnce: boolean
}

export type SharedStream = {
  url: string
  init: RequestInit
  baseReconnectDelayMs: number
  nextReconnectDelayMs: number
  subscribers: Set<Subscriber>
  /** 整条流已终止（被 401/403 拒绝，或所有订阅者都退订） */
  stopped: boolean
  /** 当前是否有活着的连接，用来给后加入的订阅者补发 onOpen */
  connected: boolean
  retryTimer: ReturnType<typeof setTimeout> | null
  controller: AbortController | null
}
