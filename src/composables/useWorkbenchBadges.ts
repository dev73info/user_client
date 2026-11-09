import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { listMyRequirements } from '@/api/devRequirements'
import { getMyNotificationUnreadCount } from '@/api/notifications'
import { listUserInvitations } from '@/api/team'
import {
  NOTIFICATION_UNREAD_CHANGED_EVENT,
  type NotificationUnreadChangedDetail,
} from '@/shared/notificationEvents'
import { isActiveRequirement } from '@/shared/requirementStatus'
import { useAuthStore } from '@/stores/auth'

import type { ComputedRef } from 'vue'

/**
 * 图标栏上的三个角标：团队待处理邀请、「我的接单」在途单数、未读站内通知数。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来。三者都只是提示，拿不到数据就当没有，
 * 不弹提示打断页面；「我的接单」只在开发者模式拉取——用户模式下这个接口会 403，没必要发。
 * 未读通知数按路由变化刷新：在通知页读完几条，切到别的页面时角标跟着更新。
 */
export function useWorkbenchBadges(options: { isDevWorkbenchMode: ComputedRef<boolean> }) {
  const route = useRoute()
  const auth = useAuthStore()

  const teamInvitationCount = ref(0)
  /** 「我的接单」角标：在途接单数，与总览页「进行中项目」同一口径。 */
  const devActiveOrderCount = ref(0)
  /** 未读站内通知：图标栏铃铛上的角标。 */
  const notificationUnreadCount = ref(0)

  async function loadTeamInvitations() {
    if (!auth.token.trim()) {
      teamInvitationCount.value = 0
      return
    }
    try {
      const invitations = await listUserInvitations(auth.token)
      teamInvitationCount.value = invitations.filter((inv) => inv.status === 'pending').length
    } catch {
      teamInvitationCount.value = 0
    }
  }

  async function loadDevActiveOrders() {
    if (!auth.token.trim()) {
      devActiveOrderCount.value = 0
      return
    }

    try {
      const items = await listMyRequirements(auth.token)
      devActiveOrderCount.value = items.filter((item) => isActiveRequirement(item.status)).length
    } catch {
      devActiveOrderCount.value = 0
    }
  }

  async function loadNotificationUnread() {
    if (!auth.token.trim()) {
      notificationUnreadCount.value = 0
      return
    }

    try {
      notificationUnreadCount.value = await getMyNotificationUnreadCount(auth.token)
    } catch {
      notificationUnreadCount.value = 0
    }
  }

  watch(
    () => auth.token,
    () => {
      void loadTeamInvitations()
      void loadNotificationUnread()
    },
    { immediate: true },
  )

  // 在通知页读完几条后切走，角标要跟着变；每跳一次只发一个只读计数请求。
  watch(
    () => route.fullPath,
    () => {
      if (auth.token.trim()) {
        void loadNotificationUnread()
      }
    },
  )

  // 通知页里标记已读时直接广播最新未读数：不用等跳页，角标当场跟着变。
  function handleNotificationUnreadChanged(event: Event) {
    const detail = (event as CustomEvent<NotificationUnreadChangedDetail>).detail
    if (detail && typeof detail.unread === 'number') {
      notificationUnreadCount.value = detail.unread
    }
  }

  onMounted(() =>
    window.addEventListener(NOTIFICATION_UNREAD_CHANGED_EVENT, handleNotificationUnreadChanged),
  )
  onBeforeUnmount(() =>
    window.removeEventListener(NOTIFICATION_UNREAD_CHANGED_EVENT, handleNotificationUnreadChanged),
  )

  watch(
    [() => auth.token, () => options.isDevWorkbenchMode.value],
    ([token, devMode]) => {
      if (!token || !devMode) {
        devActiveOrderCount.value = 0
        return
      }

      void loadDevActiveOrders()
    },
    { immediate: true },
  )

  return {
    teamInvitationCount,
    devActiveOrderCount,
    notificationUnreadCount,
    loadTeamInvitations,
    loadDevActiveOrders,
    loadNotificationUnread,
  }
}
