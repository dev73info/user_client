type SseMessage = {
  event: string
  data: string
}

export type JsonEventStreamCallbacks<T> = {
  onEvent: (payload: T) => void
  onOpen?: () => void
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

async function readStreamError(resp: Response, fallbackError: string): Promise<string> {
  try {
    const text = await resp.text()
    return text ? `${fallbackError}：${text}` : fallbackError
  } catch {
    return fallbackError
  }
}

export function subscribeJsonEventStream<T>(
  url: string,
  init: RequestInit,
  eventName: string,
  callbacks: JsonEventStreamCallbacks<T>,
): () => void {
  const reconnectDelayMs = callbacks.reconnectDelayMs ?? 2000
  let stopped = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let controller: AbortController | null = null

  function clearRetryTimer() {
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  function scheduleReconnect() {
    if (stopped) {
      return
    }

    clearRetryTimer()
    retryTimer = setTimeout(() => {
      void connect()
    }, reconnectDelayMs)
  }

  function dispatchMessage(message: SseMessage) {
    if (message.event !== eventName) {
      return
    }

    try {
      callbacks.onEvent(JSON.parse(message.data) as T)
    } catch {
      callbacks.onError?.(new Error('实时消息格式错误'))
    }
  }

  async function connect() {
    if (stopped) {
      return
    }

    controller = new AbortController()
    let opened = false

    try {
      const resp = await fetch(url, {
        ...init,
        signal: controller.signal,
      })

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          stopped = true
        }
        throw new Error(await readStreamError(resp, '订阅会话失败'))
      }
      if (!resp.body) {
        throw new Error('订阅会话失败：接口未返回事件流')
      }

      opened = true
      callbacks.onOpen?.()

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (!stopped) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        buffer += decoder.decode(value, { stream: true })
        buffer = consumeSseRecords(buffer, dispatchMessage)
      }

      buffer += decoder.decode()
      consumeSseRecords(`${buffer}\n\n`, dispatchMessage)
    } catch (error) {
      if (!stopped && !isAbortError(error)) {
        callbacks.onError?.(toError(error))
      }
    } finally {
      controller = null
      if (opened && !stopped) {
        callbacks.onClose?.()
      }
      scheduleReconnect()
    }
  }

  void connect()

  return () => {
    stopped = true
    clearRetryTimer()
    controller?.abort()
    controller = null
  }
}
