<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router'

/**
 * 侧边栏一条子项（`.user-workbench__submenu-link`）：分组里的页面与消息中心里的会话共用。
 *
 * 两种形态只在第二行与链接类名上有差别——分组子项的第二行说明默认收起、悬浮 / 当前页才展开
 * （拆分前靠 `.user-workbench__submenu:not(...--messages)` 的祖先前缀判定，跨组件后够不到，
 * 改成会话形态自己的修饰类），其余盒模型、悬浮态与省略号规则完全一致。
 */
const props = defineProps<{
  to: RouteLocationRaw
  label: string
  /** group = 分组子项；conversation = 消息中心里的会话行。 */
  variant?: 'group' | 'conversation'
  active?: boolean
  /** 第二行说明：分组子项几乎用不到，会话行是「对方 · 最近时间」。 */
  meta?: string
  /** 行尾的未读小标（团队邀请数）。 */
  badge?: string
  /** 会话行标题右侧的未读数（0 不传）。 */
  unreadText?: string
  unreadTitle?: string
}>()

const emit = defineEmits<{
  (event: 'navigate'): void
}>()
</script>

<template>
  <RouterLink
    class="user-workbench__submenu-link"
    :class="{
      active,
      'user-workbench__conversation-link': props.variant === 'conversation',
    }"
    :to="to"
    @click="emit('navigate')"
  >
    <span v-if="props.variant === 'conversation'" class="user-workbench__conversation-title">
      {{ label }}
      <em v-if="unreadText" class="user-workbench__conversation-unread" :title="unreadTitle">
        {{ unreadText }}
      </em>
    </span>
    <span v-else>{{ label }}</span>
    <span v-if="badge" class="user-workbench__submenu-badge">{{ badge }}</span>
    <small v-if="meta">{{ meta }}</small>
  </RouterLink>
</template>

<style scoped>
.user-workbench__submenu-link {
  position: relative;
  display: grid;
  gap: 2px;
  width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  align-content: center;
  color: var(--uw-ink);
  font: inherit;
  text-align: left;
  text-decoration: none;
  transition:
    background 180ms ease,
    color 180ms ease;
}

.user-workbench__submenu-link span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}

.user-workbench__submenu-link small {
  display: block;
  margin-top: 3px;
  color: var(--73-ink-muted);
  font-size: 11px;
  line-height: 1.35;
}

.user-workbench__submenu-link span.user-workbench__submenu-badge {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--uw-badge);
  color: var(--73-ink-inverse);
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  overflow: visible;
  white-space: nowrap;
}

/* 会话行标题左侧的未读小标（数字，胶囊），会话被打开标记已读后由事件刷新消失 */
.user-workbench__conversation-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.user-workbench__conversation-unread {
  flex: 0 0 auto;
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--uw-badge-unread);
  color: var(--73-ink-inverse);
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 18px;
  text-align: center;
}

.user-workbench__submenu-link:hover,
.user-workbench__submenu-link.active {
  background: var(--uw-surface-hover);
  color: var(--uw-blue-ink);
}

.user-workbench__conversation-link small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 分组子项的说明行：默认收起，悬浮 / 当前页才展开（会话行始终显示第二行） */
.user-workbench__submenu-link:not(.user-workbench__conversation-link) small {
  max-height: 0;
  margin-top: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    max-height 180ms ease,
    margin-top 180ms ease,
    opacity 160ms ease;
}

.user-workbench__submenu-link:not(.user-workbench__conversation-link):hover small,
.user-workbench__submenu-link:not(.user-workbench__conversation-link).active small {
  max-height: 34px;
  margin-top: 3px;
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .user-workbench__submenu-link,
  .user-workbench__submenu-link:not(.user-workbench__conversation-link) small {
    transition: none;
  }
}
</style>
