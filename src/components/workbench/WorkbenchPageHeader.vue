<script setup lang="ts">
/**
 * 工作台内容页的页头（基准稿：积分中心）。
 *
 * 面包屑 → 标题 → 副标题，右侧是页面动作槽；底边一条分隔线。
 * 各菜单页统一用它，避免每个页面各写一套标题样式。
 */
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'

defineProps<{
  title: string
  subtitle?: string
  breadcrumbs?: Array<{ label: string; to?: RouteLocationRaw }>
}>()
</script>

<template>
  <header class="workbench-page-header">
    <div class="workbench-page-header__main">
      <nav v-if="breadcrumbs?.length" class="workbench-page-header__crumbs" aria-label="面包屑">
        <template v-for="(crumb, index) in breadcrumbs" :key="`${crumb.label}-${index}`">
          <RouterLink v-if="crumb.to" :to="crumb.to" class="workbench-page-header__crumb">
            {{ crumb.label }}
          </RouterLink>
          <span v-else class="workbench-page-header__crumb">{{ crumb.label }}</span>
          <span v-if="index < breadcrumbs.length - 1" class="workbench-page-header__sep">›</span>
        </template>
      </nav>
      <h1>{{ title }}</h1>
      <p v-if="subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="workbench-page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.workbench-page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--73-border);
}

.workbench-page-header__crumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  color: var(--73-ink-muted);
  font-size: 12px;
  font-weight: 500;
}

.workbench-page-header__crumb {
  color: inherit;
  text-decoration: none;
}

a.workbench-page-header__crumb:hover {
  color: var(--73-ink-soft);
}

.workbench-page-header__crumbs .workbench-page-header__crumb:last-of-type {
  color: var(--73-ink);
  font-weight: 600;
}

.workbench-page-header__sep {
  color: var(--73-ink-placeholder);
}

.workbench-page-header__main h1 {
  margin: 0;
  color: var(--73-ink);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.35;
}

.workbench-page-header__main p {
  margin: 4px 0 0;
  color: var(--73-ink-muted);
  font-size: 12px;
}

.workbench-page-header__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
