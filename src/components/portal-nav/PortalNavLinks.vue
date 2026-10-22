<script setup lang="ts">
import type { HeaderLink } from '@/composables/usePortalTopNavNav'

defineProps<{ links: HeaderLink[] }>()
</script>

<template>
  <nav class="portal-nav">
    <template v-for="link in links" :key="link.label">
      <RouterLink
        v-if="link.to"
        :to="link.to"
        active-class=""
        exact-active-class=""
        class="portal-nav__link"
        :class="{ active: link.active }"
      >
        {{ link.label }}
      </RouterLink>
      <a v-else :href="link.href || '#'" class="portal-nav__link">{{ link.label }}</a>
    </template>
  </nav>
</template>

<style scoped>
.portal-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-start;
  width: 100%;
  min-width: 0;
}

.portal-nav__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 0;
  min-width: max-content;
  border: 0;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  color: var(--ptn-ink-body);
  text-decoration: none;
  background: transparent;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    transform 160ms ease;
}

.portal-nav__link:hover {
  color: var(--ptn-accent-ink);
}

/* 悬停与选中都只靠字色区分，不再出现浅蓝胶囊底 */
.portal-nav__link.active {
  color: var(--ptn-accent-ink);
  background: transparent;
}

/* 与顶栏同一档：中窄屏收一号内边距，把宽度还给工具栏 */
@media (max-width: 1180px) {
  .portal-nav__link {
    padding: 9px 8px;
  }
}

@media (max-width: 640px) {
  .portal-nav {
    width: 100%;
    flex-wrap: wrap;
  }
}
</style>
