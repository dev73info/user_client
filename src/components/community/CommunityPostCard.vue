<script setup lang="ts">
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
      <div class="community-post-card__meta">
        <span>作者：{{ post.author }}</span>
        <time :datetime="post.published_at">{{ formatBackendDateTime(post.published_at) }}</time>
      </div>
    </div>
    <div class="community-post-card__stats" aria-label="帖子数据">
      <span>{{ post.like_count }} 点赞</span>
      <span>{{ post.comment_count }} 评论</span>
      <span v-if="post.favorited_by_me">已收藏</span>
    </div>
  </article>
</template>

<style scoped>
.community-post-card {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding: 20px;
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
  color: var(--73-danger);
}
.community-tag--featured,
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
  margin-top: 14px;
}
.community-post-card__meta {
  margin-top: 14px;
  color: var(--73-ink-muted);
  font-size: 12px;
}
.community-post-card__stats {
  justify-content: flex-end;
  flex: 0 0 auto;
  color: var(--73-ink-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
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
.community-post-card--rail .community-post-card__tags,
.community-post-card--rail .community-post-card__meta {
  margin-top: 8px;
}
.community-post-card--rail .community-post-card__meta,
.community-post-card--rail .community-post-card__stats {
  gap: 7px;
  font-size: 11px;
}
.community-post-card--rail .community-post-card__stats {
  justify-content: flex-start;
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
  .community-post-card__stats {
    justify-content: flex-start;
  }
  .community-post-card--rail {
    padding: 12px;
  }
}
</style>
