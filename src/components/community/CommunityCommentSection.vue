<script setup lang="ts">
import { TButton, TEmpty, TLoading } from 'ui_73info'

import type { CommunityComment } from '@/api/community'
import { COMMUNITY_COMMENT_MAX_LENGTH } from '@/composables/useCommunityComments'
import { formatBackendDateTime } from '@/shared/datetime'

const props = defineProps<{
  comments: CommunityComment[]
  postId: number
  postAuthor: string
  postStatus: string
  bountyStatus: string
  acceptedCommentId?: number | null
  isAuthor: boolean
  authenticated: boolean
  loading: boolean
  error: string
  actionError: string
  submitting: boolean
  likeBusyId: number | null
  actionBusy: string
}>()
const emit = defineEmits<{
  submit: []
  login: []
  reload: []
  like: [comment: CommunityComment]
  accept: [comment: CommunityComment]
}>()
const text = defineModel<string>('text', { required: true })
const replyTo = defineModel<CommunityComment | null>('replyTo', { required: true })

function canAccept(comment: CommunityComment): boolean {
  return (
    props.isAuthor &&
    props.postStatus === 'published' &&
    props.bountyStatus === 'active' &&
    comment.commenter !== props.postAuthor
  )
}
</script>

<template>
  <section class="community-comments" aria-labelledby="community-comments-title">
    <header class="community-comments__header">
      <h2 id="community-comments-title">评论与回复</h2>
      <span>{{ comments.length }} 条</span>
    </header>

    <div v-if="postStatus !== 'published'" class="community-comments__gate" role="status">
      帖子通过审核后才可评论。
    </div>
    <div v-else-if="!authenticated" class="community-comments__gate" role="status">
      <span>登录后可评论、回复和点赞。</span>
      <TButton class="community-comments__login" @click="emit('login')">登录</TButton>
    </div>
    <form v-else class="community-comments__composer" @submit.prevent="emit('submit')">
      <div v-if="replyTo" class="community-comments__replying">
        <span>回复 {{ replyTo.commenter }}</span>
        <button type="button" @click="replyTo = null">取消回复</button>
      </div>
      <textarea
        v-model="text"
        rows="4"
        :maxlength="COMMUNITY_COMMENT_MAX_LENGTH"
        :placeholder="replyTo ? `回复 ${replyTo.commenter}` : '写下评论'"
        aria-label="评论内容"
      ></textarea>
      <div class="community-comments__composer-actions">
        <span>{{ Array.from(text).length }} / {{ COMMUNITY_COMMENT_MAX_LENGTH }}</span>
        <TButton variant="solid" tone="accent" type="submit" :loading="submitting"
          >发布评论</TButton
        >
      </div>
    </form>
    <p v-if="actionError" class="community-comments__error" role="alert">{{ actionError }}</p>

    <TLoading :loading="loading" class="community-comments__loading">
      <div v-if="error" class="community-comments__error" role="alert">
        <span>{{ error }}</span>
        <TButton @click="emit('reload')">重新加载</TButton>
      </div>
      <TEmpty v-else-if="!comments.length" description="暂时没有评论" />
      <div v-else class="community-comments__list">
        <article
          v-for="comment in comments"
          :key="comment.id"
          class="community-comment"
          :class="{ 'community-comment--accepted': acceptedCommentId === comment.id }"
          :data-comment-id="comment.id"
        >
          <div class="community-comment__meta">
            <strong>{{ comment.commenter }}</strong>
            <span v-if="comment.parent_commenter">回复 {{ comment.parent_commenter }}</span>
            <span v-if="acceptedCommentId === comment.id" class="community-comment__accepted"
              >已采纳</span
            >
            <time :datetime="comment.created_at">{{
              formatBackendDateTime(comment.created_at)
            }}</time>
          </div>
          <p class="community-comment__text">{{ comment.comment_text }}</p>
          <footer class="community-comment__actions">
            <button
              type="button"
              class="community-comment__like"
              :disabled="postStatus !== 'published' || likeBusyId !== null"
              @click="emit('like', comment)"
            >
              {{ comment.liked_by_me ? '取消点赞' : '点赞' }} · {{ comment.like_count }}
            </button>
            <button
              v-if="authenticated && postStatus === 'published'"
              type="button"
              @click="replyTo = comment"
            >
              回复
            </button>
            <TButton
              v-if="canAccept(comment)"
              :disabled="Boolean(actionBusy)"
              @click="emit('accept', comment)"
            >
              采纳为答案
            </TButton>
          </footer>
        </article>
      </div>
    </TLoading>
  </section>
</template>

<style scoped>
.community-comments {
  margin-top: 18px;
  padding: 24px;
  border: 1px solid var(--73-border);
  border-radius: 12px;
  background: var(--73-surface-strong);
  color: var(--73-ink);
}
.community-comments__header,
.community-comments__gate,
.community-comments__composer-actions,
.community-comment__meta,
.community-comment__actions,
.community-comments__replying {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.community-comments__header {
  justify-content: space-between;
  margin-bottom: 18px;
}
.community-comments__header h2 {
  margin: 0;
  font-size: 18px;
}
.community-comments__header span {
  color: var(--73-ink-muted);
  font-size: 12px;
}
.community-comments__gate {
  justify-content: space-between;
  padding: 14px;
  border-radius: 8px;
  background: var(--73-inset);
  color: var(--73-ink-soft);
  font-size: 13px;
}
.community-comments__composer textarea {
  width: 100%;
  min-height: 104px;
  resize: vertical;
  padding: 12px;
  border: 1px solid var(--73-border);
  border-radius: 10px;
  background: var(--73-surface-strong);
  color: var(--73-ink);
  font: inherit;
  font-size: 13px;
  line-height: 1.7;
}
.community-comments__composer-actions {
  justify-content: space-between;
  margin-top: 10px;
}
.community-comments__composer-actions > span {
  color: var(--73-ink-muted);
  font-size: 12px;
}
.community-comments__replying {
  justify-content: space-between;
  margin-bottom: 8px;
  color: var(--73-accent);
  font-size: 12px;
}
.community-comments__replying button,
.community-comment__actions button {
  border: 0;
  background: transparent;
  color: var(--73-accent);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.community-comments__loading {
  display: block;
  min-height: 100px;
  margin-top: 18px;
}
.community-comments__list {
  display: grid;
  gap: 12px;
}
.community-comment {
  padding: 16px;
  border-radius: 10px;
  background: var(--73-inset);
}
.community-comment--accepted {
  border: 1px solid var(--73-success-line);
}
.community-comment__meta {
  color: var(--73-ink-muted);
  font-size: 12px;
}
.community-comment__meta strong {
  color: var(--73-ink);
  font-size: 13px;
}
.community-comment__meta time {
  margin-left: auto;
}
.community-comment__accepted {
  color: var(--73-success);
}
.community-comment__text {
  margin: 12px 0;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.community-comment__actions {
  justify-content: flex-end;
}
.community-comment__actions button {
  min-height: 32px;
}
.community-comment__actions button:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}
.community-comments__error {
  color: var(--73-danger);
  font-size: 13px;
}
@media (max-width: 640px) {
  .community-comments {
    padding: 18px 14px;
  }
  .community-comments__gate {
    align-items: flex-start;
  }
  .community-comments__composer-actions :deep(button),
  .community-comments__login,
  .community-comment__actions button {
    min-height: 44px;
  }
  .community-comment__meta time {
    width: 100%;
    margin-left: 0;
  }
}
</style>
