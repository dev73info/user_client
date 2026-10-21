<script setup lang="ts">
import { computed, type Component } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'

import { ArrowDown, TIcon } from 'ui_73info'

/**
 * 侧边栏的一条一级条目：链接、折叠组头、退出按钮三种形态共用一套版式。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来。三种形态在拆分前是同一组选择器
 * （`.user-workbench__menu-link` / `.user-workbench__menu-group-head`），渲染的标签不同、
 * 版式与状态（左侧强调条、图标底、角标、箭头）完全一致，所以收在一个组件里，
 * 免得「一级条目」的样式在侧边栏三处各写一遍。
 *
 * 折叠组的高亮（`.user-workbench__menu-group.active > .user-workbench__menu-group-head`）
 * 拆分后跨了组件边界，scoped 样式够不到祖先前缀，改由 `active` / `open` 两个入参
 * 在这条组头自己身上加修饰类，取值口径不变。
 */
const props = defineProps<{
  label: string
  /** 链接目标：有值时渲染 RouterLink（一级条目）。 */
  to?: RouteLocationRaw
  /** link = 一级条目；head = 折叠组头（带箭头与 aria-expanded）；logout = 退出登录按钮。 */
  variant?: 'link' | 'head' | 'logout'
  active?: boolean
  /** 折叠组展开态：只影响组头的箭头方向，与 `:aria-expanded` 同源。 */
  open?: boolean
  /** 行尾角标读数；空串表示不显示（计数为 0 时不挂一条空数字）。 */
  badge?: string
  /** 角标的悬浮说明（如「3 条未读消息」）。 */
  badgeTitle?: string
  icon?: Component
}>()

const emit = defineEmits<{
  (event: 'navigate'): void
  (event: 'toggle'): void
}>()

const variant = computed(() => props.variant ?? 'link')
</script>

<template>
  <RouterLink
    v-if="variant === 'link' && to"
    class="user-workbench__menu-link user-workbench__menu-link--root"
    :class="{ active: active, 'user-workbench__menu-link--badged': Boolean(badge) }"
    :to="to"
    @click="emit('navigate')"
  >
    <span v-if="icon" class="user-workbench__menu-icon">
      <TIcon>
        <component :is="icon" />
      </TIcon>
    </span>
    <span>
      <strong>{{ label }}</strong>
    </span>
    <span v-if="badge" class="user-workbench__menu-badge">{{ badge }}</span>
  </RouterLink>

  <button
    v-else-if="variant === 'logout'"
    class="user-workbench__menu-link user-workbench__menu-link--root user-workbench__menu-link--logout"
    type="button"
    @click="emit('navigate')"
  >
    <span class="user-workbench__menu-icon">
      <TIcon>
        <component :is="icon" />
      </TIcon>
    </span>
    <span>
      <strong>{{ label }}</strong>
    </span>
  </button>

  <button
    v-else
    class="user-workbench__menu-group-head"
    :class="{
      'user-workbench__menu-group-head--active': active,
      'user-workbench__menu-group-head--open': open,
    }"
    type="button"
    :aria-expanded="open"
    @click="emit('toggle')"
  >
    <span v-if="icon" class="user-workbench__menu-icon">
      <TIcon>
        <component :is="icon" />
      </TIcon>
    </span>
    <!-- 组头的角标跟在标题右侧（与标题同排），一级条目的角标单独占一列 -->
    <span v-if="badge" class="user-workbench__menu-label">
      <strong>{{ label }}</strong>
      <span class="user-workbench__menu-badge" :title="badgeTitle">{{ badge }}</span>
    </span>
    <strong v-else>{{ label }}</strong>
    <TIcon class="user-workbench__menu-arrow">
      <ArrowDown />
    </TIcon>
  </button>
</template>

<style scoped>
/* 一级条目与折叠组头同版式：图标 / 标题 / 角标（或箭头）三列。
   色值全部走外壳色板（`--uw-*`，见 src/styles/workbench-shell.css）与组件库令牌，
   拆出来时没有改任何一个取值。 */
.user-workbench__menu-link,
.user-workbench__menu-group-head {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 46px;
  padding: 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--uw-ink);
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  overflow: hidden;
  transition:
    background 180ms ease,
    box-shadow 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

/* 行首那条强调条：默认缩成一条细线，当前页 / 悬浮时才竖起来。 */
.user-workbench__menu-link::before,
.user-workbench__menu-group-head::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 999px;
  background: var(--uw-blue);
  opacity: 0;
  transform: scaleY(0.45);
  transform-origin: center;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.user-workbench__menu-link--root {
  grid-template-columns: auto minmax(0, 1fr);
}

/* 带角标的一级条目多占一列：图标 / 标题 / 角标 */
.user-workbench__menu-link--root.user-workbench__menu-link--badged {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

/* 退出登录：与其它一级条目同版式，用危险色区分动作 */
.user-workbench__menu-link--logout {
  color: var(--uw-danger);
}

.user-workbench__menu-link--logout .user-workbench__menu-icon {
  background: var(--uw-danger-wash);
  color: var(--uw-danger);
}

.user-workbench__menu-link--logout:hover {
  background: var(--uw-danger-wash-hover);
  color: var(--uw-danger-strong);
  box-shadow: inset 0 0 0 1px var(--uw-danger-ring);
}

.user-workbench__menu-link--logout:hover .user-workbench__menu-icon {
  background: var(--uw-danger-wash-strong);
  color: var(--uw-danger-strong);
}

.user-workbench__menu-link--logout::before {
  background: var(--uw-danger);
}

/* 菜单角标：一级条目与折叠组头共用，口径与子菜单角标一致（红底白字） */
.user-workbench__menu-badge {
  display: inline-flex;
  flex: 0 0 auto;
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
  font-variant-numeric: tabular-nums;
}

/* 折叠组头里的标题 + 角标：同排，标题被挤时先截断 */
.user-workbench__menu-label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.user-workbench__menu-link:hover,
.user-workbench__menu-group-head:hover,
.user-workbench__menu-link.active,
.user-workbench__menu-group-head--active {
  background: var(--uw-blue-wash-strong);
  color: var(--uw-blue-ink);
  box-shadow: inset 0 0 0 1px var(--uw-blue-ring);
}

.user-workbench__menu-link:hover,
.user-workbench__menu-group-head:hover {
  transform: translateX(2px);
}

.user-workbench__menu-link.active::before,
.user-workbench__menu-group-head--active::before {
  opacity: 1;
  transform: scaleY(1);
}

.user-workbench__menu-icon {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 11px;
  background: var(--uw-blue-fill-soft);
  color: var(--uw-blue);
  transition:
    background 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

.user-workbench__menu-link:hover .user-workbench__menu-icon,
.user-workbench__menu-group-head:hover .user-workbench__menu-icon,
.user-workbench__menu-link.active .user-workbench__menu-icon,
.user-workbench__menu-group-head--active .user-workbench__menu-icon {
  background: var(--uw-blue-icon-active);
  color: var(--uw-blue-ink);
  transform: scale(1.04);
}

.user-workbench__menu-link strong,
.user-workbench__menu-group-head strong {
  display: block;
  font-size: 14px;
  line-height: 1.25;
}

.user-workbench__menu-link small {
  display: block;
  margin-top: 3px;
  color: var(--73-ink-muted);
  font-size: 11px;
  line-height: 1.35;
}

.user-workbench__menu-arrow {
  color: var(--73-ink-placeholder);
  transition:
    color 180ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.user-workbench__menu-group-head:hover .user-workbench__menu-arrow,
.user-workbench__menu-group-head--active .user-workbench__menu-arrow {
  color: var(--uw-blue);
}

.user-workbench__menu-group-head--open .user-workbench__menu-arrow {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .user-workbench__menu-link,
  .user-workbench__menu-group-head,
  .user-workbench__menu-icon,
  .user-workbench__menu-arrow {
    transition: none;
  }

  .user-workbench__menu-link:hover,
  .user-workbench__menu-group-head:hover,
  .user-workbench__menu-link:hover .user-workbench__menu-icon,
  .user-workbench__menu-group-head:hover .user-workbench__menu-icon,
  .user-workbench__menu-link.active .user-workbench__menu-icon,
  .user-workbench__menu-group-head--active .user-workbench__menu-icon {
    transform: none;
  }
}
</style>
