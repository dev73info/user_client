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

import {
  WORKBENCH_PANE_WIDTH_CSS_VAR,
  useWorkbenchPaneWidth,
} from '@/composables/useWorkbenchPaneWidth'
import { useWorkbenchShell } from '@/composables/useWorkbenchShell'
import { isWorkbenchChatPage } from '@/shared/workbenchChatRoute'

import WorkbenchIconRail from '@/components/workbench/WorkbenchIconRail.vue'
import WorkbenchMobileBar from '@/components/workbench/WorkbenchMobileBar.vue'
import WorkbenchRailGroupNav from '@/components/workbench/WorkbenchRailGroupNav.vue'
import WorkbenchSidebar from '@/components/workbench/WorkbenchSidebar.vue'

const route = useRoute()
const usesIconShell = computed(() =>
  route.matched.some((record) => record.meta.workbenchShell === true),
)
const isChatWorkspace = computed(() =>
  isWorkbenchChatPage(route.name, route.meta, route.query as Record<string, unknown>),
)
/* 「我的需求」按设计稿铺成整块浅灰画布：去掉内容区白纸的描边、圆角与内边距。 */
const isMyRequirementsPage = computed(() => route.name === 'workbench-requirements')

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
  realnameApproved,
  openGroupKeys,
  visibleMenuGroups,
  messagesAnchorIndex,
  toggleGroup,
  toggleMessageCenter,
  openMessageCenter,
  activeRailGroup,
  isRailGroupItemActive,
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

/* 中栏只在分组页出现：列出当前分组的页面；个人主页等非分组页不占一列。 */
const showRailGroupList = computed(() => Boolean(activeRailGroup.value) && !isChatWorkspace.value)

/* 分组菜单与消息中心共用中栏宽度：同一份本机偏好，切页不跳宽。 */
const RAIL_GROUP_WIDTH_MIN = 220
const RAIL_GROUP_WIDTH_MAX = 520
const RAIL_GROUP_WIDTH_DEFAULT = 360
const { paneWidth } = useWorkbenchPaneWidth()
const railGroupWidth = computed(() =>
  Math.round(
    Math.min(
      RAIL_GROUP_WIDTH_MAX,
      Math.max(RAIL_GROUP_WIDTH_MIN, paneWidth.value ?? RAIL_GROUP_WIDTH_DEFAULT),
    ),
  ),
)
const railGroupStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  if (showRailGroupList.value) {
    style[WORKBENCH_PANE_WIDTH_CSS_VAR] = `${railGroupWidth.value}px`
  }
  return style
})
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
      v-if="mobileMenuOpen"
      class="user-workbench__menu-backdrop"
      type="button"
      aria-label="关闭工作台菜单"
      @click="closeMobileMenu"
    />

    <WorkbenchSidebar
      :class="{ 'user-workbench__aside--mobile-only': usesIconShell }"
      :open="mobileMenuOpen"
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
      :realname-approved="realnameApproved"
      :username="auth.username"
      @switch-mode="switchWorkbenchMode"
    />

    <section
      class="user-workbench__main"
      :style="railGroupStyle"
      :class="{
        'user-workbench__main--chat': isChatWorkspace,
        'user-workbench__main--icon-shell': usesIconShell,
        'user-workbench__main--rail-group': showRailGroupList,
        'user-workbench__main--gray-canvas': isMyRequirementsPage,
      }"
    >
      <WorkbenchMobileBar
        :workbench-mode-key="workbenchModeKey"
        :workbench-brand-title="workbenchBrandTitle"
        :current-title="currentTitle"
        @open-menu="openMobileMenu"
      />

      <!-- 分组入口：中栏列组内页面，右栏仍是 RouterView 的内容区（与消息中心同一骨架） -->
      <WorkbenchRailGroupNav
        v-if="showRailGroupList"
        class="user-workbench__rail-group"
        :group="activeRailGroup!"
        :is-item-active="isRailGroupItemActive"
        @navigate="closeMobileMenu"
      />

      <div
        class="user-workbench__content"
        :class="{
          'user-workbench__content--chat': isChatWorkspace,
          'user-workbench__content--workspace': usesIconShell && !isChatWorkspace,
          'user-workbench__content--gray-canvas': isMyRequirementsPage,
        }"
      >
        <RouterView v-slot="{ Component }">
          <Transition name="workbench-page" mode="out-in">
            <div class="user-workbench__route" :key="workbenchModeKey">
              <component :is="Component" />
            </div>
          </Transition>
        </RouterView>
      </div>
    </section>
  </main>
</template>

<style scoped src="./../components/workbench/user-workbench-shell.css"></style>
<style scoped src="./../components/workbench/user-workbench-community.css"></style>
<style scoped src="./../components/workbench/user-workbench-icon-shell.css"></style>
<style scoped src="./../components/workbench/user-workbench-rail-group.css"></style>
