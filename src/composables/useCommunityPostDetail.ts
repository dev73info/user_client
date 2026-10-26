import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { TMessage } from 'ui_73info'

import {
  acceptCommunityBounty,
  boostCommunityPost,
  cancelCommunityBounty,
  getCommunityPost,
  setCommunityPostFavorite,
  setCommunityPostLike,
  type CommunityBoostKind,
  type CommunityPost,
} from '@/api/community'
import { HttpError } from '@/api/http'
import { useCommunityAccess } from '@/composables/useCommunityAccess'
import { describeCommunityError } from '@/shared/community'

export function useCommunityPostDetail() {
  const route = useRoute()
  const { auth, requireLogin } = useCommunityAccess()
  const post = ref<CommunityPost | null>(null)
  const loading = ref(false)
  const error = ref('')
  const actionError = ref('')
  const actionErrorCode = ref('')
  const actionBusy = ref('')
  const boostOpen = ref(false)
  let requestId = 0

  const postId = computed(() => {
    const value = Number(route.params.id)
    return Number.isSafeInteger(value) && value > 0 ? value : null
  })
  const isAuthor = computed(() =>
    Boolean(post.value && auth.username.trim() && post.value.author === auth.username.trim()),
  )

  async function load() {
    const id = postId.value
    const currentRequest = ++requestId
    post.value = null
    error.value = ''
    actionError.value = ''
    if (!id) {
      error.value = '帖子编号无效'
      return
    }
    loading.value = true
    try {
      const result = await getCommunityPost(auth.token, id)
      if (currentRequest === requestId) post.value = result
    } catch (cause) {
      if (currentRequest === requestId) {
        error.value = describeCommunityError(cause, '加载帖子详情失败')
      }
    } finally {
      if (currentRequest === requestId) loading.value = false
    }
  }

  async function runAction(
    key: string,
    fallback: string,
    action: () => Promise<void>,
  ): Promise<boolean> {
    if (!requireLogin() || !post.value || actionBusy.value) return false
    actionBusy.value = key
    actionError.value = ''
    actionErrorCode.value = ''
    try {
      await action()
      return true
    } catch (cause) {
      actionError.value = describeCommunityError(cause, fallback)
      actionErrorCode.value = cause instanceof HttpError ? cause.code : ''
      return false
    } finally {
      actionBusy.value = ''
    }
  }

  function toggleLike() {
    const current = post.value
    if (!current) return Promise.resolve(false)
    return runAction('post-like', '更新帖子点赞失败', async () => {
      const result = await setCommunityPostLike(auth.token, current.id, !current.liked_by_me)
      if (post.value?.id === current.id) {
        post.value = {
          ...post.value,
          liked_by_me: result.liked_by_me,
          like_count: result.like_count,
        }
      }
    })
  }

  function toggleFavorite() {
    const current = post.value
    if (!current) return Promise.resolve(false)
    return runAction('post-favorite', '更新帖子收藏失败', async () => {
      const result = await setCommunityPostFavorite(
        auth.token,
        current.id,
        !current.favorited_by_me,
      )
      if (post.value?.id === current.id) {
        post.value = { ...post.value, favorited_by_me: result.favorited_by_me }
      }
      TMessage.success(result.favorited_by_me ? '已收藏' : '已取消收藏')
    })
  }

  function acceptBounty(commentId: number) {
    const current = post.value
    if (!current) return Promise.resolve(false)
    return runAction(`accept-${commentId}`, '采纳悬赏回答失败', async () => {
      post.value = await acceptCommunityBounty(auth.token, current.id, commentId)
      TMessage.success('已采纳悬赏回答')
    })
  }

  function cancelBounty() {
    const current = post.value
    if (!current) return Promise.resolve(false)
    return runAction('bounty-cancel', '取消悬赏失败', async () => {
      post.value = await cancelCommunityBounty(auth.token, current.id)
      TMessage.success('悬赏已取消，积分已退回')
    })
  }

  function openBoost() {
    if (!requireLogin()) return
    actionError.value = ''
    actionErrorCode.value = ''
    boostOpen.value = true
  }

  async function submitBoost(kind: CommunityBoostKind) {
    const current = post.value
    if (!current) return false
    const succeeded = await runAction('boost', '推广帖子失败', async () => {
      post.value = await boostCommunityPost(auth.token, current.id, kind)
      TMessage.success('推广已生效')
    })
    if (succeeded) boostOpen.value = false
    return succeeded
  }

  return {
    post,
    postId,
    isAuthor,
    loading,
    error,
    actionError,
    actionErrorCode,
    actionBusy,
    boostOpen,
    load,
    toggleLike,
    toggleFavorite,
    acceptBounty,
    cancelBounty,
    openBoost,
    submitBoost,
  }
}
