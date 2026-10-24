<script setup lang="ts">
import type { CommunityPost } from '@/api/community'
import { formatCnDateTime as formatTimeLabel } from '@/shared/requirementDisplay'
import { communityDescription, communityStatusLabel } from '@/shared/searchResults'

/**
 * 搜索结果里的一张社区帖子卡片（状态与更新时间 / 标题与标签摘要 / 作者与互动读数）。
 *
 * 帖子正文是 HTML，不适合当摘要：有标签列标签，没标签就引导进详情（见 `communityDescription`）。
 */
defineProps<{ post: CommunityPost }>()
const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <article
    class="portal-page__card portal-search-result-card portal-search-result-card--community"
    role="button"
    tabindex="0"
    @click="emit('open')"
    @keydown.enter="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <div class="portal-page__card-topline">
      <span class="portal-page__chip">{{ communityStatusLabel(post.status) }}</span>
      <span class="portal-page__meta">{{ formatTimeLabel(post.updated_at) }}</span>
    </div>
    <h3>{{ post.title }}</h3>
    <p>{{ communityDescription(post) }}</p>
    <div class="portal-search-result-card__tags">
      <span v-for="tag in post.tags.slice(0, 4)" :key="`${post.id}-${tag.id}`">
        {{ tag.name }}
      </span>
    </div>
    <div class="portal-page__card-footer">
      <strong>{{ post.author }}</strong>
      <span>{{ post.like_count }} 赞 · {{ post.comment_count }} 评论</span>
    </div>
  </article>
</template>
