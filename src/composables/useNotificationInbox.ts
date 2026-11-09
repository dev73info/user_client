import { ref } from 'vue'

import {
  listAllMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
  type BackendNotification,
} from '@/api/notifications'
import { describeBackendError } from '@/shared/backendErrorText'
import { dispatchNotificationUnreadChanged } from '@/shared/notificationEvents'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 后端站内通知收件箱：列表、未读数、已读动作。
 *
 * 从 `useNotificationCenter` 拆出——那一层还管三支本地来源的聚合与筛选，行数已经吃满预算。
 * 这里只碰收件箱自己的状态：一次取全、未读数、单条已读与全部已读。
 * 失败时保留已取得的条目并留下错误文案，由页面决定怎么展示与重试。
 */
export function useNotificationInbox() {
  const auth = useAuthStore()

  const items = ref<BackendNotification[]>([])
  const error = ref('')
  const loading = ref(false)
  const unreadCount = ref(0)
  /** 正在标记已读的单号 / 是否正在全部标记：按钮 loading 用。 */
  const markingId = ref<string | null>(null)
  const markingAll = ref(false)

  const hasToken = () => Boolean(auth.token.trim())

  function setUnread(value: number) {
    unreadCount.value = Math.max(0, value)
    dispatchNotificationUnreadChanged(unreadCount.value)
  }

  function reset() {
    items.value = []
    error.value = ''
    setUnread(0)
  }

  /** 取全量收件箱；未登录时直接清空，不发明知会 401 的请求。 */
  async function load() {
    auth.hydrate()
    if (!hasToken()) {
      reset()
      return
    }

    loading.value = true
    try {
      const result = await listAllMyNotifications(auth.token)
      items.value = result.items
      setUnread(result.unread_count)
      error.value = ''
    } catch (failure) {
      error.value = describeBackendError(failure, '加载站内通知失败')
    } finally {
      loading.value = false
    }
  }

  /** 单条标记已读：只改这一条与未读数，不整页重拉。 */
  async function markRead(notificationId: string) {
    if (!notificationId || markingId.value !== null) {
      return
    }
    auth.hydrate()
    if (!hasToken()) {
      return
    }

    markingId.value = notificationId
    try {
      await markMyNotificationRead(auth.token, notificationId)
      const item = items.value.find((row) => row.notification_id === notificationId)
      if (item) {
        item.read = true
      }
      setUnread(unreadCount.value - 1)
    } catch (failure) {
      TMessage.warning(failure instanceof Error ? failure.message : '标记已读失败')
    } finally {
      markingId.value = null
    }
  }

  /** 全部标为已读：成功后把本地收件箱的已读态与未读数一起归零。 */
  async function markAllRead() {
    if (markingAll.value || unreadCount.value === 0) {
      return
    }
    auth.hydrate()
    if (!hasToken()) {
      return
    }

    markingAll.value = true
    try {
      const result = await markAllMyNotificationsRead(auth.token)
      for (const item of items.value) {
        item.read = true
      }
      setUnread(0)
      TMessage.success(`已全部标为已读（${result.marked} 条）`)
    } catch (failure) {
      TMessage.warning(failure instanceof Error ? failure.message : '全部标为已读失败')
    } finally {
      markingAll.value = false
    }
  }

  return {
    items,
    error,
    loading,
    unreadCount,
    markingId,
    markingAll,
    load,
    reset,
    markRead,
    markAllRead,
  }
}
