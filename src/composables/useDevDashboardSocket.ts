import { getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'

import type { DevDashboardSnapshot, DevDashboardSocketMessage } from '@/api/devDashboard'

/**
 * 连接状态：`connecting` 是首次建连；断开后等待重连与重连中的那次握手都算 `reconnecting`，
 * 只有调用方主动 `disconnect()` 才回到 `closed`。
 */
export type DevDashboardSocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export const DASHBOARD_RECONNECT_BASE_MS = 1000
export const DASHBOARD_RECONNECT_MAX_MS = 30_000
/** 服务端约 25 秒一次心跳，超过 60 秒一条消息都没有就当连接已经死了。 */
export const DASHBOARD_STALE_MS = 60_000

/** 第 attempt 次重连（从 0 起）前等多久：1s、2s、4s… 封顶 30s。 */
export function dashboardReconnectDelay(attempt: number): number {
  return Math.min(DASHBOARD_RECONNECT_BASE_MS * 2 ** Math.max(0, attempt), DASHBOARD_RECONNECT_MAX_MS)
}

export type UseDevDashboardSocketOptions = {
  /** 每次建连时现取地址：令牌可能在两次重连之间换过；返回 null 表示当前没法连（未登录）。 */
  url: () => string | null
  onSnapshot?: (snapshot: DevDashboardSnapshot) => void
}

export function useDevDashboardSocket(options: UseDevDashboardSocketOptions) {
  const status = ref<DevDashboardSocketStatus>('closed')
  const snapshot = shallowRef<DevDashboardSnapshot | null>(null)
  /** 最近一次收到快照的本地时刻（毫秒）。 */
  const lastUpdatedAt = ref<number | null>(null)
  /** 最近一次收到任何消息（含心跳）的本地时刻（毫秒）。 */
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
    staleTimer = setTimeout(() => {
      staleTimer = null
      dropAndReconnect()
    }, DASHBOARD_STALE_MS)
  }

  /** 先摘掉回调再关：旧连接的 close 事件不能再触发一轮重连；每用户最多 3 条连接，旧的必须真关掉。 */
  function closeSocket() {
    const current = socket
    socket = null
    if (!current) {
      return
    }
    current.onopen = null
    current.onmessage = null
    current.onerror = null
    current.onclose = null
    try {
      current.close()
    } catch {
      // 握手还没完成时 close 可能抛错，连接本来就要丢掉
    }
  }

  function handleMessage(raw: unknown) {
    if (typeof raw !== 'string') {
      return
    }
    let message: DevDashboardSocketMessage
    try {
      message = JSON.parse(raw) as DevDashboardSocketMessage
    } catch {
      return
    }

    lastMessageAt.value = Date.now()
    // 收到消息才算真的连上：只握手成功就被断开的连接不能把退避复位，否则会退化成每秒硬重连
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
      if (socket !== ws) return
      handleMessage(event.data)
    }
    // error 之后浏览器一定会再派发 close，重连统一在 close 里排
    ws.onerror = () => {}
    ws.onclose = () => {
      if (socket !== ws) return
      socket = null
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    clearStaleTimer()
    if (!active) {
      return
    }
    status.value = 'reconnecting'
    clearReconnectTimer()
    const delay = dashboardReconnectDelay(attempt)
    attempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (active) {
        open()
      }
    }, delay)
  }

  function dropAndReconnect() {
    closeSocket()
    scheduleReconnect()
  }

  /** 回到前台时若连接已断，不等退避计时，立刻重连（平板锁屏后浏览器常会掐掉连接）。 */
  function handleVisibilityChange() {
    if (!active || document.visibilityState !== 'visible') {
      return
    }
    if (status.value === 'reconnecting' && reconnectTimer != null) {
      open()
    }
  }

  function connect() {
    if (active) {
      return
    }
    active = true
    attempt = 0
    status.value = 'connecting'
    document.addEventListener('visibilitychange', handleVisibilityChange)
    open()
  }

  function disconnect() {
    if (!active && status.value === 'closed') {
      return
    }
    active = false
    clearReconnectTimer()
    clearStaleTimer()
    closeSocket()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    status.value = 'closed'
  }

  if (getCurrentScope()) {
    onScopeDispose(disconnect)
  }

  return { status, snapshot, lastUpdatedAt, lastMessageAt, connect, disconnect }
}
