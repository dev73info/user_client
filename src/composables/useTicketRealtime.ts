import { onBeforeUnmount, ref } from 'vue'

import { ticketWsUrl } from '@/api/tickets'
import { useAuthStore } from '@/stores/auth'

const MAX_RECONNECT_ATTEMPTS = 5

/**
 * 工单实时连接：断线按指数退避重连，连续 5 次失败后停下并给出可见提示。
 * 收到 `ticket.updated` 时回调业务层刷新；`ticket_id` 为空表示整列表刷新。
 */
export function useTicketRealtime(onTicketUpdated: (ticketId: string) => void) {
  const auth = useAuthStore()
  const realtimeWarning = ref('')
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempt = 0
  let disposed = false

  function connect() {
    const token = auth.token.trim()
    if (!token || socket || disposed) return

    let next: WebSocket
    try {
      next = new WebSocket(ticketWsUrl(token))
    } catch {
      scheduleReconnect()
      return
    }

    socket = next
    next.onopen = () => {
      reconnectAttempt = 0
      realtimeWarning.value = ''
    }
    next.onmessage = (event: MessageEvent) => {
      if (socket !== next || typeof event.data !== 'string') return
      try {
        const payload = JSON.parse(event.data) as { event?: string; ticket_id?: string }
        if (payload.event && payload.event !== 'ticket.updated') return
        onTicketUpdated(payload.ticket_id ?? '')
      } catch {
        // 无法识别的推送不改变当前列表。
      }
    }
    next.onerror = () => {
      next.close()
    }
    next.onclose = () => {
      if (socket !== next) return
      socket = null
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (disposed) return
    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      realtimeWarning.value = '实时连接已断开'
      return
    }
    const delay = Math.min(3000 * 2 ** reconnectAttempt, 15_000)
    reconnectAttempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function disconnect() {
    disposed = true
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    const current = socket
    socket = null
    current?.close()
  }

  onBeforeUnmount(disconnect)

  return { realtimeWarning, connect, disconnect }
}
