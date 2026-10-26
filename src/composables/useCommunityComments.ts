import { ref, type ComputedRef } from 'vue'
import { TMessage } from 'ui_73info'

import {
  createCommunityComment,
  listCommunityComments,
  setCommunityCommentLike,
  type CommunityComment,
} from '@/api/community'
import { useCommunityAccess } from '@/composables/useCommunityAccess'
import { describeCommunityError } from '@/shared/community'

export const COMMUNITY_COMMENT_MAX_LENGTH = 800

export function useCommunityComments(options: {
  postId: ComputedRef<number | null>
  isPublished: () => boolean
}) {
  const { auth, requireLogin } = useCommunityAccess()
  const comments = ref<CommunityComment[]>([])
  const loading = ref(false)
  const error = ref('')
  const actionError = ref('')
  const text = ref('')
  const replyTo = ref<CommunityComment | null>(null)
  const submitting = ref(false)
  const likeBusyId = ref<number | null>(null)
  let requestId = 0

  async function load() {
    const id = options.postId.value
    const currentRequest = ++requestId
    comments.value = []
    error.value = ''
    actionError.value = ''
    replyTo.value = null
    if (!id) return
    loading.value = true
    try {
      const result = await listCommunityComments(auth.token, id)
      if (currentRequest === requestId) comments.value = result
    } catch (cause) {
      if (currentRequest === requestId) {
        error.value = describeCommunityError(cause, '加载评论失败')
      }
    } finally {
      if (currentRequest === requestId) loading.value = false
    }
  }

  function startReply(comment: CommunityComment) {
    if (!requireLogin()) return
    replyTo.value = comment
  }

  async function submit(): Promise<CommunityComment | null> {
    if (!requireLogin() || submitting.value) return null
    const postId = options.postId.value
    if (!postId || !options.isPublished()) {
      actionError.value = '帖子通过审核后才可评论'
      return null
    }
    const comment = text.value.trim()
    if (!comment) {
      actionError.value = '请输入评论内容'
      return null
    }
    if (Array.from(comment).length > COMMUNITY_COMMENT_MAX_LENGTH) {
      actionError.value = `评论不能超过 ${COMMUNITY_COMMENT_MAX_LENGTH} 字`
      return null
    }
    submitting.value = true
    actionError.value = ''
    try {
      const saved = await createCommunityComment(auth.token, postId, {
        comment,
        parent_comment_id: replyTo.value?.id ?? null,
      })
      comments.value = [...comments.value.filter((item) => item.id !== saved.id), saved]
      text.value = ''
      replyTo.value = null
      TMessage.success('评论已发布')
      return saved
    } catch (cause) {
      actionError.value = describeCommunityError(cause, '发布评论失败')
      return null
    } finally {
      submitting.value = false
    }
  }

  async function toggleLike(comment: CommunityComment) {
    if (!requireLogin() || likeBusyId.value !== null) return
    likeBusyId.value = comment.id
    actionError.value = ''
    try {
      const result = await setCommunityCommentLike(auth.token, comment.id, !comment.liked_by_me)
      comments.value = comments.value.map((item) =>
        item.id === comment.id
          ? { ...item, liked_by_me: result.liked_by_me, like_count: result.like_count }
          : item,
      )
    } catch (cause) {
      actionError.value = describeCommunityError(cause, '更新评论点赞失败')
    } finally {
      likeBusyId.value = null
    }
  }

  return {
    comments,
    loading,
    error,
    actionError,
    text,
    replyTo,
    submitting,
    likeBusyId,
    load,
    startReply,
    submit,
    toggleLike,
  }
}
