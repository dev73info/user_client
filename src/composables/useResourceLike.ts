import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import { HttpError } from '@/api/http'
import {
  invalidateResourceListCache,
  likePublicMcResource,
  unlikePublicMcResource,
  type PublicMcResourceLikeState,
} from '@/api/resources'
import { describeBackendError } from '@/shared/backendErrorText'
import { useAuthStore } from '@/stores/auth'

export type UseResourceLikeOptions = {
  /** 当前资源编号（拿不到就只提示，不请求） */
  getResourceId: () => number | null
  /** 我是否已经点过赞（决定这次是点赞还是取消） */
  getLiked: () => boolean
  /** 资源是否已公开发布：未发布不可点赞 */
  isPublished: () => boolean
  /** 把接口返回的最新赞态写回调用方的资源对象 */
  applyLikeState: (state: PublicMcResourceLikeState) => void
}

/**
 * 资源点赞（从 `ResourceDetailPanel` 拆出来的动作域）。
 *
 * 组件只留按钮：这颗按钮在摘要卡的 CTA 行里，不在评论卡里，所以点赞单独成一份
 * （评论那套在 `useResourceComments`，两者只共享「是否已公开发布」这一个判定）。
 *
 * 失败口径沿用原实现：401 视为令牌失效——清登录态并引导去登录；
 * 其余错误原样把后端文案 toast 出来。
 */
export function useResourceLike(options: UseResourceLikeOptions) {
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()

  const submitting = ref(false)

  function openLogin() {
    TMessage.info('请先登录后再点赞')
    void router.push({
      name: 'home',
      query: {
        modal: 'auth',
        mode: 'login',
        redirect_to: route.fullPath,
      },
    })
  }

  async function toggle() {
    if (submitting.value) {
      return
    }

    const resourceId = options.getResourceId()
    if (!resourceId) {
      TMessage.warning('资源编号无效')
      return
    }

    if (!options.isPublished()) {
      TMessage.warning('资源公开发布后才可点赞')
      return
    }

    if (!auth.isAuthed || !auth.token.trim()) {
      openLogin()
      return
    }

    submitting.value = true
    try {
      const state = options.getLiked()
        ? await unlikePublicMcResource(auth.token, resourceId)
        : await likePublicMcResource(auth.token, resourceId)
      options.applyLikeState(state)
      // 列表页的卡片上也带着赞数，点完要让它重拉
      invalidateResourceListCache()
      TMessage.success(state.liked_by_me ? '已点赞' : '已取消点赞')
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        auth.logout()
        openLogin()
      } else {
        TMessage.error(describeBackendError(error, '点赞操作失败'))
      }
    } finally {
      submitting.value = false
    }
  }

  return { submitting, toggle }
}
