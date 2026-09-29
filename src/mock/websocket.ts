/**
 * mock 模式下的 WebSocket 替身。
 *
 * 在线客服走 `ws://<host>/api/support/conversations/ws?token=…` 长连接。
 * WebSocket 不像 fetch 那样能被 fetch 拦截层覆盖，真连会连不上并反复重试，
 * 在控制台刷成片的红色报错。这里把「指到后端接口」的 ws 连接换成一个空壳：
 * 直接进入已连接状态但不收发任何消息，于是客服面板安静地停在未连接，
 * 页面其他部分不受影响。
 *
 * 只拦 `/api/` 下的 ws。Vite 自己的 HMR 连接（`ws://localhost:5173/?token=…`，路径是 `/`）
 * 必须原样放行，否则热更新会失效。
 */

type WebSocketListener = (event: Event) => void

const CONNECTING = 0
const OPEN = 1
const CLOSING = 2
const CLOSED = 3

class MockWebSocket {
  static readonly CONNECTING = CONNECTING
  static readonly OPEN = OPEN
  static readonly CLOSING = CLOSING
  static readonly CLOSED = CLOSED

  readonly CONNECTING = CONNECTING
  readonly OPEN = OPEN
  readonly CLOSING = CLOSING
  readonly CLOSED = CLOSED

  readonly url: string
  readonly protocol = ''
  readonly extensions = ''
  readonly bufferedAmount = 0
  readonly binaryType: BinaryType = 'blob'

  readyState = OPEN

  onopen: WebSocketListener | null = null
  onmessage: WebSocketListener | null = null
  onclose: WebSocketListener | null = null
  onerror: WebSocketListener | null = null

  private readonly listeners = new Map<string, Set<WebSocketListener>>()
  private closed = false

  constructor(url: string) {
    this.url = url

    // 异步补一次 open：调用方通常在构造之后才挂 onopen / addEventListener，
    // 同步派发会全部错过，页面就会一直停在「连接中」。
    setTimeout(() => {
      this.emit('open')
    }, 0)
  }

  addEventListener(type: string, listener: WebSocketListener | null): void {
    if (!listener) {
      return
    }

    const bucket = this.listeners.get(type) ?? new Set<WebSocketListener>()
    bucket.add(listener)
    this.listeners.set(type, bucket)
  }

  removeEventListener(type: string, listener: WebSocketListener | null): void {
    if (!listener) {
      return
    }

    this.listeners.get(type)?.delete(listener)
  }

  dispatchEvent(event: Event): boolean {
    this.emit(event.type)
    return true
  }

  /** mock 不真的发消息：客服面板发出去的内容不会有人回。 */
  send(_data?: unknown): void {
    void _data
  }

  close(): void {
    if (this.closed) {
      return
    }

    this.closed = true
    this.readyState = CLOSED
    this.emit('close')
  }

  private emit(type: string): void {
    const event = new Event(type)

    const inline =
      type === 'open'
        ? this.onopen
        : type === 'message'
          ? this.onmessage
          : type === 'close'
            ? this.onclose
            : type === 'error'
              ? this.onerror
              : null

    inline?.(event)

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

function isMockableSocketUrl(raw: string): boolean {
  try {
    const url = new URL(raw, typeof window === 'undefined' ? undefined : window.location.href)
    return url.pathname === '/api' || url.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

type RuntimeWithSocket = typeof globalThis & {
  WebSocket: typeof WebSocket
  __mockWebSocketInstalled__?: boolean
}

export function installMockWebSocket(): void {
  const runtime = globalThis as RuntimeWithSocket

  if (runtime.__mockWebSocketInstalled__ || typeof runtime.WebSocket !== 'function') {
    return
  }

  const RealWebSocket = runtime.WebSocket

  function MockWebSocketFactory(
    this: unknown,
    url: string | URL,
    protocols?: string | string[],
  ): WebSocket {
    const target = String(url)

    if (isMockableSocketUrl(target)) {
      return new MockWebSocket(target) as unknown as WebSocket
    }

    return new RealWebSocket(url, protocols)
  }

  Object.assign(MockWebSocketFactory, {
    CONNECTING,
    OPEN,
    CLOSING,
    CLOSED,
    prototype: RealWebSocket.prototype,
  })

  runtime.WebSocket = MockWebSocketFactory as unknown as typeof WebSocket
  runtime.__mockWebSocketInstalled__ = true
}
