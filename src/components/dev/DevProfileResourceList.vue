<script setup lang="ts">
/**
 * 公开资源列表：卡片网格与空态。
 *
 * 卡片数据由 `useDevProfilePage` 折成 `DevProfileResourceCard`（封面失败回退、点赞数都算好），
 * 这里只发开工 / 封面加载失败两个动作，跳转落点在页面。
 */
import type { DevProfileResourceCard } from '@/composables/useDevProfilePage'

defineProps<{
  cards: DevProfileResourceCard[]
  count: number
}>()

const emit = defineEmits<{
  open: [resourceId: number]
  'cover-error': [resourceId: number]
}>()
</script>

<template>
  <section class="dev-profile__resources">
    <div class="dev-profile__section-heading">
      <div>
        <h2 class="dev-profile__section-title">公开资源</h2>
      </div>
      <span class="dev-profile__section-count">{{ count }} 个项目</span>
    </div>
    <div v-if="cards.length === 0" class="dev-profile__empty">
      <p>该开发者暂未发布公开资源</p>
    </div>
    <div v-else class="dev-profile__resource-grid">
      <article
        v-for="resource in cards"
        :key="resource.id"
        class="dev-profile__resource-card"
        role="button"
        tabindex="0"
        :aria-label="`查看资源：${resource.title}`"
        @click="emit('open', resource.id)"
        @keydown.enter="emit('open', resource.id)"
        @keydown.space.prevent="emit('open', resource.id)"
      >
        <div class="dev-profile__resource-cover-wrap">
          <img
            v-if="resource.coverUrl"
            :src="resource.coverUrl"
            :alt="resource.title"
            class="dev-profile__resource-cover"
            loading="lazy"
            @error="emit('cover-error', resource.id)"
          />
          <span v-else class="dev-profile__resource-cover dev-profile__resource-cover--text">
            {{ resource.title.slice(0, 1).toUpperCase() }}
          </span>
        </div>
        <div class="dev-profile__resource-body">
          <h3 class="dev-profile__resource-title">{{ resource.title }}</h3>
          <p class="dev-profile__resource-desc">
            {{ resource.description || '暂无简介' }}
          </p>
          <div class="dev-profile__resource-meta">
            <span>{{ resource.platform }}</span>
            <span>{{ resource.likeCount }} 赞</span>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style>
.dev-profile__resource-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.dev-profile__resource-card {
  border: 1px solid var(--dp-border-soft);
  border-radius: 12px;
  background: var(--dp-white-94);
  overflow: hidden;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.dev-profile__resource-card:hover,
.dev-profile__resource-card:focus-visible {
  border-color: var(--dp-border-accent-36);
  box-shadow: 0 8px 24px var(--dp-shadow-ink);
  transform: translateY(-2px);
  outline: none;
}

.dev-profile__resource-cover-wrap {
  width: 100%;
  height: 160px;
  border-bottom: 1px solid var(--dp-border-soft-60);
  overflow: hidden;
}

.dev-profile__resource-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.dev-profile__resource-cover--text {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--dp-surface-2), var(--dp-surface-3));
  color: var(--dp-text-faint);
  font-size: 36px;
  font-weight: 700;
  object-fit: unset;
}

.dev-profile__resource-body {
  padding: 14px 16px;
  display: grid;
  gap: 6px;
}

.dev-profile__resource-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--dp-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dev-profile__resource-desc {
  margin: 0;
  font-size: 13px;
  color: var(--dp-text-muted);
  line-height: 1.5;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.dev-profile__resource-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--dp-text-faint);
  padding-top: 4px;
}

@media (max-width: 640px) {
  .dev-profile__resource-grid {
    grid-template-columns: 1fr;
  }
}
</style>
