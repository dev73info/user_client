import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { getMyRealnameVerification } from '@/api/realname'
import { useWorkbenchMenuRoute } from '@/composables/useWorkbenchMenuRoute'
import {
  buildMenuGroups,
  financeMenuGroup,
  MESSAGES_GROUP_KEY,
  overviewItem,
  teamMenuGroup,
  type WorkbenchMenuItem,
  type WorkbenchMenuGroup,
} from '@/shared/workbenchMenu'
import { messagesAnchorIndexFor } from '@/shared/workbenchRoutes'
import { useAuthStore } from '@/stores/auth'

import type { ComputedRef } from 'vue'

/**
 * 侧边栏菜单：有哪些分组、哪些展开、当前停在哪一条。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来。菜单数据与判定在 `@/shared/workbenchMenu`（纯函数），
 * 这里只负责把它们和路由、实名状态、展开状态接起来。
 */
export function useWorkbenchMenu(options: {
  isDevWorkbenchMode: ComputedRef<boolean>
  isMessagesRoute: ComputedRef<boolean>
  notificationsMenuItem: ComputedRef<WorkbenchMenuItem>
  closeMobileMenu: () => void
  /** 跳消息中心（含关抽屉）：消息中心是「组头 + 会话列表」，点开时两件事一起做。 */
  openMessagesCenter: () => void
  scrollToHash: () => void
}) {
  const route = useRoute()
  const auth = useAuthStore()

  /** 实名通过后「我的合同」才出现在账户服务里。 */
  const realnameApproved = ref(false)
  const openGroupKeys = ref<string[]>([])

  const menuGroups = computed<WorkbenchMenuGroup[]>(() => buildMenuGroups(realnameApproved.value))

  // 全部菜单分组：财务中心与团队服务只在开发者模式下渲染，但两种模式都要能解析当前页归属的条目。
  const allMenuGroups = computed<WorkbenchMenuGroup[]>(() => [
    ...menuGroups.value,
    financeMenuGroup,
    teamMenuGroup,
  ])

  // 开发者模式下侧边栏不渲染用户菜单分组，只保留财务中心与团队服务。
  const visibleMenuGroups = computed(() =>
    options.isDevWorkbenchMode.value ? [financeMenuGroup, teamMenuGroup] : menuGroups.value,
  )

  const messagesAnchorIndex = computed(() =>
    messagesAnchorIndexFor(options.isDevWorkbenchMode.value, visibleMenuGroups.value.length),
  )

  /** 高亮判定要用到的三个路由值摊平成一个纯函数的入参。 */
  const { isItemActive, isOverviewActive } = useWorkbenchMenuRoute()

  function isMenuItemActive(item: WorkbenchMenuItem) {
    return isItemActive(item)
  }

  function isGroupActive(group: WorkbenchMenuGroup) {
    return group.items.some((item) => isMenuItemActive(item))
  }

  function isGroupOpen(group: WorkbenchMenuGroup) {
    return openGroupKeys.value.includes(group.key)
  }

  function toggleGroup(group: WorkbenchMenuGroup) {
    if (isGroupOpen(group)) {
      openGroupKeys.value = openGroupKeys.value.filter((key) => key !== group.key)
      return
    }

    openGroupKeys.value = [...openGroupKeys.value, group.key]
  }

  function isMessageMenuOpen() {
    return openGroupKeys.value.includes(MESSAGES_GROUP_KEY)
  }

  function openMessageCenter() {
    if (!isMessageMenuOpen()) {
      openGroupKeys.value = [...openGroupKeys.value, MESSAGES_GROUP_KEY]
    }

    options.openMessagesCenter()
  }

  function toggleMessageCenter() {
    if (isMessageMenuOpen()) {
      openGroupKeys.value = openGroupKeys.value.filter((key) => key !== MESSAGES_GROUP_KEY)
      options.closeMobileMenu()
      return
    }

    openMessageCenter()
  }

  /** 当前页命中的那一条菜单；消息中心与总览另算（它们不对应分组内的条目）。 */
  function findActiveItem(): WorkbenchMenuItem | null {
    if (isOverviewActive()) {
      return overviewItem
    }

    if (options.isMessagesRoute.value) {
      return null
    }

    return (
      [
        ...allMenuGroups.value.flatMap((group) => group.items),
        options.notificationsMenuItem.value,
      ].find((item) => isMenuItemActive(item)) ?? null
    )
  }

  // 进页 / 换页时：把当前页所在的分组自动展开、收起抽屉、滚到 hash 位置。
  watch(
    [() => route.fullPath, menuGroups],
    () => {
      const activeGroup = allMenuGroups.value.find((group) =>
        group.items.some((item) => isMenuItemActive(item)),
      )
      if (activeGroup && !openGroupKeys.value.includes(activeGroup.key)) {
        openGroupKeys.value = [...openGroupKeys.value, activeGroup.key]
      }
      if (options.isMessagesRoute.value && !openGroupKeys.value.includes(MESSAGES_GROUP_KEY)) {
        openGroupKeys.value = [...openGroupKeys.value, MESSAGES_GROUP_KEY]
      }
      options.closeMobileMenu()
      options.scrollToHash()
    },
    { immediate: true },
  )

  // 实名状态决定「我的合同」在不在，换账号时先清掉旧值，避免上一个账号的菜单残留在新账号上。
  watch(
    [() => auth.token, () => route.fullPath],
    async ([token], [previousToken], onCleanup) => {
      let cancelled = false
      onCleanup(() => {
        cancelled = true
      })
      if (token !== previousToken) realnameApproved.value = false
      if (!token) return
      try {
        const verification = await getMyRealnameVerification(auth.token)
        if (!cancelled) realnameApproved.value = verification.status === 'approved'
      } catch {
        if (!cancelled) realnameApproved.value = false
      }
    },
    { immediate: true },
  )

  return {
    // 侧边栏要用的
    openGroupKeys,
    visibleMenuGroups,
    messagesAnchorIndex,
    toggleGroup,
    toggleMessageCenter,
    openMessageCenter,
    // 外壳算标题要用：当前页命中的那一条
    findActiveItem,
  }
}
