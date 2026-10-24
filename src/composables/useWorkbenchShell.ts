import { computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { resolveWorkbenchTitle } from '@/shared/workbenchRoutes'
import { useAuthStore } from '@/stores/auth'

import { TMessageBox } from 'ui_73info'

import { useWorkbenchBadges } from './useWorkbenchBadges'
import { useWorkbenchConversations } from './useWorkbenchConversations'
import { useWorkbenchMenu } from './useWorkbenchMenu'
import { useWorkbenchMobileMenu } from './useWorkbenchMobileMenu'
import { useWorkbenchMode } from './useWorkbenchMode'

/**
 * 工作台外壳的组合根：把模式、菜单、会话、角标、移动端抽屉接到一起。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来。外壳本身只排版，这里做三件跨模块的事：
 * 1. 把各 composable 之间需要互相知道的那几件事接上（切模式要关抽屉、点消息中心要跳路由）；
 * 2. 算移动端顶栏那行的当前页名（要同时看路由标题、命中的菜单条目与会话名）；
 * 3. 两个 DOM 动作：滚到 hash 锚点、退出登录。
 *
 * 状态全部由各个 composable 持有，这里不另存一份，避免两边不同步。
 */
export function useWorkbenchShell() {
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()

  const mobileMenu = useWorkbenchMobileMenu()
  const mode = useWorkbenchMode({ closeMobileMenu: mobileMenu.closeMobileMenu })
  const menu = useWorkbenchMenu({
    isDevWorkbenchMode: mode.isDevWorkbenchMode,
    isMessagesRoute: mode.isMessagesRoute,
    ticketsMenuItem: mode.ticketsMenuItem,
    notificationsMenuItem: mode.notificationsMenuItem,
    closeMobileMenu: mobileMenu.closeMobileMenu,
    openMessagesCenter: () => {
      mobileMenu.closeMobileMenu()
      void router.push({ name: mode.messagesRouteName.value })
    },
    scrollToHash: () => {
      void scrollToHash()
    },
  })
  const conversations = useWorkbenchConversations()
  const badges = useWorkbenchBadges({ isDevWorkbenchMode: mode.isDevWorkbenchMode })

  const routeTitle = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : ''))

  /** 会话总数：消息中心据此判「暂无会话」，「查看全部消息」只在有剩余时出现。 */
  const conversationCount = computed(() => conversations.sortedConversations.value.length)

  /** 移动端顶栏那行字：消息中心报会话名，子页面报路由标题的后半段（判定见共享层）。 */
  const currentTitle = computed(() =>
    resolveWorkbenchTitle({
      isMessagesRoute: mode.isMessagesRoute.value,
      conversationTitle: conversations.activeConversation.value?.requirement_title,
      activeItem: menu.findActiveItem(),
      routeName: String(route.name ?? ''),
      routeTitle: routeTitle.value,
    }),
  )

  /** 菜单里带 `#hash` 的条目（如账户详情里的分段）：跳到那一页后把锚点滚进视野。 */
  async function scrollToHash() {
    if (!route.hash) {
      return
    }

    await nextTick()
    const target = document.getElementById(route.hash.slice(1))
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** 侧栏底部「退出登录」：先确认，再与顶栏同一口径清会话并回首页。 */
  async function logout() {
    const confirmed = await TMessageBox.confirm({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmText: '退出登录',
      cancelText: '取消',
      tone: 'danger',
    })
    if (!confirmed) return
    mobileMenu.closeMobileMenu()
    auth.logout()
    void router.push({ name: 'home' })
  }

  return {
    // 移动端抽屉
    mobileMenuOpen: mobileMenu.mobileMenuOpen,
    touchTracking: mobileMenu.touchTracking,
    openMobileMenu: mobileMenu.openMobileMenu,
    closeMobileMenu: mobileMenu.closeMobileMenu,
    handleWorkbenchTouchStart: mobileMenu.handleWorkbenchTouchStart,
    handleWorkbenchTouchEnd: mobileMenu.handleWorkbenchTouchEnd,
    // 工作台模式
    isDevWorkbenchMode: mode.isDevWorkbenchMode,
    workbenchModeKey: mode.workbenchModeKey,
    workbenchBrandTitle: mode.workbenchBrandTitle,
    messagesRouteName: mode.messagesRouteName,
    isMessagesRoute: mode.isMessagesRoute,
    ticketsMenuItem: mode.ticketsMenuItem,
    notificationsMenuItem: mode.notificationsMenuItem,
    modeSwitching: mode.modeSwitching,
    modeSwitchSpinning: mode.modeSwitchSpinning,
    switchWorkbenchMode: mode.switchWorkbenchMode,
    // 菜单
    openGroupKeys: menu.openGroupKeys,
    visibleMenuGroups: menu.visibleMenuGroups,
    messagesAnchorIndex: menu.messagesAnchorIndex,
    toggleGroup: menu.toggleGroup,
    toggleMessageCenter: menu.toggleMessageCenter,
    openMessageCenter: menu.openMessageCenter,
    // 会话与角标
    conversations: conversations.visibleConversations,
    conversationLoading: conversations.conversationLoading,
    conversationCount: conversationCount,
    hiddenConversationCount: conversations.hiddenConversationCount,
    unreadMessageCount: conversations.unreadMessageCount,
    teamInvitationCount: badges.teamInvitationCount,
    devActiveOrderCount: badges.devActiveOrderCount,
    // 外壳自身
    auth,
    currentTitle,
    logout,
  }
}
