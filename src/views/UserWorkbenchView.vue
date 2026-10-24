<script setup lang="ts">
/**
 * 工作台外壳（`/workbench/*` 与开发者工作台 `/workbench/developer/*` 共用的那一层）。
 *
 * 这一页只负责排版与组合：
 * - 模式（用户 / 开发者）、菜单、会话与角标、移动端抽屉 → `useWorkbenchShell`；
 * - 侧边栏（品牌行 + 整条菜单）→ `components/workbench/WorkbenchSidebar`；
 * - 移动端顶栏 → `components/workbench/WorkbenchMobileBar`；
 * - 外壳色板 `--uw-*` → `styles/workbench-shell.css`；
 * - 菜单数据与高亮判定 → `@/shared/workbenchMenu`，文案与时间格式化 → `@/shared/workbenchDisplay`。
 */
import { useWorkbenchShell } from '@/composables/useWorkbenchShell'

import WorkbenchMobileBar from '@/components/workbench/WorkbenchMobileBar.vue'
import WorkbenchSidebar from '@/components/workbench/WorkbenchSidebar.vue'

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
      'user-workbench--mobile-menu-open': mobileMenuOpen,
      'user-workbench--mode-switching': modeSwitching,
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

    <section class="user-workbench__main">
      <WorkbenchMobileBar
        :workbench-mode-key="workbenchModeKey"
        :workbench-brand-title="workbenchBrandTitle"
        :current-title="currentTitle"
        @open-menu="openMobileMenu"
      />

      <div class="user-workbench__content">
        <RouterView v-slot="{ Component }">
          <Transition name="workbench-page" mode="out-in">
            <component :is="Component" :key="workbenchModeKey" />
          </Transition>
        </RouterView>
      </div>
    </section>
  </main>
</template>

<style scoped>
.user-workbench {
  width: min(1280px, calc(100% - 24px));
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, 252px) minmax(0, 1fr);
  gap: 14px;
  /* 顶栏已占位，工作台贴顶栏下沿即可，不必再垫一整段空白 */
  margin: 0 auto;
}

.user-workbench__menu-backdrop {
  display: none;
}

.user-workbench__menu-backdrop {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.user-workbench__main {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 12px;
}

.user-workbench__content {
  min-width: 0;
  /* 与侧边栏底部留白（sticky aside 顶部 98 + max-height 100vh-120 => 底部 22px）保持一致 */
  padding-bottom: 22px;
}

.user-workbench__content :deep(.page-shell) {
  width: 100%;
  min-height: 0;
  align-content: start;
  margin: 0;
  padding: 0;
  /* 纵向节奏与开发者侧的 .dev-page 对齐：两侧页面在同一个外壳里，行距不能一宽一窄 */
  gap: 16px;
}

.user-workbench__content :deep(.portal-page) {
  width: 100%;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 16px;
  margin: 0;
  padding: 0;
}

/* 面板外观（描边 / 底色 / 阴影）与内边距、圆角都归页面自己的统一层管：
   - 用户工作台侧 .wallet-section 见 profile.css（24px 内边距 / 22px 圆角），读数条是 22px，两者对齐；
   - 开发者侧 .dev-surface-card 见 dev-base.css。
   外壳曾经把工作台里的面板一律压成 18px 圆角 + 18px 内边距，于是「顶部读数条 22px 圆角、下面的面板 18px」，
   面板里的标题也不再与读数左对齐；同一套页面从别的入口进来又换一种外观。
   现在外壳只负责把页面根节点收进内容列，不再改写卡片几何。 */

/* 还没换成 .wallet-section 的旧门户页仍用 .portal-page__panel，由外壳补同一档几何值 */
.user-workbench__content :deep(.portal-page__panel) {
  padding: 24px;
  border-radius: 22px;
}

.user-workbench__content :deep(.portal-page__stats) {
  gap: 12px;
}

.user-workbench__content :deep(.portal-page__stat-card) {
  padding: 16px;
  border-radius: 16px;
}

.user-workbench__content :deep(.portal-page__stat-card strong) {
  margin-bottom: 0;
  font-size: 28px;
  line-height: 1;
}

.user-workbench__content :deep(.profile-page-head) {
  display: none;
}

.user-workbench__content :deep(.invite-view),
.user-workbench__content :deep(.badges-view) {
  width: 100%;
  margin: 0;
}

/* 开发者页在两种模式下是同一套外观：.dev-page / .dev-grid / .dev-surface-card 的间距、
   圆角、内边距与阴影都由 dev-base.css 统一规定，外壳不再用 :deep 改写它们。
   外壳曾经把卡片压成 18px 圆角 + 14px 内边距、栅格间距压成 16px，
   结果是「顶部读数条 24px 圆角、下面的卡片 18px」，标题左右也不再与读数对齐；
   而且同一页从 /dev 旧入口进来时又是 24px，同一套页面出现两种外观。 */
.user-workbench__content :deep(.dev-page) {
  width: 100%;
  margin: 0;
}

/* 主内容区随工作台模式一起淡入淡出 */
.workbench-page-enter-active,
.workbench-page-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.workbench-page-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.workbench-page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 900px) {
  .user-workbench {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .user-workbench {
    width: 100%;
    margin: 0;
    padding: 0;
  }

  .user-workbench__menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: block;
    background: var(--uw-backdrop);
    backdrop-filter: blur(2px);
  }

  .user-workbench__main {
    padding: 0 8px;
  }

  /* 消息页不再隐藏侧边栏与顶部栏：顶部栏被 unified-top-card.css 用 !important 强制保留，
     若只隐藏侧边栏，「菜单」按钮点开就只剩遮罩、抽屉不出现（移动端曾出现的白屏+遮罩 bug）。 */
  .user-workbench--messages {
    margin-top: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .workbench-page-enter-active,
  .workbench-page-leave-active {
    transition: none;
  }
}
</style>
