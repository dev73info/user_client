<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, ArrowUp, TButton, TIcon } from 'ui_73info'

import type { CommunityPost } from '@/api/community'
import { useCollapsibleContent } from '@/composables/useCollapsibleContent'
import { communityBountyLabel, communityStatusNotice } from '@/shared/community'
import { formatBackendDateTime } from '@/shared/datetime'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

const props = defineProps<{
  post: CommunityPost
  isAuthor: boolean
  actionBusy: string
}>()
const emit = defineEmits<{
  like: []
  favorite: []
  edit: []
  boost: []
  cancelBounty: []
  reply: []
}>()
const safeContent = computed(() => sanitizeRichHtml(props.post.content_html))
const { contentRef, contentExpanded, contentCanToggle } = useCollapsibleContent(safeContent)

function handleActionsClick(event: MouseEvent): void {
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
  <article class="community-detail-card">
    <header class="community-detail-card__header">
      <div class="community-detail-card__heading">
        <div
          v-if="post.is_featured || post.origin_type === 'repost'"
          class="community-detail-card__badges"
        >
          <span v-if="post.is_featured" class="community-detail-badge">精选</span>
          <span v-if="post.origin_type === 'repost'" class="community-detail-badge">转载</span>
        </div>
        <h1>{{ post.title }}</h1>
        <div class="community-detail-card__meta">
          <span>作者：{{ post.author }}</span>
          <time :datetime="post.published_at"
            >发布于 {{ formatBackendDateTime(post.published_at) }}</time
          >
          <span v-if="post.updated_at !== post.published_at">
            更新于 {{ formatBackendDateTime(post.updated_at) }}
          </span>
        </div>
      </div>
      <TButton v-if="isAuthor" :disabled="Boolean(actionBusy)" @click="emit('edit')"
        >重新编辑</TButton
      >
    </header>

    <p v-if="communityStatusNotice(post)" class="community-detail-card__notice" role="status">
      {{ communityStatusNotice(post) }}
    </p>
    <div class="community-detail-card__tags">
      <span v-for="item in post.tags" :key="item.id">{{ item.name }}</span>
    </div>
    <div
      id="community-post-content"
      ref="contentRef"
      class="community-detail-card__content"
      :class="{
        'community-detail-card__content--collapsed': contentCanToggle && !contentExpanded,
      }"
      v-html="safeContent"
    ></div>
    <div v-if="contentCanToggle" class="community-detail-card__content-toggle">
      <button
        type="button"
        :aria-expanded="contentExpanded"
        aria-controls="community-post-content"
        @click="contentExpanded = !contentExpanded"
      >
        <TIcon>
          <ArrowUp v-if="contentExpanded" />
          <ArrowDown v-else />
        </TIcon>
        <span>{{ contentExpanded ? '收起正文' : '展开全文' }}</span>
      </button>
    </div>

    <section
      v-if="post.bounty_points > 0"
      class="community-detail-card__bounty"
      aria-label="悬赏状态"
    >
      <strong>{{ post.bounty_points }} 积分悬赏</strong>
      <span>{{ communityBountyLabel(post.bounty_status) }}</span>
      <TButton
        v-if="isAuthor && post.bounty_status === 'active'"
        :disabled="Boolean(actionBusy)"
        @click="emit('cancelBounty')"
      >
        取消悬赏
      </TButton>
    </section>

    <footer class="community-detail-card__actions" @click="handleActionsClick">
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
  </article>
</template>

<style scoped>
.community-detail-card {
  padding: 18px;
  border: 1px solid var(--73-border);
  border-radius: 12px;
  background: var(--73-surface-strong);
  color: var(--73-ink);
}
.community-detail-card__header,
.community-detail-card__meta,
.community-detail-card__badges,
.community-detail-card__tags,
.community-detail-card__bounty,
.community-detail-card__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.community-detail-card__header {
  align-items: flex-start;
  justify-content: space-between;
}
.community-detail-card__heading {
  min-width: 0;
}
.community-detail-card__heading h1 {
  margin: 8px 0;
  font-size: 20px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.community-detail-card__meta {
  color: var(--73-ink-muted);
  font-size: 12px;
}
.community-detail-badge,
.community-detail-card__tags span {
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--73-inset);
  color: var(--73-ink-soft);
  font-size: 11px;
}
.community-detail-card__notice {
  margin: 18px 0 0;
  padding: 12px;
  border-radius: 8px;
  background: var(--73-warning-soft);
  color: var(--73-warning-text);
  font-size: 13px;
}
.community-detail-card__tags {
  margin-top: 20px;
}
.community-detail-card__content {
  position: relative;
  margin-top: 24px;
  font-size: 14px;
  line-height: 1.85;
  overflow-wrap: anywhere;
}
.community-detail-card__content--collapsed {
  max-height: 420px;
  overflow: hidden;
}
.community-detail-card__content--collapsed::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 88px;
  background: linear-gradient(to bottom, transparent, var(--73-surface-strong) 88%);
  content: '';
  pointer-events: none;
}
.community-detail-card__content-toggle {
  display: flex;
  justify-content: center;
  margin-top: 10px;
}
.community-detail-card__content-toggle button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--73-radius-control);
  background: transparent;
  color: var(--73-accent);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.community-detail-card__content-toggle button:hover {
  background: var(--73-inset);
}
.community-detail-card__content-toggle button:focus-visible {
  outline: 2px solid var(--73-accent);
  outline-offset: 2px;
}
.community-detail-card__content :deep(img),
.community-detail-card__content :deep(video) {
  max-width: 100%;
  height: auto;
}
.community-detail-card__content :deep(pre),
.community-detail-card__content :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
}
.community-detail-card__bounty {
  margin-top: 24px;
  padding: 14px;
  border-radius: 8px;
  background: var(--73-warning-soft);
  color: var(--73-warning-text);
}
.community-detail-card__bounty strong {
  margin-right: auto;
}
.community-detail-card__actions {
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
  .community-detail-card {
    padding: 18px 16px;
  }
  .community-detail-card__header {
    flex-direction: column;
  }
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
