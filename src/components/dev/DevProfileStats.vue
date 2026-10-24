<script setup lang="ts">
/**
 * 开发者公开主页的三项读数：资源项目、获得点赞、涉及平台。
 *
 * 口径在 `useDevProfileData` 里算好（资源数 / 点赞合计 / 平台去重），这里只画格子。
 */
defineProps<{
  stats: {
    resourceCount: number
    totalLikes: number
    platforms: number
  }
}>()
</script>

<template>
  <section class="dev-profile__stats">
    <div class="dev-profile__stat">
      <strong>{{ stats.resourceCount }}</strong>
      <span>资源项目</span>
    </div>
    <div class="dev-profile__stat">
      <strong>{{ stats.totalLikes }}</strong>
      <span>获得点赞</span>
    </div>
    <div class="dev-profile__stat">
      <strong>{{ stats.platforms }}</strong>
      <span>涉及平台</span>
    </div>
  </section>
</template>

<style>
.dev-profile__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.dev-profile__stat {
  position: relative;
  overflow: hidden;
  padding: 20px 16px;
  border: 1px solid var(--dp-border-soft);
  border-radius: 12px;
  background: var(--dp-white-92);
  text-align: center;
  display: grid;
  gap: 4px;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.dev-profile__stat::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: linear-gradient(90deg, var(--dp-accent), var(--dp-accent-sky));
  opacity: 0.72;
}

.dev-profile__stat:hover {
  border-color: var(--dp-ring-accent);
  box-shadow: 0 8px 20px var(--dp-shadow-accent-08);
  transform: translateY(-2px);
}

.dev-profile__stat strong {
  font-size: 28px;
  font-weight: 700;
  color: var(--dp-ink);
}

.dev-profile__stat span {
  font-size: 13px;
  color: var(--dp-text-muted);
}

@media (max-width: 640px) {
  .dev-profile__stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
