<script setup lang="ts">
import { computed } from 'vue'
import { TButton } from 'ui_73info'

import type { CommunityPost } from '@/api/community'
import {
  communityBountyLabel,
  communityStatusLabel,
  communityStatusNotice,
} from '@/shared/community'
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
}>()
const safeContent = computed(() => sanitizeRichHtml(props.post.content_html))
</script>

<template>
  <article class="community-detail-card">
    <header class="community-detail-card__header">
      <div class="community-detail-card__heading">
        <div class="community-detail-card__badges">
          <span class="community-detail-status" :class="`community-detail-status--${post.status}`">
            {{ communityStatusLabel(post.status) }}
          </span>
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
        >编辑帖子</TButton
      >
    </header>

    <p v-if="communityStatusNotice(post)" class="community-detail-card__notice" role="status">
      {{ communityStatusNotice(post) }}
    </p>
    <div class="community-detail-card__tags">
      <span v-for="item in post.tags" :key="item.id">{{ item.name }}</span>
    </div>
    <div class="community-detail-card__content" v-html="safeContent"></div>

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

    <footer class="community-detail-card__actions">
      <TButton
        class="community-detail-card__like"
        :disabled="post.status !== 'published' || Boolean(actionBusy)"
        @click="emit('like')"
      >
        {{ post.liked_by_me ? '取消点赞' : '点赞' }} · {{ post.like_count }}
      </TButton>
      <TButton
        class="community-detail-card__favorite"
        :disabled="post.status !== 'published' || Boolean(actionBusy)"
        @click="emit('favorite')"
      >
        {{ post.favorited_by_me ? '取消收藏' : '收藏' }}
      </TButton>
      <TButton
        v-if="isAuthor && post.status === 'published'"
        :disabled="Boolean(actionBusy)"
        @click="emit('boost')"
      >
        积分推广
      </TButton>
      <span>{{ post.comment_count }} 条评论</span>
    </footer>
  </article>
</template>

<style scoped>
.community-detail-card {
  padding: 26px;
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
  margin: 12px 0;
  font-size: 20px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.community-detail-card__meta {
  color: var(--73-ink-muted);
  font-size: 12px;
}
.community-detail-status,
.community-detail-badge,
.community-detail-card__tags span {
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--73-inset);
  color: var(--73-ink-soft);
  font-size: 11px;
}
.community-detail-status--published {
  color: var(--73-success);
}
.community-detail-status--pending_review {
  color: var(--73-warning);
}
.community-detail-status--rejected {
  color: var(--73-danger);
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
  margin-top: 24px;
  font-size: 14px;
  line-height: 1.85;
  overflow-wrap: anywhere;
}
.community-detail-card__content :deep(img),
.community-detail-card__content :deep(video) {
  max-width: 100%;
  height: auto;
}
.community-detail-card__content :deep(pre) {
  max-width: 100%;
  overflow-x: auto;
}
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
}
.community-detail-card__actions > span {
  margin-left: auto;
  color: var(--73-ink-muted);
  font-size: 12px;
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
  .community-detail-card__actions > span {
    width: 100%;
    margin-left: 0;
  }
}
</style>
