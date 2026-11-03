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
import { WORKBENCH_PANE_WIDTH_CSS_VAR, useWorkbenchPaneWidth } from '@/composables/useWorkbenchPaneWidth'
import { isWorkbenchChatPage } from '@/shared/workbenchChatRoute'

import WorkbenchIconRail from '@/components/workbench/WorkbenchIconRail.vue'
import WorkbenchMobileBar from '@/components/workbench/WorkbenchMobileBar.vue'
import WorkbenchPageHeader from '@/components/workbench/WorkbenchPageHeader.vue'
import WorkbenchSidebar from '@/components/workbench/WorkbenchSidebar.vue'
import WorkbenchTreeSidebar from '@/components/workbench/WorkbenchTreeSidebar.vue'

const route = useRoute()
const usesIconShell = computed(() =>
  route.matched.some((record) => record.meta.workbenchShell === true),
)
const isChatWorkspace = computed(() =>
  isWorkbenchChatPage(route.name, route.meta, route.query as Record<string, unknown>),
)
/* 「我的需求」按设计稿铺成整块浅灰画布：去掉内容区白纸的描边、圆角与内边距。 */
const isMyRequirementsPage = computed(() => route.name === 'workbench-requirements')

/* 菜单修正稿：用户工作台的非聊天页都保留 220px 导航树（账户 / 系统通知页也不例外）。 */
const showRailTree = computed(
  () => usesIconShell.value && !isChatWorkspace.value && !isDevWorkbenchMode.value,
)

/* 基准稿（积分中心）：内容页统一在顶部挂面包屑 + 标题 + 描述；聊天与积分中心页自己带头。 */
const showShellHeader = computed(
  () =>
    !isChatWorkspace.value &&
    !isDevWorkbenchMode.value &&
    route.name !== 'workbench-points',
)
const shellHeaderCrumbs = computed(() => {
  const crumbs: Array<{ label: string; to?: { name: string } }> = [
    { label: '工作台', to: { name: 'workbench' } },
  ]
  if (activeRailGroup.value) {
    crumbs.push({ label: activeRailGroup.value.label })
  }
  if (currentTitle.value) {
    crumbs.push({ label: currentTitle.value })
  }
  return crumbs
})

const { paneWidth } = useWorkbenchPaneWidth()
const railGroupStyle = computed(() => ({
  [WORKBENCH_PANE_WIDTH_CSS_VAR]: `${paneWidth.value ?? 300}px`,
}))

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
  isMenuItemActive,
  isGroupActive,
  conversations,
  conversationLoading,
  conversationCount,
  hiddenConversationCount,
  unreadMessageCount,
  teamInvitationCount,
  devActiveOrderCount,
  auth,
  currentTitle,
  activeMenuItem,
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
      :class="{
        'user-workbench__main--chat': isChatWorkspace,
        'user-workbench__main--icon-shell': usesIconShell,
        'user-workbench__main--rail-group': showRailTree,
        'user-workbench__main--gray-canvas': isMyRequirementsPage,
      }"
      :style="railGroupStyle"
    >
      <WorkbenchMobileBar
        :workbench-mode-key="workbenchModeKey"
        :workbench-brand-title="workbenchBrandTitle"
        :current-title="currentTitle"
        @open-menu="openMobileMenu"
      />

      <!-- 侧边导航树：一次展示全部分组（基准稿「资产与权益 · 积分中心」的第二栏） -->
      <WorkbenchTreeSidebar
        v-if="showRailTree"
        class="user-workbench__rail-group"
        :groups="visibleMenuGroups"
        :open-group-keys="openGroupKeys"
        :notifications-item="notificationsMenuItem"
        :is-item-active="isMenuItemActive"
        :is-group-active="isGroupActive"
        @toggle-group="toggleGroup"
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
        <div v-if="showShellHeader" class="user-workbench__shell-head">
          <WorkbenchPageHeader
            :title="currentTitle"
            :subtitle="activeMenuItem()?.description ?? ''"
            :breadcrumbs="shellHeaderCrumbs"
          />
        </div>

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
<style scoped src="./../components/workbench/user-workbench-icon-shell.css"></style>
<style scoped src="./../components/workbench/user-workbench-rail-group.css"></style>
