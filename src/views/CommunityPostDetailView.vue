<script setup lang="ts">
import CommunityPostPanel from '@/components/community/CommunityPostPanel.vue'
</script>

<template>
  <main class="community-detail-page">
    <RouterLink class="community-detail-page__back" :to="{ name: 'community' }">
      返回社区
    </RouterLink>
    <CommunityPostPanel />
  </main>
</template>

<style scoped>
.community-detail-page {
  width: min(1280px, calc(100% - 24px));
  margin: 0 auto;
  padding: 24px 0 64px;
}
.community-detail-page__back {
  display: inline-flex;
  margin-bottom: 16px;
  color: var(--73-accent);
  font-size: 13px;
  text-decoration: none;
}
@media (max-width: 640px) {
  .community-detail-page {
    padding-top: 16px;
  }
  .community-detail-page__back {
    min-height: 44px;
    align-items: center;
  }
}
</style>
