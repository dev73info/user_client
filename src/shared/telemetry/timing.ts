import {
  createEventId,
  createSessionId,
  readSession,
  SESSION_IDLE_MS,
  writeSession,
} from './storage'
import type { StoredSession } from './storage'
import type { TelemetryEvent, TelemetryEventType } from './types'

const HEARTBEAT_MS = 15_000
const IDLE_MS = 60_000
const INTERACTION_THROTTLE_MS = 1_000

type Visit = {
  route: string
  sessionId: string
  dev: boolean
  enteredAt: number
  visibleSince: number | null
  idleAt: number
  referrer: string
}

export type EmittedTelemetry = {
  event: TelemetryEvent
  sessionId: string
  dev: boolean
  immediate: boolean
}

type Emit = (payload: EmittedTelemetry) => void

export class PageTiming {
  private visit: Visit | null = null
  private session: StoredSession = { id: '', lastActive: 0, account: '' }
  private previousRoute = ''
  private heartbeat: ReturnType<typeof setTimeout> | undefined
  private lastInteractionAt = 0
  private scrollPct = 0
  private readonly emit: Emit
  private readonly now: () => number

  constructor(emit: Emit, now: () => number = Date.now) {
    this.emit = emit
    this.now = now
  }

  enter(route: string, account: string, dev: boolean): void {
    const now = this.now()
    if (this.visit && this.visit.route === route && this.visit.dev === dev) {
      this.visit.idleAt = now + IDLE_MS
      this.session.lastActive = now
      writeSession(this.session)
      return
    }
    if (this.visit) {
      this.leaveAt(now)
    }
    const session = this.ensureSession(account, now)
    this.visit = {
      route,
      sessionId: session.id,
      dev,
      enteredAt: now,
      visibleSince: document.visibilityState === 'visible' ? now : null,
      idleAt: now + IDLE_MS,
      referrer: this.previousRoute,
    }
    this.scrollPct = 0
    this.emitEvent('page_enter', 0, now)
    this.armHeartbeat()
  }

  leave(): void {
    this.leaveAt(this.now())
  }

  hide(): void {
    const visit = this.visit
    if (!visit || visit.visibleSince === null) {
      return
    }
    const now = this.now()
    const active = this.settleActive(visit, now)
    if (active > 0) {
      this.emitEvent('page_heartbeat', active, now)
    }
    visit.visibleSince = null
    this.clearHeartbeat()
  }

  show(): void {
    const visit = this.visit
    if (!visit) {
      return
    }
    const now = this.now()
    if (now - this.session.lastActive >= SESSION_IDLE_MS) {
      const { route, dev } = visit
      this.leaveAt(now)
      this.enter(route, this.session.account, dev)
      return
    }
    visit.visibleSince = now
    visit.idleAt = now + IDLE_MS
    this.session.lastActive = now
    writeSession(this.session)
    this.armHeartbeat()
  }

  interact(): void {
    const visit = this.visit
    if (!visit || visit.visibleSince === null) {
      return
    }
    const now = this.now()
    if (now - this.lastInteractionAt < INTERACTION_THROTTLE_MS) {
      return
    }
    this.lastInteractionAt = now
    if (now - this.session.lastActive >= SESSION_IDLE_MS) {
      const { route, dev } = visit
      this.leaveAt(now)
      this.enter(route, this.session.account, dev)
      return
    }
    if (now >= visit.idleAt) {
      const active = this.settleActive(visit, now)
      if (active > 0) {
        this.emitEvent('page_heartbeat', active, now)
      }
      this.armHeartbeat()
    }
    visit.idleAt = now + IDLE_MS
    this.session.lastActive = now
    writeSession(this.session)
  }

  scroll(): void {
    this.scrollPct = Math.max(this.scrollPct, currentScrollPct())
    this.interact()
  }

  private ensureSession(account: string, now: number): StoredSession {
    const saved = readSession()
    if (saved && saved.account === account && now - saved.lastActive < SESSION_IDLE_MS) {
      saved.lastActive = now
      writeSession(saved)
      this.session = saved
      return saved
    }
    this.previousRoute = ''
    const fresh = { id: createSessionId(), lastActive: now, account }
    writeSession(fresh)
    this.session = fresh
    return fresh
  }

  private leaveAt(now: number): void {
    const visit = this.visit
    if (!visit) {
      return
    }
    const active = this.settleActive(visit, now)
    this.emitEvent('page_leave', active, now)
    this.previousRoute = visit.route
    this.visit = null
    this.clearHeartbeat()
  }

  private settleActive(visit: Visit, now: number): number {
    if (visit.visibleSince === null) {
      return 0
    }
    const active = Math.max(0, Math.min(now, visit.idleAt) - visit.visibleSince)
    visit.visibleSince = now
    return active
  }

  private emitEvent(type: TelemetryEventType, activeMs: number, now: number): void {
    const visit = this.visit
    if (!visit) {
      return
    }
    if (type === 'page_heartbeat' && activeMs <= 0) {
      return
    }
    const event: TelemetryEvent = {
      event_id: createEventId(),
      event_type: type,
      route_pattern: visit.route,
      active_ms: Math.max(0, Math.round(activeMs)),
      total_ms: Math.max(0, Math.round(now - visit.enteredAt)),
      client_ts: new Date(now).toISOString(),
    }
    if (visit.referrer) {
      event.referrer_pattern = visit.referrer
    }
    if (type === 'page_leave') {
      const depth = Math.max(this.scrollPct, currentScrollPct())
      if (depth > 0) {
        event.scroll_depth_pct = Math.min(100, Math.round(depth))
      }
    }
    this.emit({
      event,
      sessionId: visit.sessionId,
      dev: visit.dev,
      immediate: type === 'page_leave',
    })
  }

  private armHeartbeat(): void {
    this.clearHeartbeat()
    this.heartbeat = setTimeout(() => {
      this.heartbeat = undefined
      const visit = this.visit
      if (!visit || visit.visibleSince === null) {
        return
      }
      const now = this.now()
      if (now >= visit.idleAt) {
        return
      }
      const active = this.settleActive(visit, now)
      if (active > 0) {
        this.emitEvent('page_heartbeat', active, now)
      }
      this.session.lastActive = now
      writeSession(this.session)
      this.armHeartbeat()
    }, HEARTBEAT_MS)
  }

  private clearHeartbeat(): void {
    if (this.heartbeat !== undefined) {
      clearTimeout(this.heartbeat)
      this.heartbeat = undefined
    }
  }
}

function currentScrollPct(): number {
  const doc = document.documentElement
  const height = Math.max(doc.scrollHeight, document.body?.scrollHeight ?? 0)
  if (height <= 0) {
    return 0
  }
  const viewport = window.innerHeight || doc.clientHeight
  const scrolled = window.scrollY || doc.scrollTop || 0
  return Math.min(100, Math.max(0, ((scrolled + viewport) / height) * 100))
}
