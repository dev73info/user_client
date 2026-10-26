import { getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'

import type { DevDashboardSnapshot, DevDashboardSocketMessage } from '@/api/devDashboard'

export type DevDashboardSocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export const DASHBOARD_RECONNECT_BASE_MS = 1000
export const DASHBOARD_RECONNECT_MAX_MS = 30_000
export const DASHBOARD_STALE_MS = 60_000

export function dashboardReconnectDelay(attempt: number): number {
  return Math.min(
    DASHBOARD_RECONNECT_BASE_MS * 2 ** Math.max(0, attempt),
    DASHBOARD_RECONNECT_MAX_MS,
  )
}

export function useDevDashboardSocket(options: {
  url: () => string | null
  onSnapshot?: (snapshot: DevDashboardSnapshot) => void
}) {
  const status = ref<DevDashboardSocketStatus>('closed')
  const snapshot = shallowRef<DevDashboardSnapshot | null>(null)
  const lastUpdatedAt = ref<number | null>(null)
  const lastMessageAt = ref<number | null>(null)
  let socket: WebSocket | null = null
  let active = false
  let attempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let staleTimer: ReturnType<typeof setTimeout> | null = null

  function clearReconnectTimer() {
    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function clearStaleTimer() {
    if (staleTimer != null) {
      clearTimeout(staleTimer)
      staleTimer = null
    }
  }

  function armStaleTimer() {
    clearStaleTimer()
    staleTimer = setTimeout(dropAndReconnect, DASHBOARD_STALE_MS)
  }

  function closeSocket() {
    const current = socket
    socket = null
    if (!current) return
    current.onopen = null
    current.onmessage = null
    current.onerror = null
    current.onclose = null
    try {
      current.close()
    } catch {
      // 握手未完成时 close 可能抛错，连接本来就要丢弃
    }
  }

  function handleMessage(raw: unknown) {
    if (typeof raw !== 'string') return
    let message: DevDashboardSocketMessage
    try {
      message = JSON.parse(raw) as DevDashboardSocketMessage
    } catch {
      return
    }
    lastMessageAt.value = Date.now()
    attempt = 0
    armStaleTimer()
    if (message.type === 'snapshot' && message.data) {
      snapshot.value = message.data
      lastUpdatedAt.value = Date.now()
      options.onSnapshot?.(message.data)
    }
  }

  function open() {
    clearReconnectTimer()
    closeSocket()
    const url = options.url()
    if (!url) {
      scheduleReconnect()
      return
    }
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      scheduleReconnect()
      return
    }
    socket = ws
    ws.onopen = () => {
      if (socket !== ws) return
      status.value = 'open'
      armStaleTimer()
    }
    ws.onmessage = (event: MessageEvent) => {
      if (socket === ws) handleMessage(event.data)
    }
    ws.onerror = () => {}
    ws.onclose = () => {
      if (socket !== ws) return
      socket = null
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    clearStaleTimer()
    if (!active) return
    status.value = 'reconnecting'
    clearReconnectTimer()
    const delay = dashboardReconnectDelay(attempt)
    attempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (active) open()
    }, delay)
  }

  function dropAndReconnect() {
    closeSocket()
    scheduleReconnect()
  }

  function handleVisibilityChange() {
    if (!active || document.visibilityState !== 'visible') return
    if (status.value === 'reconnecting' && reconnectTimer != null) open()
  }

  function connect() {
    if (active) return
    active = true
    attempt = 0
    status.value = 'connecting'
    document.addEventListener('visibilitychange', handleVisibilityChange)
    open()
  }

  function disconnect() {
    if (!active && status.value === 'closed') return
    active = false
    clearReconnectTimer()
    clearStaleTimer()
    closeSocket()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    status.value = 'closed'
  }

  if (getCurrentScope()) onScopeDispose(disconnect)

  return { status, snapshot, lastUpdatedAt, lastMessageAt, connect, disconnect }
}
