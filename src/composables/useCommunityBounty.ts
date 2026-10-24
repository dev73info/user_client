import { computed, type Ref } from 'vue'

import {
  acceptBountyAnswer,
  cancelPostBounty,
  type CommunityComment,
  type CommunityPost,
} from '@/api/community'
import { useAuthStore } from '@/stores/auth'

import { TMessage } from 'ui_73info'

type UseCommunityBountyOptions = {
  /**
   * 详情区正在看的帖子。**只收引用、不持有**：`selectedPost` 是详情区 6+ 块共用的根状态，
   * 归视图所有；这里是它唯一的使用者，等后续步骤把详情区整体搬走时才跟着搬。
   */
  selectedPost: Ref<CommunityPost | null>
  /**
   * 4 处回写点（点赞 / 收藏 / 悬赏 / 推广）共用的那一个回写口子，**注入而不各写一份**：
   * 它要同时改 `posts` 列表里的那条和 `selectedPost`，这两份状态只有视图拿得到。
   */
  updateSelectedPost: (patch: Partial<CommunityPost>) => void
  /** 登录守卫：未登录时会提示并跳登录弹窗，属于视图的路由动作，注入。 */
  ensureAuthed: () => boolean
}

/**
 * 社区帖子详情区的悬赏域：状态徽标文案、作者可采纳/取消的判定、两个收尾动作。
 *
 * 悬赏本体（`bounty_points` 等字段）在帖子上，不在这里另存一份；这里只做三件事：
 * 1. 把 `bounty_points` / `bounty_status` 读成一句中文标签（进行中 / 已采纳 / 已取消）；
 * 2. 判定「当前登录人是不是作者、悬赏还在进行中」——取消与采纳是**同一个判定**，
 *    原来写成两个逐字相同的 computed，这里收成一个 `canManageBounty`，两处出口共用；
 * 3. 采纳回答与取消悬赏两个请求，成功后只把变化的那两个字段回写给 `updateSelectedPost`。
 *
 * 「这条评论是不是被采纳的那条」不在这里：R047 第 2 步把评论树搬进组件后，那一层只认帖子上的
 * `bounty_accepted_comment_id`（详情区把 id 传下去），原来那个 `isAcceptedComment` 因此成了没人用的
 * 导出，随这次搬迁删掉。
 */
export function useCommunityBounty(options: UseCommunityBountyOptions) {
  const auth = useAuthStore()

  /** 悬赏徽标文案：0 积分不显示，已收尾的显示结论，进行中的报积分数。 */
  const selectedPostBountyLabel = computed(() => {
    const post = options.selectedPost.value
    if (!post || post.bounty_points <= 0) return ''
    if (post.bounty_status === 'closed') return '悬赏已采纳'
    if (post.bounty_status === 'cancelled') return '悬赏已取消'
    return `悬赏 ${post.bounty_points} 积分`
  })

  /**
   * 能不能动这笔悬赏（取消 / 采纳）。两个动作的门槛逐字相同：登录 + 本人帖子 +
   * 悬赏进行中 + 积分大于 0，所以只留一个判定，免得两处口径将来跑偏。
   */
  const canManageBounty = computed(() => {
    const post = options.selectedPost.value
    return Boolean(
      auth.isAuthed &&
      post &&
      post.bounty_status === 'active' &&
      post.bounty_points > 0 &&
      post.author === auth.username,
    )
  })

  async function acceptBountyAnswerHandler(comment: CommunityComment) {
    if (!options.ensureAuthed() || !options.selectedPost.value) {
      return
    }
    try {
      const updated = await acceptBountyAnswer(
        auth.token,
        options.selectedPost.value.id,
        comment.id,
      )
      options.updateSelectedPost({
        bounty_status: updated.bounty_status,
        bounty_accepted_comment_id: updated.bounty_accepted_comment_id,
      })
      TMessage.success(`已采纳 ${comment.commenter} 的回答，悬赏积分已发放`)
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '采纳回答失败')
    }
  }

  async function cancelBountyHandler() {
    if (!options.ensureAuthed() || !options.selectedPost.value) {
      return
    }
    try {
      const updated = await cancelPostBounty(auth.token, options.selectedPost.value.id)
      options.updateSelectedPost({
        bounty_status: updated.bounty_status,
        bounty_accepted_comment_id: updated.bounty_accepted_comment_id,
      })
      TMessage.success('已取消悬赏，积分已退回')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '取消悬赏失败')
    }
  }

  return {
    selectedPostBountyLabel,
    canManageBounty,
    acceptBountyAnswerHandler,
    cancelBountyHandler,
  }
}
