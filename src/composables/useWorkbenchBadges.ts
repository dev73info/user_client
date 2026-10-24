import { ref, watch } from 'vue'

import { listMyRequirements } from '@/api/devRequirements'
import { listUserInvitations } from '@/api/team'
import { isActiveRequirement } from '@/shared/requirementStatus'
import { useAuthStore } from '@/stores/auth'

import type { ComputedRef } from 'vue'

/**
 * 侧边栏上的两个角标：团队待处理邀请、「我的接单」在途单数。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来。两者都只是提示，拿不到数据就当没有，
 * 不弹提示打断页面；「我的接单」只在开发者模式拉取——用户模式下这个接口会 403，没必要发。
 */
export function useWorkbenchBadges(options: { isDevWorkbenchMode: ComputedRef<boolean> }) {
  const auth = useAuthStore()

  const teamInvitationCount = ref(0)
  /** 「我的接单」角标：在途接单数，与总览页「进行中项目」同一口径。 */
  const devActiveOrderCount = ref(0)

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

  watch(
    () => auth.token,
    () => {
      void loadTeamInvitations()
    },
    { immediate: true },
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
    loadTeamInvitations,
    loadDevActiveOrders,
  }
}
