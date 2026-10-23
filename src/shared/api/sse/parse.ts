import type { SseMessage } from './types'

/** SSE 报文解析与重试时长口径（纯函数，不碰网络之外的浏览器 API）。 */

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

export function consumeSseRecords(
  buffer: string,
  onMessage: (message: SseMessage) => void,
): string {
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

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('实时连接异常')
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/** 重连退避基础间隔。 */
export const DEFAULT_RECONNECT_DELAY_MS = 2000
/** 重连退避上限：后端长时间不可用时不再按固定间隔反复请求。 */
export const MAX_RECONNECT_DELAY_MS = 15_000
/** Retry-After 上限，防止异常响应头把重连推到遥遥无期。 */
export const MAX_RETRY_AFTER_MS = 300_000

export async function readStreamError(resp: Response, fallbackError: string): Promise<string> {
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
export function parseRetryAfterMs(resp: Response): number | null {
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
