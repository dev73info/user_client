import { onBeforeUnmount, ref } from 'vue'

import { listMySupportConversations, type SupportConversation } from '@/api/support'
import { useAuthStore } from '@/stores/auth'

/** 未读轮询间隔：客服回复没有针对悬浮入口的推送，靠列表轮询把角标带上。 */
const POLL_MS = 30_000

/**
 * 客服会话列表与未读数。
 *
 * 悬浮入口在没有打开面板时也要能看到未读，所以列表与未读独立于会话详情维护；
 * 面板打开 / 发送消息后再主动刷新一次。轮询失败保留上一次结果，不把角标闪没。
 */
export function useSupportUnread() {
  const auth = useAuthStore()
  const conversations = ref<SupportConversation[]>([])
  const unread = ref(0)
  let timer: number | null = null

  async function refresh(): Promise<SupportConversation[]> {
    const token = auth.token.trim()
    if (!token) {
      conversations.value = []
      unread.value = 0
      return []
    }
    try {
      const list = await listMySupportConversations(token)
      if (auth.token.trim() !== token) return conversations.value
      conversations.value = list
      unread.value = list.reduce((sum, item) => sum + (item.unread_user ?? 0), 0)
      return list
    } catch {
      return conversations.value
    }
  }

  function start() {
    if (timer !== null) return
    void refresh()
    timer = window.setInterval(() => {
      void refresh()
    }, POLL_MS)
  }

  function stop() {
    if (timer === null) return
    window.clearInterval(timer)
    timer = null
  }

  onBeforeUnmount(stop)

  return { conversations, unread, refresh, start, stop }
}
