import { dispatchAuthUnauthorized } from '@/shared/api/authEvents'

type SseMessage = {
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

function parseSseRecord(record: string): SseMessage | null {
  const dataLines: string[] = []
  let event = 'message'

  for (const line of record.split('\n')) {
    if (!line || line.startsWith(':')) {
      continue
    }

    const separatorIndex = line.indexOf(':')
    const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line
    const value = separatorIndex >= 0 ? line.slice(separatorIndex + 1).replace(/^ /, '') : ''

    if (field === 'event') {
      event = value
    } else if (field === 'data') {
      dataLines.push(value)
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return {
    event,
    data: dataLines.join('\n'),
  }
}

function consumeSseRecords(buffer: string, onMessage: (message: SseMessage) => void): string {
  let nextBuffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  let boundaryIndex = nextBuffer.indexOf('\n\n')

  while (boundaryIndex >= 0) {
    const record = nextBuffer.slice(0, boundaryIndex)
    nextBuffer = nextBuffer.slice(boundaryIndex + 2)
    const message = parseSseRecord(record)

    if (message) {
      onMessage(message)
    }

    boundaryIndex = nextBuffer.indexOf('\n\n')
  }

  return nextBuffer
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('实时连接异常')
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/** 重连退避基础间隔。 */
const DEFAULT_RECONNECT_DELAY_MS = 2000
/** 重连退避上限：后端长时间不可用时不再按固定间隔反复请求。 */
const MAX_RECONNECT_DELAY_MS = 15_000
/** Retry-After 上限，防止异常响应头把重连推到遥遥无期。 */
const MAX_RETRY_AFTER_MS = 300_000

async function readStreamError(resp: Response, fallbackError: string): Promise<string> {
  try {
    const text = await resp.text()
    return text ? `${fallbackError}：${text}` : fallbackError
  } catch {
    return fallbackError
  }
}

/**
 * 解析重连等待时长：`Retry-After` 允许「秒数」与「HTTP 日期」两种写法。
 *
 * 429 / 503 说明服务端已经有自己的节奏，客户端按固定退避硬打只会把限流桶填得更满，
 * 所以这两种响应要优先听服务端的。
 */
function parseRetryAfterMs(resp: Response): number | null {
  const raw = resp.headers?.get?.('retry-after')
  if (!raw) {
    return null
  }

  const value = raw.trim()
  if (/^\d+$/.test(value)) {
    return Math.min(Number(value) * 1000, MAX_RETRY_AFTER_MS)
  }

  const deadline = Date.parse(value)
  if (Number.isNaN(deadline)) {
    return null
  }

  return Math.min(Math.max(deadline - Date.now(), 0), MAX_RETRY_AFTER_MS)
}

/** 从请求头里取一个字段（大小写不敏感），兼容 Headers / 数组 / 普通对象三种写法。 */
function readHeader(headers: RequestInit['headers'], name: string): string {
  if (!headers) {
    return ''
  }

  if (headers instanceof Headers) {
    return headers.get(name) ?? ''
  }

  if (Array.isArray(headers)) {
    const hit = headers.find((entry) => String(entry[0]).toLowerCase() === name.toLowerCase())
    return hit ? String(hit[1]) : ''
  }

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) {
      return String(value)
    }
  }

  return ''
}

/**
 * 令牌指纹：仅用作本模块内的流复用键，既不上网也不进日志，
 * 所以用同步的 64 位 FNV-1a（两段独立 32 位）就够了，不需要异步的 crypto.subtle。
 */
function tokenFingerprint(token: string): string {
  let first = 0x811c9dc5
  let second = 0xcbf29ce4

  for (let index = 0; index < token.length; index += 1) {
    const code = token.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193) >>> 0
    second = Math.imul(second ^ (code + index), 0x01000193) >>> 0
  }

  const high = first.toString(16).padStart(8, '0')
  const low = second.toString(16).padStart(8, '0')
  return `${high}${low}:${token.length}`
}

/**
 * 连接复用键：同一个 url + 同一个令牌只保留一条事件流。
 *
 * 消息页与会话弹窗会对同一个 `/conversations/events` 各订阅一次，页面里就是两条连接，
 * 而建连本身有独立配额（每个用户 12 次/分）；不合并的话反复进出会话很快就会被拒绝。
 */
function streamIdentity(url: string, init: RequestInit): string {
  const authorization = readHeader(init.headers, 'authorization')
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  return token ? `${url}::${tokenFingerprint(token)}` : url
}

/** 内部订阅者：泛型回调收成 unknown 版本，便于同一条流 fan-out 给多个订阅者。 */
type InternalCallbacks = {
  onEvent: (payload: unknown) => void
  onOpen?: () => void
  onReconnect?: () => void
  onClose?: () => void
  onError?: (error: Error) => void
}

type Subscriber = {
  eventName: string
  callbacks: InternalCallbacks
  /** 当前是否处于「已连上」状态，保证 onClose 与 onOpen 成对出现 */
  opened: boolean
  /** 是否连上过，用来区分首次连上（调用方自己刚拉过数据）与掉线后重连（要补拉） */
  openedOnce: boolean
}

type SharedStream = {
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

const sharedStreams = new Map<string, SharedStream>()

function clearRetryTimer(stream: SharedStream) {
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
function snapshotSubscribers(stream: SharedStream): Subscriber[] {
  return Array.from(stream.subscribers)
}

/** 派发错误给所有订阅者：一条流出问题，几个订阅者都要知道。 */
function broadcastError(stream: SharedStream, error: Error) {
  for (const subscriber of snapshotSubscribers(stream)) {
    subscriber.callbacks.onError?.(error)
  }
}

function scheduleReconnect(stream: SharedStream, retryAfterMs: number | null) {
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

async function connectStream(stream: SharedStream) {
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

function createStream(url: string, init: RequestInit, reconnectDelayMs: number): SharedStream {
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

function disposeStream(stream: SharedStream) {
  stream.stopped = true
  clearRetryTimer(stream)
  const controller = stream.controller
  stream.controller = null
  stream.connected = false
  // 先摘掉订阅者再中断：中断会让 connectStream 走到 finally，那里不该再回调已退订的人
  stream.subscribers.clear()
  controller?.abort()
}

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
