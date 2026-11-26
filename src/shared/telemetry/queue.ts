import { apiUrl } from '@/shared/api/url'
import { AUTH_TOKEN_STORAGE_KEY } from '@/shared/auth/storage'

import { MAX_QUEUE, readQueue, writeQueue } from './storage'
import type { IngestBatch, QueueEntry } from './types'

const RETRY_MIN_MS = 1_000
const RETRY_MAX_MS = 5 * 60_000
const BATCH_MAX = 50
const EVENT_MAX_AGE_MS = 24 * 60 * 60_000
const INGEST_PATH = '/ops/telemetry/ingest'

let sending = false
let retryAt = 0
let retryMs = RETRY_MIN_MS
let flushTimer: ReturnType<typeof setTimeout> | undefined
let currentSessionId = ''
let rejectedToken = ''

export function setCurrentSession(sessionId: string): void {
  if (sessionId !== currentSessionId) {
    currentSessionId = sessionId
    rejectedToken = ''
  }
}

export function enqueue(entry: QueueEntry, immediate = false): void {
  const queue = readQueue()
  queue.push(entry)
  if (queue.length > MAX_QUEUE) {
    const heartbeat = queue.findIndex((item) => item.event.event_type === 'page_heartbeat')
    queue.splice(heartbeat >= 0 ? heartbeat : 0, 1)
  }
  writeQueue(queue)
  scheduleFlush(immediate ? 0 : 2_000)
}

export function scheduleFlush(delay = 2_000): void {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer)
  }
  flushTimer = setTimeout(
    () => {
      flushTimer = undefined
      void flush()
    },
    Math.max(delay, retryAt - Date.now()),
  )
}

export function handleOnline(): void {
  retryAt = 0
  retryMs = RETRY_MIN_MS
  scheduleFlush(0)
}

/**
 * 页面卸载专用：优先 sendBeacon（仅同源，跨域时 JSON 会触发预检而失败），
 * 否则走 fetch keepalive。事件 id 不变，服务端按 id 去重，重复补发是安全的。
 */
export function flushOnHide(): void {
  const queue = readQueue()
  const first = queue[0]
  if (!first) {
    return
  }
  const batch = queue
    .filter(
      (entry) => entry.session_id === first.session_id && entry.app_channel === first.app_channel,
    )
    .slice(0, BATCH_MAX)
  const body = JSON.stringify(payloadOf(batch))
  const url = apiUrl(INGEST_PATH)
  if (typeof navigator.sendBeacon === 'function' && isSameOrigin(url)) {
    try {
      if (navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) {
        remove(batch)
        return
      }
    } catch {
      // 落到下面的 fetch keepalive。
    }
  }
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'omit',
  })
    .then(() => remove(batch))
    .catch(() => {
      // 保留队列，下次启动补发。
    })
}

async function flush(): Promise<void> {
  if (sending) {
    return
  }
  sending = true
  try {
    const all = readQueue()
    const queue = all.filter(
      (entry) => Date.now() - Date.parse(entry.event.client_ts) <= EVENT_MAX_AGE_MS,
    )
    if (queue.length !== all.length) {
      writeQueue(queue)
    }
    const first = queue[0]
    if (!first) {
      return
    }
    const batch = queue
      .filter(
        (entry) => entry.session_id === first.session_id && entry.app_channel === first.app_channel,
      )
      .slice(0, BATCH_MAX)
    const token = activeToken(first.session_id)
    const status = await send(payloadOf(batch), token)
    if (status === 401 && token) {
      // 令牌失效时降级为匿名批次，换新令牌后自动恢复。
      rejectedToken = token
      retryAt = Date.now() + RETRY_MIN_MS
      return
    }
    if (status === 408 || status === 429 || status >= 500) {
      throw new Error(`telemetry ${status}`)
    }
    remove(batch)
    retryMs = RETRY_MIN_MS
    retryAt = 0
  } catch {
    retryAt = Date.now() + retryMs
    retryMs = Math.min(retryMs * 2, RETRY_MAX_MS)
  } finally {
    sending = false
    if (readQueue().length > 0) {
      scheduleFlush(0)
    }
  }
}

function payloadOf(batch: QueueEntry[]): IngestBatch {
  const first = batch[0]
  if (!first) {
    throw new Error('empty telemetry batch')
  }
  return {
    app_channel: first.app_channel,
    session_id: first.session_id,
    visitor_id: first.visitor_id,
    device_type: first.device_type,
    viewport_width: first.viewport_width,
    events: batch.map((entry) => entry.event),
  }
}

async function send(payload: IngestBatch, token: string): Promise<number> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const response = await fetch(apiUrl(INGEST_PATH), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    credentials: 'omit',
  })
  return response.status
}

function activeToken(sessionId: string): string {
  if (sessionId !== currentSessionId) {
    return ''
  }
  try {
    const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? ''
    return token && token !== rejectedToken ? token : ''
  } catch {
    return ''
  }
}

function remove(batch: QueueEntry[]): void {
  // localStorage 每次读取都会生成新对象，不能按对象引用比对；event_id 才是稳定键。
  const delivered = new Set(batch.map((entry) => entry.event.event_id))
  writeQueue(readQueue().filter((entry) => !delivered.has(entry.event.event_id)))
}

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}
