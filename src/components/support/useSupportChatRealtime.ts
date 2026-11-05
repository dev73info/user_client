import { getCurrentScope, onScopeDispose, ref } from 'vue'

import type { SupportConversationDetail } from '@/api/support'

export const SUPPORT_RECONNECT_BASE_MS = 3000
export const SUPPORT_RECONNECT_MAX_MS = 15_000

export function supportReconnectDelay(attempt: number): number {
  return Math.min(SUPPORT_RECONNECT_BASE_MS * 2 ** Math.max(0, attempt), SUPPORT_RECONNECT_MAX_MS)
}

export function useSupportChatRealtime(options: {
  url: () => string | null
  onOpen?: () => void
  onDetail: (detail: SupportConversationDetail) => void
  /** 连续重连失败后回调一次；调用方据此给出可见提示并停止空转。 */
  onUnavailable?: () => void
}) {
  const connected = ref(false)
  let socket: WebSocket | null = null
  let active = false
  let attempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let unavailableNotified = false

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
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
      // 握手尚未完成时，丢弃连接即可。
    }
  }

  function open() {
    clearReconnectTimer()
    closeSocket()
    connected.value = false
    const url = options.url()
    if (!url) return

    let next: WebSocket
    try {
      next = new WebSocket(url)
    } catch {
      scheduleReconnect()
      return
    }
    socket = next
    next.onopen = () => {
      if (socket !== next) return
      connected.value = true
      attempt = 0
      unavailableNotified = false
      options.onOpen?.()
    }
    next.onmessage = (event: MessageEvent) => {
      if (socket !== next || typeof event.data !== 'string') return
      try {
        const detail = JSON.parse(event.data) as SupportConversationDetail
        if (typeof detail.conversation?.id !== 'number' || !Array.isArray(detail.messages)) return
        options.onDetail(detail)
      } catch {
        // 无法识别的推送不改变当前会话。
      }
    }
    next.onerror = () => {}
    next.onclose = () => {
      if (socket !== next) return
      socket = null
      connected.value = false
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (!active || !options.url()) return
    connected.value = false
    clearReconnectTimer()
    // 连续 5 次连不上（含 401/403 握手失败）就停下，避免无限重连静默失败。
    if (attempt >= 5) {
      active = false
      if (!unavailableNotified) {
        unavailableNotified = true
        options.onUnavailable?.()
      }
      return
    }
    const delay = supportReconnectDelay(attempt)
    attempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (active) open()
    }, delay)
  }

  function connect() {
    if (active) return
    active = true
    attempt = 0
    unavailableNotified = false
    open()
  }

  function disconnect() {
    active = false
    clearReconnectTimer()
    closeSocket()
    connected.value = false
  }

  if (getCurrentScope()) onScopeDispose(disconnect)

  return { connected, connect, disconnect }
}
