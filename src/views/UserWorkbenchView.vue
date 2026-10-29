<script setup lang="ts">
/**
 * 工作台外壳（`/workbench/*` 与开发者工作台 `/workbench/developer/*` 共用的那一层）。
 *
 * 这一页只负责排版与组合：
 * - 模式（用户 / 开发者）、菜单、会话与角标、移动端抽屉 → `useWorkbenchShell`；
 * - 生产路由统一使用窄图标栏 → `components/workbench/WorkbenchIconRail`；
 * - 旧侧边栏与移动端菜单仅保留给历史测试路由，不再进入生产页面；
 * - 外壳色板 `--uw-*` → `styles/workbench-shell.css`；
 * - 菜单数据与高亮判定 → `@/shared/workbenchMenu`，文案与时间格式化 → `@/shared/workbenchDisplay`。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { useWorkbenchShell } from '@/composables/useWorkbenchShell'
import { isWorkbenchChatPage } from '@/shared/workbenchChatRoute'

import WorkbenchIconRail from '@/components/workbench/WorkbenchIconRail.vue'
import WorkbenchMobileBar from '@/components/workbench/WorkbenchMobileBar.vue'
import WorkbenchSidebar from '@/components/workbench/WorkbenchSidebar.vue'

const route = useRoute()
const usesIconShell = computed(() =>
  route.matched.some((record) => record.meta.workbenchShell === true),
)
const isChatWorkspace = computed(() =>
  isWorkbenchChatPage(route.name, route.meta, route.query as Record<string, unknown>),
)

const {
  mobileMenuOpen,
  touchTracking,
  openMobileMenu,
  closeMobileMenu,
  handleWorkbenchTouchStart,
  handleWorkbenchTouchEnd,
  isDevWorkbenchMode,
  workbenchModeKey,
  workbenchBrandTitle,
  messagesRouteName,
  isMessagesRoute,
  notificationsMenuItem,
  modeSwitching,
  modeSwitchSpinning,
  switchWorkbenchMode,
  openGroupKeys,
  visibleMenuGroups,
  messagesAnchorIndex,
  toggleGroup,
  toggleMessageCenter,
  openMessageCenter,
  conversations,
  conversationLoading,
  conversationCount,
  hiddenConversationCount,
  unreadMessageCount,
  teamInvitationCount,
  devActiveOrderCount,
  auth,
  currentTitle,
  logout,
} = useWorkbenchShell()
</script>

<template>
  <main
    class="user-workbench"
    :class="{
      'user-workbench--dev': isDevWorkbenchMode,
      'user-workbench--messages': isMessagesRoute,
      'user-workbench--chat': isChatWorkspace,
      'user-workbench--mobile-menu-open': mobileMenuOpen,
      'user-workbench--mode-switching': modeSwitching,
      'user-workbench--icon-shell': usesIconShell,
    }"
    @touchstart.passive="handleWorkbenchTouchStart"
    @touchend.passive="handleWorkbenchTouchEnd"
    @touchcancel.passive="touchTracking = false"
  >
    <button
      v-if="mobileMenuOpen && !usesIconShell"
      class="user-workbench__menu-backdrop"
      type="button"
      aria-label="关闭工作台菜单"
      @click="closeMobileMenu"
    />

    <WorkbenchSidebar
      v-if="!usesIconShell"
      :is-dev-workbench-mode="isDevWorkbenchMode"
      :workbench-mode-key="workbenchModeKey"
      :workbench-brand-title="workbenchBrandTitle"
      :mode-switching="modeSwitching"
      :mode-switch-spinning="modeSwitchSpinning"
      :dev-active-order-count="devActiveOrderCount"
      :visible-menu-groups="visibleMenuGroups"
      :open-group-keys="openGroupKeys"
      :messages-anchor-index="messagesAnchorIndex"
      :team-invitation-count="teamInvitationCount"
      :notifications-menu-item="notificationsMenuItem"
      :messages-route-name="messagesRouteName"
      :conversations="conversations"
      :conversation-loading="conversationLoading"
      :conversation-count="conversationCount"
      :hidden-conversation-count="hiddenConversationCount"
      :unread-message-count="unreadMessageCount"
      :username="auth.username"
      @switch-mode="switchWorkbenchMode"
      @close-menu="closeMobileMenu"
      @toggle-group="toggleGroup"
      @toggle-messages="toggleMessageCenter"
      @open-all-messages="openMessageCenter"
      @navigate="closeMobileMenu"
      @logout="logout"
    />

    <WorkbenchIconRail
      v-if="usesIconShell"
      :is-dev-workbench-mode="isDevWorkbenchMode"
      :unread-count="unreadMessageCount"
      :team-invitation-count="teamInvitationCount"
      @switch-mode="switchWorkbenchMode"
    />

    <section
      class="user-workbench__main"
      :class="{
        'user-workbench__main--chat': isChatWorkspace,
        'user-workbench__main--icon-shell': usesIconShell,
      }"
    >
      <WorkbenchMobileBar
        v-if="!usesIconShell"
        :workbench-mode-key="workbenchModeKey"
        :workbench-brand-title="workbenchBrandTitle"
        :current-title="currentTitle"
        @open-menu="openMobileMenu"
      />

      <div
        class="user-workbench__content"
        :class="{
          'user-workbench__content--chat': isChatWorkspace,
          'user-workbench__content--workspace': usesIconShell && !isChatWorkspace,
        }"
      >
        <RouterView v-slot="{ Component }">
          <Transition name="workbench-page" mode="out-in">
            <component :is="Component" :key="workbenchModeKey" />
          </Transition>
        </RouterView>
      </div>
    </section>
  </main>
</template>

<style scoped src="./../components/workbench/user-workbench-shell.css"></style>
