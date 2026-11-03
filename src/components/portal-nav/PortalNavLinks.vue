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
  gap: 4px;
  justify-content: flex-start;
  width: auto;
  min-width: 0;
}

.portal-nav__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  height: 56px;
  padding: 0 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  color: var(--ptn-ink-body);
  text-decoration: none;
  background: transparent;
  transition:
    color 140ms ease,
    border-color 140ms ease;
}

.portal-nav__link:hover {
  color: var(--ptn-ink-strong);
}

.portal-nav__link.active {
  color: var(--ptn-accent-ink);
  border-bottom-color: var(--ptn-accent-brand);
  font-weight: 600;
}

@media (max-width: 1180px) {
  .portal-nav__link {
    padding: 0 8px;
  }
}

@media (max-width: 900px) {
  .portal-nav__link {
    height: 40px;
  }
}

@media (max-width: 640px) {
  .portal-nav {
    width: 100%;
    flex-wrap: wrap;
  }
}
</style>
