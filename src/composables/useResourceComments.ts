import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import { HttpError } from '@/api/http'
import {
  createPublicMcResourceComment,
  listPublicMcResourceComments,
  type PublicMcResourceCommentItem,
} from '@/api/resources'
import { describeBackendError } from '@/shared/backendErrorText'
import { useAuthStore } from '@/stores/auth'

/** 评论区的登录 / 实名栅栏：`action` 为空表示只是一句说明，不给按钮 */
export type CommentGate = {
  title: string
  description: string
  actionLabel: string
  action: 'login' | 'realname' | ''
}

/** 与模板里 `textarea` 的 `maxlength` 必须同值，改一处要连另一处一起改 */
export const COMMENT_MAX_LENGTH = 300

export type UseResourceCommentsOptions = {
  /** 当前资源编号；没有编号说明是脏数据，动作里只提示不请求 */
  getResourceId: () => number | null
  /** 资源是否已公开发布：未发布时评论区只留一句说明 */
  isPublished: () => boolean
  /** 是否已经拿到资源实体（未拿到时不提示「发布后可评论」） */
  hasResource: () => boolean
}

/**
 * 资源评论的取数与提交（从 `ResourceDetailPanel` 拆出来的独立取数块）。
 *
 * 这个域跟面板其余部分只共享两样东西：**令牌**（从 auth store 直接读）与**是否已公开发布**
 * （由调用方以 getter 传进来）。所以它自己拉评论、自己提交、自己管栅栏与提示，
 * 面板那边不再持有评论状态——组件只负责画。
 *
 * 令牌变化（登录 / 换号）后评论需要重拉：调用方在自己的 watch 里调 `load()`。
 */
export function useResourceComments(options: UseResourceCommentsOptions) {
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()

  const comments = ref<PublicMcResourceCommentItem[]>([])
  const loading = ref(false)
  const submitting = ref(false)
  const text = ref('')

  const textLength = computed(() => Array.from(text.value.trim()).length)
  const countLabel = computed(() =>
    comments.value.length > 0 ? `${comments.value.length} 条评论` : '暂无评论',
  )
  const canSubmit = computed(
    () =>
      auth.isAuthed &&
      options.isPublished() &&
      text.value.trim().length > 0 &&
      textLength.value <= COMMENT_MAX_LENGTH &&
      !submitting.value,
  )

  const gate = computed<CommentGate | null>(() => {
    if (options.hasResource() && !options.isPublished()) {
      return {
        title: '资源发布后可评论',
        description: '当前资源还未公开发布，评论区会在发布后开放。',
        actionLabel: '',
        action: '',
      }
    }

    if (!auth.isAuthed) {
      return {
        title: '登录后可评论',
        description: '登录并通过实名认证后，可以在这里留下资源使用反馈。',
        actionLabel: '登录',
        action: 'login',
      }
    }

    return null
  })

  function openLogin() {
    TMessage.info('请先登录后再发表评论')
    void router.push({
      name: 'home',
      query: {
        modal: 'auth',
        mode: 'login',
        redirect_to: route.fullPath,
      },
    })
  }

  function openRealnamePage() {
    void router.push({ name: 'workbench-realname', query: { redirect_to: route.fullPath } })
  }

  function handleGateAction() {
    if (!gate.value || !gate.value.action) {
      return
    }

    if (gate.value.action === 'login') {
      openLogin()
      return
    }

    openRealnamePage()
  }

  /** 换资源 / 重新取数时把草稿与列表一起清掉，别让上一条资源的评论留在新资源下面 */
  function reset() {
    comments.value = []
    text.value = ''
  }

  async function load() {
    const resourceId = options.getResourceId()
    if (!resourceId) {
      comments.value = []
      return
    }

    loading.value = true
    try {
      const token = auth.token?.trim() ? auth.token : null
      comments.value = await listPublicMcResourceComments(resourceId, token)
    } catch (error) {
      comments.value = []
      TMessage.warning(describeBackendError(error, '加载资源评论失败'))
    } finally {
      loading.value = false
    }
  }

  async function submit() {
    if (submitting.value) {
      return
    }

    const resourceId = options.getResourceId()
    if (!resourceId) {
      TMessage.warning('资源编号无效')
      return
    }

    if (!options.isPublished()) {
      TMessage.warning('资源公开发布后才可评论')
      return
    }

    if (!auth.isAuthed || !auth.token.trim()) {
      openLogin()
      return
    }

    const comment = text.value.trim()
    if (!comment) {
      TMessage.warning('请输入评论内容')
      return
    }
    if (Array.from(comment).length > COMMENT_MAX_LENGTH) {
      TMessage.warning(`评论不能超过 ${COMMENT_MAX_LENGTH} 字`)
      return
    }

    submitting.value = true
    try {
      const saved = await createPublicMcResourceComment(auth.token, resourceId, { comment })
      // 先本地插入再重拉：网络慢时用户也能立刻看到自己刚发的评论
      comments.value = [saved, ...comments.value.filter((item) => item.id !== saved.id)]
      text.value = ''
      TMessage.success('评论已发布')
      void load()
    } catch (error) {
      if (error instanceof HttpError && error.status === 403) {
        TMessage.warning('请先完成实名认证后再发表评论')
        openRealnamePage()
      } else {
        TMessage.error(describeBackendError(error, '评论提交失败'))
      }
    } finally {
      submitting.value = false
    }
  }

  return {
    comments,
    loading,
    submitting,
    text,
    textLength,
    countLabel,
    canSubmit,
    gate,
    load,
    submit,
    reset,
    handleGateAction,
  }
}
