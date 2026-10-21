<script setup lang="ts">
import { ChatDotRound } from 'ui_73info'

import type { RequirementConversation } from '@/api/conversations'
import { conversationMeta, partnerLabel, unreadCountText } from '@/shared/workbenchDisplay'
import { conversationLink, isConversationRouteActive } from '@/shared/workbenchRoutes'

import WorkbenchMenuItem from './WorkbenchMenuItem.vue'
import WorkbenchSubmenu from './WorkbenchSubmenu.vue'
import WorkbenchSubmenuLink from './WorkbenchSubmenuLink.vue'

/**
 * 侧边栏的「消息中心」一档：组头带未读角标，展开是最近几条会话。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来。它夹在分组之间、两端各只渲染一次，
 * 展开状态与其它分组记在同一份列表里（`messages` 这个 key），因此这里只收 `open`。
 */
const props = defineProps<{
  open: boolean
  active: boolean
  /** 最近几条会话（外壳已按时间排好并截断）。 */
  conversations: RequirementConversation[]
  loading: boolean
  /** 会话总数与其中没列出来的条数：「查看全部消息」只在有剩余时出现。 */
  totalCount: number
  hiddenCount: number
  unreadMessageCount: number
  /** 消息中心在当前工作台的那条路由名（用户端 / 开发者端各一条）。 */
  routeName: string
  isMessagesRoute: boolean
  /** 地址栏里的 `?requirement_id=`：会话行据此判高亮。 */
  activeRequirementId: string
  username: string
}>()

const emit = defineEmits<{
  (event: 'toggle'): void
  (event: 'open-all'): void
  (event: 'navigate'): void
}>()
</script>

<template>
  <section class="user-workbench__menu-group" :class="{ active: props.active, open: props.open }">
    <WorkbenchMenuItem
      variant="head"
      label="消息中心"
      :icon="ChatDotRound"
      :open="props.open"
      :active="props.active"
      :badge="props.unreadMessageCount > 0 ? unreadCountText(props.unreadMessageCount) : ''"
      :badge-title="`${props.unreadMessageCount} 条未读消息`"
      @toggle="emit('toggle')"
    />

    <WorkbenchSubmenu variant="messages" :open="props.open">
      <WorkbenchSubmenuLink
        v-for="item in props.conversations"
        :key="item.conversation_id"
        variant="conversation"
        :to="conversationLink(props.routeName, item.requirement_id)"
        :label="item.requirement_title || item.requirement_id"
        :active="
          isConversationRouteActive(
            item.requirement_id,
            props.activeRequirementId,
            props.isMessagesRoute,
          )
        "
        :meta="`${partnerLabel(item, props.username)} · ${conversationMeta(item)}`"
        :unread-text="item.unread_count > 0 ? unreadCountText(item.unread_count) : ''"
        :unread-title="`${item.unread_count} 条未读消息`"
        @navigate="emit('navigate')"
      />
      <button
        v-if="props.hiddenCount > 0"
        class="user-workbench__submenu-more"
        type="button"
        @click="emit('open-all')"
      >
        查看全部消息
      </button>
      <span v-if="!props.loading && props.totalCount === 0" class="user-workbench__submenu-empty"
        >暂无会话</span
      >
      <span v-else-if="props.loading" class="user-workbench__submenu-empty">同步会话中</span>
    </WorkbenchSubmenu>
  </section>
</template>

<style scoped>
.user-workbench__menu-group {
  display: grid;
  gap: 6px;
}

/* 「查看全部消息」：子菜单最下面一条，与子项同宽 */
.user-workbench__submenu-more {
  width: 100%;
  min-height: 34px;
  border: 0;
  border-radius: 10px;
  background: var(--uw-blue-wash-soft);
  color: var(--uw-blue);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.user-workbench__submenu-more:hover {
  background: var(--uw-blue-fill-hover);
}

.user-workbench__submenu-empty {
  padding: 9px 10px;
  color: var(--73-ink-placeholder);
  font-size: 12px;
}
</style>
