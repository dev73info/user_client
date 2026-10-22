import { ref, type Ref } from 'vue'

import { getCommunityPost, type CommunityPost } from '@/api/community'
import { useAuthStore } from '@/stores/auth'

import { TMessage } from 'ui_73info'

type UseCommunityPostDetailOptions = {
  /**
   * 详情区正在看的那篇。**只收引用、不持有**：它是详情区 6+ 块共用的根状态，
   * 由视图创建、单实例、按引用传给四个域。本域是**唯一**写它的地方。
   */
  selectedPost: Ref<CommunityPost | null>
  /** 列表里怎么找到点名的那篇（`posts` 归 `useCommunityFeed`，注入查找而不自己存一份）。 */
  findPost: (postId: number) => CommunityPost | undefined
  /** 把取回来的详情并回列表那条与详情本身（四个域共用的那一个回写口，注入）。 */
  updateSelectedPost: (patch: Partial<CommunityPost>) => void
  /**
   * 换帖时要清掉的评论侧状态（草稿 / 回复目标 / 已展开的楼）。评论域在本域之后才创建，
   * 所以这里按「用时再取」注入，而不是传一个此刻还不存在的函数引用。
   */
  resetComments: () => void
  /** 取回帖子的评论。同上，按用时再取注入。 */
  loadComments: (postId: number, requestId: number) => void
}

/**
 * 社区页的「详情选中与取数」域：换帖、按 id 单取、补取正文，以及共用的竞态计数器。
 *
 * 从 `views/CommunityView.vue` 抽出来（R047 第三轮收尾）。**它管住的是那一条竞态线**：
 * 四条加载路径（列表选中 / 地址栏跳转 / 按 id 单取 / 补取正文）都在这里 `++` 同一个计数器，
 * 晚到的响应一律丢弃；评论域不另立计数器，只用 `isCurrentRequest` 读它
 * （`useCommunityComments` 的 `isCurrentRequest` 就接在这里）。
 *
 * 拆出来之前它是视图里 5 个函数 + 2 个状态，谁都能改；现在「写 `selectedPost`」这件事
 * 收成一处，视图只拿 `selectPost` / `selectPostById` 两个入口。
 */
export function useCommunityPostDetail(options: UseCommunityPostDetailOptions) {
  const auth = useAuthStore()
  const selectedPostLoading = ref(false)
  /** 换帖竞态计数器：本域独占，评论区只读（见 `isCurrentRequest`）。 */
  let requestId = 0

  /** 评论域用它判定「这个响应还是不是当前这篇的」。 */
  function isCurrentRequest(id: number): boolean {
    return id === requestId
  }

  /**
   * 选中一篇（或清空）：推进计数器 → 换帖 → 清评论侧状态 → 正文缺了才补取 → 取评论。
   * 顺序与拆分前一致（评论请求与正文请求并发，两条都带同一个 `requestId`）。
   */
  function selectPost(post: CommunityPost | null) {
    const currentRequestId = ++requestId
    options.selectedPost.value = post
    options.resetComments()
    if (post) {
      if (post.content_html) {
        selectedPostLoading.value = false
      } else {
        void loadDetail(post.id, currentRequestId)
      }
      options.loadComments(post.id, currentRequestId)
    } else {
      selectedPostLoading.value = false
    }
  }

  /** 地址栏点名的那篇：在当前页就直接选中，不在就按 id 单取。 */
  function selectPostById(postId: number) {
    const post = options.findPost(postId)
    if (post) {
      selectPost(post)
      return
    }

    void loadStandalonePost(postId)
  }

  /** 清空详情、按 id 单取，取回来再拉评论（深链进来看单篇的路径）。 */
  async function loadStandalonePost(postId: number) {
    const currentRequestId = ++requestId
    options.selectedPost.value = null
    selectedPostLoading.value = true
    options.resetComments()

    try {
      const detail = await getCommunityPost(postId, auth.token)
      if (!isCurrentRequest(currentRequestId)) {
        return
      }

      options.selectedPost.value = detail
      selectedPostLoading.value = false
      options.loadComments(detail.id, currentRequestId)
    } catch (error) {
      if (isCurrentRequest(currentRequestId)) {
        selectedPostLoading.value = false
        TMessage.error(error instanceof Error ? error.message : '加载帖子详情失败')
      }
    }
  }

  /** 列表里那条只有摘要时补取正文：回来的详情顺手并回列表，免得卡片与详情两套数据。 */
  async function loadDetail(postId: number, currentRequestId: number) {
    selectedPostLoading.value = true
    try {
      const detail = await getCommunityPost(postId, auth.token)
      if (!isCurrentRequest(currentRequestId)) {
        return
      }
      options.updateSelectedPost(detail)
    } catch (error) {
      if (isCurrentRequest(currentRequestId)) {
        TMessage.error(error instanceof Error ? error.message : '加载帖子详情失败')
      }
    } finally {
      if (isCurrentRequest(currentRequestId)) {
        selectedPostLoading.value = false
      }
    }
  }

  return {
    selectedPostLoading,
    isCurrentRequest,
    selectPost,
    selectPostById,
    loadStandalonePost,
  }
}
