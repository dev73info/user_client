<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { DataAnalysis } from 'ui_73info'

import type { RequirementConversation } from '@/api/conversations'
import { useWorkbenchMenuRoute } from '@/composables/useWorkbenchMenuRoute'
import {
  devWorkbenchItems,
  MESSAGES_GROUP_KEY,
  overviewItem,
  type WorkbenchMenuItem as WorkbenchMenuItemModel,
  type WorkbenchMenuGroup,
} from '@/shared/workbenchMenu'
import { isMessagesRouteName, menuItemBadgeText, menuItemTo } from '@/shared/workbenchRoutes'

import WorkbenchMenuGroupSection from './WorkbenchMenuGroupSection.vue'
import WorkbenchMenuItem from './WorkbenchMenuItem.vue'
import WorkbenchMessagesSection from './WorkbenchMessagesSection.vue'
import WorkbenchStandaloneSection from './WorkbenchStandaloneSection.vue'

/**
 * 侧边栏的整条菜单：开发者一级条目 / 用户端总览 + 分组 + 消息中心 + 底部三条。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来。菜单内容与判定在 `@/shared/workbenchMenu`（纯数据与纯函数），
 * 这里只按模式排版并把展开状态传下去；外层 `Transition` 的 `workbench-mode-*` 动画跟着这个根节点走。
 */
const props = defineProps<{
  isDevWorkbenchMode: boolean
  /** 「我的接单」角标读数：在途接单数。 */
  devActiveOrderCount: number
  visibleMenuGroups: WorkbenchMenuGroup[]
  /** 已展开的分组 key（消息中心也记在这份列表里）。 */
  openGroupKeys: string[]
  messagesAnchorIndex: number
  teamInvitationCount: number
  notificationsMenuItem: WorkbenchMenuItemModel
  /** 消息中心在当前工作台的那条路由名（用户端 / 开发者端各一条）。 */
  messagesRouteName: string
  conversations: RequirementConversation[]
  conversationLoading: boolean
  conversationCount: number
  hiddenConversationCount: number
  unreadMessageCount: number
  username: string
}>()

const emit = defineEmits<{
  (event: 'toggle-group', group: WorkbenchMenuGroup): void
  (event: 'toggle-messages'): void
  (event: 'open-all-messages'): void
  (event: 'navigate'): void
  (event: 'logout'): void
}>()

const route = useRoute()
const { isItemActive, isOverviewActive } = useWorkbenchMenuRoute()

const isMessagesRoute = computed(() => isMessagesRouteName(route.name))
const activeRequirementId = computed(() => {
  const requirementId = route.query.requirement_id
  return typeof requirementId === 'string' ? requirementId : ''
})
const messagesOpen = computed(() => props.openGroupKeys.includes(MESSAGES_GROUP_KEY))

function isGroupActive(group: WorkbenchMenuGroup) {
  return group.items.some((item) => isItemActive(item))
}
</script>

<template>
  <nav class="user-workbench__menu">
    <template v-if="props.isDevWorkbenchMode">
      <!-- 开发者菜单不分小标题，一级条目直接平铺；角标给「我的接单」 -->
      <WorkbenchMenuItem
        v-for="item in devWorkbenchItems"
        :key="item.name"
        :label="item.label"
        :icon="item.icon"
        :to="menuItemTo(item)"
        :active="isItemActive(item)"
        :badge="menuItemBadgeText(item, props.devActiveOrderCount)"
        @navigate="emit('navigate')"
      />
    </template>

    <!-- 开发者模式下整块换成开发者菜单，用户菜单不出现在侧边栏 -->
    <WorkbenchMenuItem
      v-if="!props.isDevWorkbenchMode"
      :label="overviewItem.label"
      :icon="DataAnalysis"
      :to="menuItemTo(overviewItem)"
      :active="isOverviewActive()"
      @navigate="emit('navigate')"
    />

    <!-- 消息中心是一级条目，两端各一份：用户端的插在分组之前（与图标栏把「消息」排第一一致），
         开发者端的插在最后一个分组之后。`messagesAnchorIndex < 0` 表示「所有分组之前」。 -->
    <WorkbenchMessagesSection
      v-if="props.messagesAnchorIndex < 0"
      :open="messagesOpen"
      :active="isMessagesRoute"
      :conversations="props.conversations"
      :loading="props.conversationLoading"
      :total-count="props.conversationCount"
      :hidden-count="props.hiddenConversationCount"
      :unread-message-count="props.unreadMessageCount"
      :route-name="props.messagesRouteName"
      :is-messages-route="isMessagesRoute"
      :active-requirement-id="activeRequirementId"
      :username="props.username"
      @toggle="emit('toggle-messages')"
      @open-all="emit('open-all-messages')"
      @navigate="emit('navigate')"
    />

    <template v-for="(group, index) in props.visibleMenuGroups" :key="group.key">
      <WorkbenchMenuGroupSection
        :group="group"
        :open="props.openGroupKeys.includes(group.key)"
        :active="isGroupActive(group)"
        :team-invitation-count="props.teamInvitationCount"
        @toggle="emit('toggle-group', group)"
        @navigate="emit('navigate')"
      />

      <WorkbenchMessagesSection
        v-if="index === props.messagesAnchorIndex"
        :open="messagesOpen"
        :active="isMessagesRoute"
        :conversations="props.conversations"
        :loading="props.conversationLoading"
        :total-count="props.conversationCount"
        :hidden-count="props.hiddenConversationCount"
        :unread-message-count="props.unreadMessageCount"
        :route-name="props.messagesRouteName"
        :is-messages-route="isMessagesRoute"
        :active-requirement-id="activeRequirementId"
        :username="props.username"
        @toggle="emit('toggle-messages')"
        @open-all="emit('open-all-messages')"
        @navigate="emit('navigate')"
      />
    </template>

    <WorkbenchStandaloneSection
      :notifications-menu-item="props.notificationsMenuItem"
      @navigate="emit('navigate')"
      @logout="emit('logout')"
    />
  </nav>
</template>

<style scoped>
.user-workbench__menu {
  display: grid;
  gap: 6px;
}

/* 侧栏菜单整块按模式 key 做 out-in，避免条目瞬间替换 */
.workbench-mode-enter-active,
.workbench-mode-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.workbench-mode-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.workbench-mode-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 900px) {
  .user-workbench__menu {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .workbench-mode-enter-active,
  .workbench-mode-leave-active {
    transition: none;
  }
}
</style>
