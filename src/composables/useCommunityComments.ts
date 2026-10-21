import { ref, type Ref } from 'vue'

import {
  createCommunityComment,
  likeCommunityComment,
  listCommunityComments,
  unlikeCommunityComment,
  type CommunityComment,
  type CommunityPost,
} from '@/api/community'
import { useCommunityCommentRows } from '@/composables/useCommunityCommentRows'
import { useAuthStore } from '@/stores/auth'

import { TMessage } from 'ui_73info'

type UseCommunityCommentsOptions = {
  /** 详情区正在看的帖子：只收引用、不持有（它是详情区 6+ 块共用的根状态，归视图所有）。 */
  selectedPost: Ref<CommunityPost | null>
  /** 点赞 / 收藏 / 悬赏 / 推广 / 评论数 +1 共用的那一个回写口子（要同时改列表与 `selectedPost`）。 */
  updateSelectedPost: (patch: Partial<CommunityPost>) => void
  /** 登录守卫：未登录时会提示并跳登录弹窗，属于视图的路由动作，注入。 */
  ensureAuthed: () => boolean
  /** 竞态防护：视图的 `selectedPostRequestId` 计数器，评论请求回来后先问一句「还是最新的一枪吗」。 */
  isCurrentRequest: (requestId: number) => boolean
}

/**
 * 社区帖子详情区的评论域：取数、排序与楼号、折叠、草稿、回复目标、发评论、点赞。
 *
 * 视图只剩三件事：换帖时喊一声 `resetComments()`、把 `loadComments(postId, requestId)` 带在取详情的
 * 那一枪里、把 `rows` 摊给评论树组件。**排序 / 楼号 / 折叠**那部分纯派生在
 * `useCommunityCommentRows`（不碰 api、不发请求），这里只管状态与六个动作。
 */
export function useCommunityComments(options: UseCommunityCommentsOptions) {
  const auth = useAuthStore()
  const comments = ref<CommunityComment[]>([])
  const commentsLoading = ref(false)
  /** 评论草稿：顶部输入框与行内回复框**共用这一份**（改造前就是同一个 ref）。 */
  const commentDraft = ref('')
  /** 回复目标：非空时顶部输入框收掉、那一行下方展开行内回复框。 */
  const replyingTo = ref<CommunityComment | null>(null)
  const sendingComment = ref(false)
  const commentLikeLoading = ref<number | null>(null)

  /** 铺进 `<ul>` 的行与「展开 / 收起」；派生逻辑与「哪些楼展开了」都在那边。 */
  const { rows, toggleReplies } = useCommunityCommentRows(comments)

  /** 设回复目标要过登录守卫（未登录时先弹登录窗）。 */
  function replyToComment(comment: CommunityComment) {
    if (options.ensureAuthed()) replyingTo.value = comment
  }

  function cancelReply() {
    replyingTo.value = null
  }

  async function submitComment() {
    const post = options.selectedPost.value
    if (!post || !options.ensureAuthed() || sendingComment.value) {
      return
    }

    if (post.status !== 'published') {
      TMessage.warning('帖子公开后才能评论')
      return
    }

    sendingComment.value = true
    try {
      const created = await createCommunityComment(
        auth.token,
        post.id,
        commentDraft.value,
        replyingTo.value?.id,
      )
      comments.value = [...comments.value, created]
      options.updateSelectedPost({ comment_count: (post.comment_count ?? 0) + 1 })
      commentDraft.value = ''
      replyingTo.value = null
      TMessage.success('评论已发布')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '发表评论失败')
    } finally {
      sendingComment.value = false
    }
  }

  async function toggleCommentLike(comment: CommunityComment) {
    if (!options.ensureAuthed() || commentLikeLoading.value === comment.id) {
      return
    }

    commentLikeLoading.value = comment.id
    try {
      const state = comment.liked_by_me
        ? await unlikeCommunityComment(auth.token, comment.id)
        : await likeCommunityComment(auth.token, comment.id)
      comments.value = comments.value.map((item) =>
        item.id === comment.id
          ? { ...item, liked_by_me: state.liked_by_me, like_count: state.like_count }
          : item,
      )
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '点赞评论失败')
    } finally {
      commentLikeLoading.value = null
    }
  }

  /** 头像加载失败：把那条评论的地址置空，模板回落到首字母。 */
  function handleCommentAvatarError(comment: CommunityComment) {
    comment.commenter_avatar_url = null
  }

  /** 换帖 / 关帖时的清场。`expandedReplyIds` 不清：评论 id 全局唯一，残留的根 id 命不中新帖任何一楼。 */
  function resetComments() {
    comments.value = []
    commentDraft.value = ''
    replyingTo.value = null
    commentsLoading.value = false
  }

  async function loadComments(postId: number, requestId: number) {
    commentsLoading.value = true
    try {
      const nextComments = await listCommunityComments(postId, auth.token)
      if (options.isCurrentRequest(requestId)) {
        comments.value = nextComments
      }
    } catch (error) {
      if (options.isCurrentRequest(requestId)) {
        TMessage.error(error instanceof Error ? error.message : '加载评论失败')
      }
    } finally {
      if (options.isCurrentRequest(requestId)) {
        commentsLoading.value = false
      }
    }
  }

  return {
    commentsLoading,
    commentDraft,
    replyingTo,
    sendingComment,
    commentLikeLoading,
    rows,
    loadComments,
    resetComments,
    submitComment,
    replyToComment,
    cancelReply,
    toggleReplies,
    toggleCommentLike,
    handleCommentAvatarError,
  }
}
