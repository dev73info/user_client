<script setup lang="ts">
import { TScrollbar } from 'ui_73info'

import type { RequirementConversation } from '@/api/conversations'
import type { WorkbenchMenuItem, WorkbenchMenuGroup } from '@/shared/workbenchMenu'

import WorkbenchBrandRow from './WorkbenchBrandRow.vue'
import WorkbenchMenuNav from './WorkbenchMenuNav.vue'

/**
 * 工作台侧边栏的框：品牌行 + 整条菜单，常驻（桌面）或抽屉（900px 及以下）。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来。抽屉的位置与滑入动画跟着这个组件搬，
 * 「抽屉打开」这个状态挂在外壳根节点上（`.user-workbench--mobile-menu-open`），
 * 跨了 scoped 边界，所以这里用 `:global()` 指回去——选择器与拆分前逐字一致。
 */
defineProps<{
  isDevWorkbenchMode: boolean
  workbenchModeKey: string
  workbenchBrandTitle: string
  modeSwitching: boolean
  modeSwitchSpinning: boolean
  devActiveOrderCount: number
  visibleMenuGroups: WorkbenchMenuGroup[]
  openGroupKeys: string[]
  messagesAnchorIndex: number
  teamInvitationCount: number
  notificationsMenuItem: WorkbenchMenuItem
  ticketsMenuItem: WorkbenchMenuItem
  messagesRouteName: string
  conversations: RequirementConversation[]
  conversationLoading: boolean
  conversationCount: number
  hiddenConversationCount: number
  unreadMessageCount: number
  username: string
}>()

const emit = defineEmits<{
  (event: 'switch-mode'): void
  (event: 'close-menu'): void
  (event: 'toggle-group', group: WorkbenchMenuGroup): void
  (event: 'toggle-messages'): void
  (event: 'open-all-messages'): void
  (event: 'navigate'): void
  (event: 'logout'): void
}>()
</script>

<template>
  <aside class="user-workbench__aside" aria-label="统一工作台菜单">
    <TScrollbar
      class="app-scrollbar user-workbench__aside-scrollbar"
      max-height="calc(100vh - var(--portal-header-footprint, 98px) - 22px)"
    >
      <div class="user-workbench__aside-inner">
        <WorkbenchBrandRow
          :is-dev-workbench-mode="isDevWorkbenchMode"
          :workbench-mode-key="workbenchModeKey"
          :workbench-brand-title="workbenchBrandTitle"
          :mode-switching="modeSwitching"
          :mode-switch-spinning="modeSwitchSpinning"
          @switch-mode="emit('switch-mode')"
          @close-menu="emit('close-menu')"
        />

        <Transition name="workbench-mode" mode="out-in">
          <WorkbenchMenuNav
            :key="workbenchModeKey"
            :is-dev-workbench-mode="isDevWorkbenchMode"
            :dev-active-order-count="devActiveOrderCount"
            :visible-menu-groups="visibleMenuGroups"
            :open-group-keys="openGroupKeys"
            :messages-anchor-index="messagesAnchorIndex"
            :team-invitation-count="teamInvitationCount"
            :notifications-menu-item="notificationsMenuItem"
            :tickets-menu-item="ticketsMenuItem"
            :messages-route-name="messagesRouteName"
            :conversations="conversations"
            :conversation-loading="conversationLoading"
            :conversation-count="conversationCount"
            :hidden-conversation-count="hiddenConversationCount"
            :unread-message-count="unreadMessageCount"
            :username="username"
            @toggle-group="emit('toggle-group', $event)"
            @toggle-messages="emit('toggle-messages')"
            @open-all-messages="emit('open-all-messages')"
            @navigate="emit('navigate')"
            @logout="emit('logout')"
          />
        </Transition>
      </div>
    </TScrollbar>
  </aside>
</template>

<style scoped>
.user-workbench__aside {
  position: sticky;
  /* 顶栏占位高度由顶栏自己公布（--portal-header-footprint，随断点变化）：
     侧边栏按它做 sticky 偏移与高度，长短页面之间才会停在同一个位置，不再上下跳。 */
  top: var(--portal-header-footprint, 98px);
  align-self: start;
  height: calc(100vh - var(--portal-header-footprint, 98px) - 22px);
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--uw-surface-line);
  border-radius: 22px;
  background: var(--uw-surface);
  box-shadow: var(--uw-surface-shadow);
}

/* 侧边栏内层用纵向 flex，菜单组之间保持固定间距。
   不要改用 flex-grow 撑菜单——菜单是 grid，多出来的高度会把条目间距拉开。 */
.user-workbench__aside-inner {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
  padding: 16px;
}

.user-workbench__aside-scrollbar :deep(.t73-scrollbar__bar) {
  display: none;
}

.user-workbench__aside-scrollbar :deep(.t73-scrollbar__wrap) {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.user-workbench__aside-scrollbar :deep(.t73-scrollbar__wrap::-webkit-scrollbar) {
  display: none;
  width: 0;
  height: 0;
}

@media (max-width: 900px) {
  .user-workbench__aside {
    position: static;
    max-height: none;
  }

  .user-workbench__aside-inner {
    gap: 12px;
  }
}

@media (max-width: 900px) {
  .user-workbench__aside {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 80;
    width: min(84vw, 320px);
    height: auto;
    max-height: none;
    border-radius: 0 22px 22px 0;
    transform: translateX(-104%);
    transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  /* 抽屉打开时滑进来：状态挂在外壳根节点上（跨 scoped 边界，用 :global 指回去） */
  :global(.user-workbench--mobile-menu-open) .user-workbench__aside {
    transform: translateX(0);
  }

  .user-workbench__aside-scrollbar {
    height: 100%;
    max-height: none !important;
  }

  .user-workbench__aside-inner {
    min-height: 100%;
    padding: 16px;
  }
}
</style>
