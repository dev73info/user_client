<script setup lang="ts">
import { TButton } from 'ui_73info'

import type { CommunityPost } from '@/api/community'

defineProps<{
  post: CommunityPost
  isAuthor: boolean
  actionBusy: string
}>()
const emit = defineEmits<{
  like: []
  favorite: []
  boost: []
  reply: []
}>()

function handleClick(event: MouseEvent): void {
  if (
    event.target instanceof Element &&
    event.target.closest('button, a, input, textarea, select, form')
  ) {
    return
  }
  emit('reply')
}
</script>

<template>
  <footer class="community-detail-card__actions" @click="handleClick">
    <button
      type="button"
      class="community-detail-card__like"
      :class="{ 'is-liked': post.liked_by_me }"
      :disabled="post.status !== 'published' || Boolean(actionBusy)"
      :aria-pressed="post.liked_by_me"
      :aria-label="post.liked_by_me ? '取消点赞' : '点赞'"
      @click="emit('like')"
    >
      <svg class="community-detail-card__like-heart" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M8 13.4S2.6 10.4 2.6 6.5A3.1 3.1 0 0 1 8 4.1a3.1 3.1 0 0 1 5.4 2.4c0 3.9-5.4 6.9-5.4 6.9Z"
        />
      </svg>
      <span>{{ post.like_count }}</span>
    </button>
    <button
      type="button"
      class="community-detail-card__favorite"
      :class="{ 'is-favorited': post.favorited_by_me }"
      :disabled="post.status !== 'published' || Boolean(actionBusy)"
      :aria-pressed="post.favorited_by_me"
      :aria-label="post.favorited_by_me ? '取消收藏' : '收藏'"
      :title="post.favorited_by_me ? '取消收藏' : '收藏'"
      @click="emit('favorite')"
    >
      <svg class="community-detail-card__favorite-star" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.9l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L2.2 6.2l4-.6z" />
      </svg>
    </button>
    <TButton
      v-if="isAuthor && post.status === 'published'"
      class="community-detail-card__boost"
      :disabled="Boolean(actionBusy)"
      @click="emit('boost')"
    >
      推广
    </TButton>
  </footer>
</template>

<style scoped>
.community-detail-card__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid var(--73-border-soft);
  cursor: pointer;
}
.community-detail-card__actions > span {
  margin-left: auto;
  color: var(--73-ink-muted);
  font-size: 12px;
}
.community-detail-card__like {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--73-control-height);
  padding: 0 10px;
  border: 0;
  border-radius: var(--73-radius-control);
  background: transparent;
  color: var(--73-ink-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition:
    background-color var(--73-transition),
    color var(--73-transition);
}
.community-detail-card__like-heart {
  width: 17px;
  height: 17px;
  color: var(--73-danger);
  flex: 0 0 auto;
}
.community-detail-card__like-heart path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linejoin: round;
}
.community-detail-card__like.is-liked .community-detail-card__like-heart path {
  fill: currentColor;
}
.community-detail-card__like.is-liked {
  color: var(--73-danger);
  font-weight: 600;
}
.community-detail-card__like:hover:not(:disabled) {
  color: var(--73-danger);
}
.community-detail-card__like:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.community-detail-card__favorite {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--73-control-height);
  min-height: var(--73-control-height);
  padding: 0;
  border: 0;
  border-radius: var(--73-radius-control);
  background: transparent;
  color: var(--73-ink-muted);
  cursor: pointer;
  transition: color var(--73-transition);
}
.community-detail-card__favorite-star {
  width: 18px;
  height: 18px;
}
.community-detail-card__favorite-star path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linejoin: round;
}
.community-detail-card__favorite.is-favorited {
  color: var(--73-warning, #d97706);
}
.community-detail-card__favorite.is-favorited .community-detail-card__favorite-star path {
  fill: currentColor;
}
.community-detail-card__favorite:hover:not(:disabled) {
  color: var(--73-warning, #d97706);
}
.community-detail-card__favorite:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.community-detail-card__boost {
  margin-left: auto;
}
@media (max-width: 640px) {
  .community-detail-card__actions {
    align-items: stretch;
  }
  .community-detail-card__actions :deep(button) {
    min-height: 44px;
    flex: 1 1 auto;
  }
  .community-detail-card__actions .community-detail-card__like,
  .community-detail-card__actions .community-detail-card__favorite {
    min-height: 44px;
    flex: 0 0 auto;
  }
  .community-detail-card__actions .community-detail-card__boost {
    margin-left: 0;
  }
  .community-detail-card__actions > span {
    width: 100%;
    margin-left: 0;
  }
}
</style>
