import { ref } from 'vue'

import { getSupportAvailability } from '@/api/support'

const REFRESH_MS = 60_000

export function useSupportChatAvailability() {
  const online = ref(false)
  const onlineAgents = ref(0)
  const loaded = ref(false)
  let timer: number | null = null

  async function refresh() {
    try {
      const state = await getSupportAvailability()
      online.value = state.online
      onlineAgents.value = state.online_agents
      loaded.value = true
    } catch {
      // 在线状态是增益信息，失败不影响留言与实时消息。
    }
  }

  function start() {
    void refresh()
    if (timer !== null) return
    timer = window.setInterval(() => void refresh(), REFRESH_MS)
  }

  function stop() {
    if (timer !== null) window.clearInterval(timer)
    timer = null
  }

  return { online, onlineAgents, loaded, refresh, start, stop }
}
