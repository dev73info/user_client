import { ref } from 'vue'
import { TMessage } from 'ui_73info'

import {
  createCommunityPost,
  updateCommunityPost,
  type CommunityPost,
  type CreateCommunityPostPayload,
} from '@/api/community'
import { HttpError } from '@/api/http'
import { useCommunityAccess } from '@/composables/useCommunityAccess'
import { describeCommunityError, isCommunityPostAuthor } from '@/shared/community'

export function useCommunityPostEditor() {
  const { auth, requireLogin } = useCommunityAccess()
  const open = ref(false)
  const editingPost = ref<CommunityPost | null>(null)
  const submitting = ref(false)
  const error = ref('')
  const errorCode = ref('')

  function clearError() {
    error.value = ''
    errorCode.value = ''
  }

  function openCreate() {
    if (!requireLogin()) return
    editingPost.value = null
    clearError()
    open.value = true
  }

  function openEdit(post: CommunityPost) {
    if (!requireLogin() || !isCommunityPostAuthor(post, auth.username)) return
    editingPost.value = post
    clearError()
    open.value = true
  }

  async function submit(payload: CreateCommunityPostPayload): Promise<CommunityPost | null> {
    if (!requireLogin() || submitting.value) return null
    submitting.value = true
    clearError()
    try {
      const current = editingPost.value
      const saved = current
        ? await updateCommunityPost(auth.token, current.id, {
            title: payload.title,
            tag_names: payload.tag_names,
            content_html: payload.content_html,
            origin_type: payload.origin_type,
            origin_author: payload.origin_author,
            origin_url: payload.origin_url,
            origin_org: payload.origin_org,
            origin_note: payload.origin_note,
          })
        : await createCommunityPost(auth.token, payload)
      open.value = false
      TMessage.success(current ? '帖子已保存，等待重新审核' : '帖子已提交，等待审核')
      return saved
    } catch (cause) {
      error.value = describeCommunityError(cause, currentFallback(editingPost.value !== null))
      errorCode.value = cause instanceof HttpError ? cause.code : ''
      return null
    } finally {
      submitting.value = false
    }
  }

  return { open, editingPost, submitting, error, errorCode, openCreate, openEdit, submit }
}

function currentFallback(editing: boolean): string {
  return editing ? '保存帖子失败' : '发布帖子失败'
}
