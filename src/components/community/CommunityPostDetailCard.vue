<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, ArrowUp, TButton, TIcon, TMessageBox } from 'ui_73info'

import type { CommunityPost } from '@/api/community'
import CommunityPostActions from '@/components/community/CommunityPostActions.vue'
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
  delete: []
  boost: []
  cancelBounty: []
  reply: []
}>()
const safeContent = computed(() => sanitizeRichHtml(props.post.content_html))
const { contentRef, contentExpanded, contentCanToggle } = useCollapsibleContent(safeContent)

async function confirmDelete(): Promise<void> {
  const confirmed = await TMessageBox.confirm({
    title: '删除帖子',
    content: '删除后不可恢复。',
    confirmText: '删除',
    tone: 'danger',
  })
  if (confirmed) emit('delete')
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
      <div v-if="isAuthor" class="community-detail-card__author-actions">
        <TButton :disabled="Boolean(actionBusy)" @click="emit('edit')">重新编辑</TButton>
        <TButton tone="danger" :disabled="Boolean(actionBusy)" @click="confirmDelete">删除</TButton>
      </div>
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

    <CommunityPostActions
      :post="post"
      :is-author="isAuthor"
      :action-busy="actionBusy"
      @like="emit('like')"
      @favorite="emit('favorite')"
      @boost="emit('boost')"
      @reply="emit('reply')"
    />
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
.community-detail-card__author-actions {
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
@media (max-width: 640px) {
  .community-detail-card {
    padding: 18px 16px;
  }
  .community-detail-card__header {
    flex-direction: column;
  }
}
</style>
