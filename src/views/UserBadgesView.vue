<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import BadgeWall from '@/components/BadgeWall.vue'

const route = useRoute()
const username = computed(() => String(route.params.username || '').trim())
</script>

<template>
  <main class="user-badges-view">
    <BadgeWall :username="username" public-only />
  </main>
</template>

<style scoped>
.user-badges-view {
  width: min(1120px, calc(100% - 24px));
  margin: 18px auto 36px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--73-accent-soft) 96%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--73-surface-strong) 94%, transparent);
  box-shadow: 0 14px 34px color-mix(in srgb, var(--73-accent) 8%, transparent);
}

@media (max-width: 640px) {
  .user-badges-view {
    width: calc(100% - 16px);
    padding: 14px;
  }
}
</style>
