import type { QueueEntry } from './types'

const VISITOR_KEY = 'ops_telemetry_visitor'
const QUEUE_KEY = 'ops_telemetry_queue'
const SESSION_KEY = 'ops_telemetry_session'

export const SESSION_IDLE_MS = 30 * 60_000
export const MAX_QUEUE = 20

export type StoredSession = {
  id: string
  lastActive: number
  account: string
}

function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    // 隐私模式 / 存储被禁用时静默降级：埋点不能影响页面。
    return null
  }
}

function readJson<T>(storage: Storage | null, key: string): T | null {
  if (!storage) {
    return null
  }
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(storage: Storage | null, key: string, value: unknown): void {
  if (!storage) {
    return
  }
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // 存储满或被禁用时静默降级。
  }
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buffer)
  } else {
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(buffer, (value) => value.toString(16).padStart(2, '0')).join('')
}

export function createSessionId(): string {
  return `ses_${randomHex(12)}`
}

export function createEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // RFC 4122 v4 兜底：后端只接受 UUID。
  const hex = randomHex(16).split('')
  hex[12] = '4'
  hex[16] = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16)
  const value = hex.join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

export function readVisitorId(): string {
  const storage = safeStorage('local')
  const saved = storage?.getItem(VISITOR_KEY)
  if (saved && /^vis_[0-9a-f]{12,32}$/.test(saved)) {
    return saved
  }
  const visitor = `vis_${randomHex(12)}`
  try {
    storage?.setItem(VISITOR_KEY, visitor)
  } catch {
    // 存储不可用时本次会话仍可匿名上报。
  }
  return visitor
}

export function readSession(): StoredSession | null {
  const value = readJson<StoredSession>(safeStorage('session'), SESSION_KEY)
  if (
    !value ||
    typeof value.id !== 'string' ||
    typeof value.lastActive !== 'number' ||
    typeof value.account !== 'string'
  ) {
    return null
  }
  return value
}

export function writeSession(session: StoredSession): void {
  writeJson(safeStorage('session'), SESSION_KEY, session)
}

export function readQueue(): QueueEntry[] {
  const value = readJson<QueueEntry[]>(safeStorage('local'), QUEUE_KEY)
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.session_id === 'string' &&
      typeof entry.visitor_id === 'string' &&
      typeof entry.event?.event_id === 'string',
  )
}

export function writeQueue(queue: QueueEntry[]): void {
  writeJson(safeStorage('local'), QUEUE_KEY, queue.slice(-MAX_QUEUE))
}
