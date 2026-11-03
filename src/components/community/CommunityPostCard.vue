<script setup lang="ts">
import { computed } from 'vue'

import type { CommunityPost } from '@/api/community'
import {
  communityBountyLabel,
  communityStatusLabel,
  communityStatusNotice,
} from '@/shared/community'
import { formatBackendDateTime } from '@/shared/datetime'

const props = withDefaults(
  defineProps<{
    post: CommunityPost
    /** 社区左右分栏里由父级接管点击；独立列表继续走帖子链接。 */
    selectable?: boolean
    active?: boolean
  }>(),
  { selectable: false, active: false },
)

const emit = defineEmits<{ (e: 'select', post: CommunityPost): void }>()

const contentText = computed(() => {
  return props.post.content_html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
})
const excerpt = computed(() => {
  const text = contentText.value
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
})

function select() {
  if (props.selectable) emit('select', props.post)
}
</script>

<template>
  <article
    class="community-post-card"
    :class="{
      'community-post-card--rail': selectable,
      'is-selected': active,
    }"
    :data-post-id="post.id"
    :role="selectable ? 'button' : undefined"
    :tabindex="selectable ? 0 : undefined"
    :aria-current="active ? 'true' : undefined"
    @click="select"
    @keydown.enter="select"
    @keydown.space.prevent="select"
  >
    <div class="community-post-card__main">
      <div class="community-post-card__heading">
        <RouterLink
          v-if="!selectable"
          class="community-post-card__title"
          :to="{ name: 'community-post', params: { id: post.id } }"
        >
          {{ post.title }}
        </RouterLink>
        <span v-else class="community-post-card__title">{{ post.title }}</span>
        <span class="community-status" :class="`community-status--${post.status}`">
          {{ communityStatusLabel(post.status) }}
        </span>
      </div>
      <p v-if="communityStatusNotice(post)" class="community-post-card__notice" role="status">
        {{ communityStatusNotice(post) }}
      </p>
      <div class="community-post-card__tags" aria-label="帖子标签">
        <span v-for="item in post.tags" :key="item.id" class="community-tag">{{ item.name }}</span>
        <span v-if="post.is_featured" class="community-tag community-tag--featured">精选</span>
        <span v-if="post.bounty_points > 0" class="community-tag community-tag--bounty">
          {{ post.bounty_points }} 积分 · {{ communityBountyLabel(post.bounty_status) }}
        </span>
      </div>
      <p v-if="excerpt" class="community-post-card__excerpt">{{ excerpt }}</p>
    </div>
    <div class="community-post-card__footer">
      <div class="community-post-card__meta">
        <span>作者：{{ post.author }}</span>
      </div>
      <div class="community-post-card__footline">
        <time :datetime="post.published_at">{{ formatBackendDateTime(post.published_at) }}</time>
        <div class="community-post-card__stats" aria-label="帖子数据">
          <span class="community-post-card__stat" :aria-label="`${post.like_count} 点赞`">
            <svg
              class="community-post-card__stat-icon is-like"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path
                d="M8 13.4S2.6 10.4 2.6 6.5A3.1 3.1 0 0 1 8 4.1a3.1 3.1 0 0 1 5.4 2.4c0 3.9-5.4 6.9-5.4 6.9Z"
              />
            </svg>
            <span>{{ post.like_count }}</span>
          </span>
          <span class="community-post-card__stat" :aria-label="`${post.comment_count} 评论`">
            <svg class="community-post-card__stat-icon" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.6 3.4h10.8v7.3H7.4L4 13.4v-2.7H2.6z" />
            </svg>
            <span>{{ post.comment_count }}</span>
          </span>
          <span v-if="post.favorited_by_me">已收藏</span>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.community-post-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px;
  border: 1px solid var(--73-border);
  border-radius: 12px;
  background: var(--73-surface-strong);
  transition:
    border-color 160ms ease,
    transform 160ms ease;
}
.community-post-card:hover {
  border-color: var(--73-border-hover);
  transform: translateY(-1px);
}
.community-post-card--rail {
  padding: 13px 12px;
  gap: 4px;
  border-radius: 10px;
  cursor: pointer;
}
.community-post-card--rail:hover,
.community-post-card--rail:focus-visible,
.community-post-card--rail.is-selected {
  border-color: color-mix(in srgb, var(--73-accent) 48%, var(--73-border));
  background: color-mix(in srgb, var(--73-accent-soft) 24%, var(--73-surface-strong));
  outline: none;
  transform: none;
}
.community-post-card--rail.is-selected {
  box-shadow:
    inset 3px 0 0 var(--73-accent),
    0 8px 18px color-mix(in srgb, var(--73-accent) 8%, transparent);
}
.community-post-card__main {
  min-width: 0;
}
/* 表尾：作者单独一行，时间与点赞评论同处下一行 */
.community-post-card__footer {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.community-post-card__footline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}
.community-post-card__heading,
.community-post-card__tags,
.community-post-card__meta,
.community-post-card__stats {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.community-post-card__title {
  color: var(--73-ink);
  font-size: 18px;
  font-weight: 750;
  line-height: 1.5;
  text-decoration: none;
  overflow-wrap: anywhere;
}
.community-post-card__title:hover {
  color: var(--73-accent);
}
.community-status,
.community-tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--73-inset);
  color: var(--73-ink-soft);
  font-size: 11px;
  white-space: nowrap;
}
.community-status--published {
  color: var(--73-success);
}
.community-status--pending_review {
  color: var(--73-warning);
}
.community-status--rejected {
  color: var(--73-accent);
}
.community-tag--featured {
  border: 1px solid var(--73-border);
  border-radius: 4px;
  background: var(--73-inset);
  color: var(--73-ink-muted);
  font-family: var(--73-font-family-mono);
  font-size: 10px;
}
.community-tag--bounty {
  color: var(--73-accent);
}
.community-post-card__notice {
  margin: 10px 0 0;
  color: var(--73-warning);
  font-size: 12px;
  line-height: 1.6;
}
.community-post-card__tags {
  margin-top: 10px;
}
.community-post-card__excerpt {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--73-ink-soft);
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.community-post-card__meta {
  margin-top: 0;
  min-width: 0;
  color: var(--73-ink-muted);
  font-size: 12px;
}
.community-post-card__stats {
  justify-content: flex-end;
  flex: 0 0 auto;
  /* 换行到第二行时也贴右，不和作者/时间挤在左边 */
  margin-left: auto;
  color: var(--73-ink-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.community-post-card__stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.community-post-card__stat-icon {
  width: 14px;
  height: 14px;
  color: var(--73-ink-soft);
  flex: 0 0 auto;
}
.community-post-card__stat-icon path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linejoin: round;
}
.community-post-card__stat-icon.is-like {
  color: var(--73-danger);
}
.community-post-card--rail .community-post-card__heading {
  gap: 7px;
}
.community-post-card--rail .community-post-card__title {
  font-size: 14px;
  line-height: 1.45;
}
.community-post-card--rail .community-status,
.community-post-card--rail .community-tag {
  min-height: 20px;
  padding: 1px 7px;
  font-size: 10px;
}
.community-post-card--rail .community-post-card__tags {
  margin-top: 4px;
}
.community-post-card--rail .community-post-card__excerpt {
  font-size: 12px;
  line-height: 1.55;
  -webkit-line-clamp: 1;
}
.community-post-card--rail .community-post-card__meta,
.community-post-card--rail .community-post-card__stats {
  gap: 7px;
  font-size: 11px;
}
.community-post-card--rail .community-post-card__footline {
  gap: 6px;
}
@media (max-width: 640px) {
  .community-post-card {
    align-items: flex-start;
    flex-direction: column;
    padding: 16px;
  }
  .community-post-card__title {
    font-size: 16px;
  }
  .community-post-card--rail {
    padding: 12px;
  }
}
</style>
