<script setup lang="ts">
import { reactive, watch } from 'vue'
import { TButton, TLoading } from 'ui_73info'

import type { CreateCommunityPostPayload } from '@/api/community'
import CommunityBoostDialog from '@/components/community/CommunityBoostDialog.vue'
import CommunityCommentSection from '@/components/community/CommunityCommentSection.vue'
import CommunityPostDetailCard from '@/components/community/CommunityPostDetailCard.vue'
import CommunityPostFormDialog from '@/components/community/CommunityPostFormDialog.vue'
import { useCommunityAccess } from '@/composables/useCommunityAccess'
import { useCommunityComments } from '@/composables/useCommunityComments'
import { useCommunityPostDetail } from '@/composables/useCommunityPostDetail'
import { useCommunityPostEditor } from '@/composables/useCommunityPostEditor'

const { auth, openLogin, openRealname } = useCommunityAccess()
const detail = useCommunityPostDetail()
const {
  post,
  postId,
  isAuthor,
  loading,
  error,
  actionError,
  actionErrorCode,
  actionBusy,
  boostOpen,
} = detail
const commentState = useCommunityComments({
  postId,
  isPublished: () => post.value?.status === 'published',
})
const {
  comments,
  loading: commentsLoading,
  error: commentsError,
  actionError: commentActionError,
  text,
  replyTo,
  submitting,
  likeBusyId,
} = commentState
const editor = reactive(useCommunityPostEditor())

async function loadPage() {
  await Promise.all([detail.load(), commentState.load()])
}

watch([postId, () => auth.token], () => void loadPage(), { immediate: true })

async function submitPost(payload: CreateCommunityPostPayload) {
  const saved = await editor.submit(payload)
  if (saved) post.value = saved
}

async function submitComment() {
  const saved = await commentState.submit()
  if (saved && post.value)
    post.value = { ...post.value, comment_count: post.value.comment_count + 1 }
}
</script>

<template>
  <main class="community-detail-page">
    <RouterLink class="community-detail-page__back" :to="{ name: 'community' }"
      >返回社区</RouterLink
    >
    <TLoading :loading="loading" class="community-detail-page__loading">
      <div v-if="error" class="community-detail-page__error" role="alert">
        <span>{{ error }}</span>
        <TButton @click="detail.load">重新加载</TButton>
      </div>
      <template v-else-if="post">
        <CommunityPostDetailCard
          :post="post"
          :is-author="isAuthor"
          :action-busy="actionBusy"
          @like="detail.toggleLike"
          @favorite="detail.toggleFavorite"
          @edit="editor.openEdit(post)"
          @boost="detail.openBoost"
          @cancel-bounty="detail.cancelBounty"
        />
        <p
          v-if="actionError && !boostOpen"
          class="community-detail-page__action-error"
          role="alert"
        >
          {{ actionError }}
        </p>
        <CommunityCommentSection
          v-model:text="text"
          v-model:reply-to="replyTo"
          :comments="comments"
          :post-id="post.id"
          :post-author="post.author"
          :post-status="post.status"
          :bounty-status="post.bounty_status"
          :accepted-comment-id="post.bounty_accepted_comment_id"
          :is-author="isAuthor"
          :authenticated="auth.isAuthed"
          :loading="commentsLoading"
          :error="commentsError"
          :action-error="commentActionError"
          :submitting="submitting"
          :like-busy-id="likeBusyId"
          :action-busy="actionBusy"
          @submit="submitComment"
          @login="openLogin"
          @reload="commentState.load"
          @like="commentState.toggleLike"
          @accept="detail.acceptBounty($event.id)"
        />
      </template>
    </TLoading>

    <CommunityPostFormDialog
      v-model:open="editor.open"
      :post="editor.editingPost"
      :tags="post?.tags ?? []"
      :submitting="editor.submitting"
      :error="editor.error"
      :error-code="editor.errorCode"
      @submit="submitPost"
      @realname="openRealname"
    />
    <CommunityBoostDialog
      v-model:open="boostOpen"
      :submitting="actionBusy === 'boost'"
      :error="actionError"
      :error-code="actionErrorCode"
      @submit="detail.submitBoost"
    />
  </main>
</template>

<style scoped>
.community-detail-page {
  width: min(1280px, calc(100% - 24px));
  margin: 0 auto;
  padding: 24px 0 64px;
}
.community-detail-page__back {
  display: inline-flex;
  margin-bottom: 16px;
  color: var(--73-accent);
  font-size: 13px;
  text-decoration: none;
}
.community-detail-page__loading {
  display: block;
  min-height: 260px;
}
.community-detail-page__error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 220px;
  padding: 24px;
  border: 1px solid var(--73-border);
  border-radius: 12px;
  background: var(--73-surface-strong);
  color: var(--73-danger);
}
.community-detail-page__action-error {
  color: var(--73-danger);
  font-size: 13px;
}
@media (max-width: 640px) {
  .community-detail-page {
    padding-top: 16px;
  }
  .community-detail-page__back {
    min-height: 44px;
    align-items: center;
  }
  .community-detail-page__error {
    flex-direction: column;
    text-align: center;
  }
}
</style>
