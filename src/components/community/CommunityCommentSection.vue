<script setup lang="ts">
import { nextTick, ref } from 'vue'
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
const composerRef = ref<HTMLTextAreaElement | null>(null)
const replyComposerRef = ref<HTMLTextAreaElement | null>(null)

function avatarInitial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?'
}

function canReply(): boolean {
  return props.authenticated && props.postStatus === 'published'
}

async function startReply(comment: CommunityComment, event?: MouseEvent): Promise<void> {
  if (!canReply()) return
  if (
    event?.target instanceof Element &&
    event.target.closest('button, a, input, textarea, select, form')
  ) {
    return
  }
  if (window.getSelection()?.toString().trim()) return
  replyTo.value = comment
  await nextTick()
  const activeComposer = replyTo.value ? replyComposerRef.value : composerRef.value
  activeComposer?.focus()
}

async function focusComposer(): Promise<void> {
  replyTo.value = null
  await nextTick()
  composerRef.value?.focus()
}

defineExpose({ focusComposer })

function setReplyComposer(element: unknown): void {
  replyComposerRef.value = element instanceof HTMLTextAreaElement ? element : null
}

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
    <form
      v-else-if="!replyTo"
      class="community-comments__composer"
      @submit.prevent="emit('submit')"
    >
      <textarea
        ref="composerRef"
        v-model="text"
        rows="3"
        :maxlength="COMMUNITY_COMMENT_MAX_LENGTH"
        placeholder="写下评论"
        aria-label="评论内容"
      ></textarea>
      <div class="community-comments__composer-actions">
        <span>{{ Array.from(text).length }} / {{ COMMUNITY_COMMENT_MAX_LENGTH }}</span>
        <TButton variant="solid" tone="accent" type="submit" :loading="submitting">评论</TButton>
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
          :class="{
            'community-comment--accepted': acceptedCommentId === comment.id,
            'community-comment--reply': Boolean(comment.parent_commenter),
            'community-comment--clickable': canReply(),
          }"
          :data-comment-id="comment.id"
          :tabindex="canReply() ? 0 : undefined"
          @click="startReply(comment, $event)"
          @keydown.enter.self="startReply(comment)"
        >
          <span class="community-comment__avatar" aria-hidden="true">{{
            avatarInitial(comment.commenter)
          }}</span>
          <div class="community-comment__body">
            <div class="community-comment__meta">
              <strong>{{ comment.commenter }}</strong>
              <span v-if="comment.parent_commenter">回复 {{ comment.parent_commenter }}</span>
              <span v-if="acceptedCommentId === comment.id" class="community-comment__accepted"
                >已采纳</span
              >
            </div>
            <p class="community-comment__text">{{ comment.comment_text }}</p>
            <footer class="community-comment__actions">
              <time :datetime="comment.created_at">{{
                formatBackendDateTime(comment.created_at)
              }}</time>
              <button
                type="button"
                class="community-comment__like"
                :class="{ 'is-liked': comment.liked_by_me }"
                :disabled="postStatus !== 'published' || likeBusyId !== null"
                :aria-pressed="comment.liked_by_me"
                :aria-label="comment.liked_by_me ? '取消点赞' : '点赞'"
                @click="emit('like', comment)"
              >
                <svg class="community-comment__like-heart" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M8 13.4S2.6 10.4 2.6 6.5A3.1 3.1 0 0 1 8 4.1a3.1 3.1 0 0 1 5.4 2.4c0 3.9-5.4 6.9-5.4 6.9Z"
                  />
                </svg>
                <span>{{ comment.like_count }}</span>
              </button>
              <TButton
                v-if="canAccept(comment)"
                class="community-comment__accept"
                :disabled="Boolean(actionBusy)"
                @click="emit('accept', comment)"
              >
                采纳为答案
              </TButton>
            </footer>
            <form
              v-if="replyTo?.id === comment.id"
              class="community-comments__composer community-comments__composer--inline"
              @submit.prevent="emit('submit')"
            >
              <textarea
                :ref="setReplyComposer"
                v-model="text"
                rows="3"
                :maxlength="COMMUNITY_COMMENT_MAX_LENGTH"
                :placeholder="`回复 ${comment.commenter}`"
                aria-label="回复内容"
              ></textarea>
              <div class="community-comments__composer-actions">
                <span>{{ Array.from(text).length }} / {{ COMMUNITY_COMMENT_MAX_LENGTH }}</span>
                <TButton variant="solid" tone="accent" type="submit" :loading="submitting"
                  >评论</TButton
                >
              </div>
            </form>
          </div>
        </article>
      </div>
    </TLoading>
  </section>
</template>

<style scoped src="./community-comment-section.css"></style>
