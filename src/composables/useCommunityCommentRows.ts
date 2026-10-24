import { computed, ref, type Ref } from 'vue'

import type { CommunityComment } from '@/api/community'
import { apiUrl } from '@/api/http'

/**
 * 评论树的三种显示行：展开按钮 / 一条评论 / 收起按钮。
 * 顺序就是 `<ul>` 里的渲染顺序（展开按钮在该楼第 4 条回复之前，收起按钮在最后一条之后）。
 */
export type CommunityCommentRow =
  | { kind: 'expand'; key: string; rootId: number; hiddenCount: number }
  | { kind: 'collapse'; key: string; rootId: number }
  | {
      kind: 'comment'
      key: string
      comment: CommunityComment
      /** 回复层级（主楼 0），原样写进 `<li>` 的 `--comment-depth` 内联变量。 */
      depth: number
      /** 楼号：按铺开顺序从 1 数。 */
      floor: number
      /** 「回复 @谁」的名字与被引用的原文摘要，空串表示不显示。 */
      parentName: string
      parentExcerpt: string
      /** 头像地址（已过 `apiUrl`；空串走 `initial` 首字母兜底）。 */
      avatarUrl: string
      initial: string
    }

/** 单条评论行：`CommunityCommentItem.vue` 直接吃这个类型（它只管渲染一条 `<li>`）。 */
export type CommunityCommentItemRow = Extract<CommunityCommentRow, { kind: 'comment' }>

/**
 * 评论树的**纯派生态**：排序、楼号、折叠判定，以及「怎么铺进一个 `<ul>`」。
 *
 * 从 `useCommunityComments` 里分出来的唯一理由是行数预算（那边还要放取数与六个动作），
 * 切分线也很干脆：**这里不碰 api、不发请求、不弹提示**，只吃一份 `comments` 和一个「哪些楼展开了」
 * 的本地状态，吐一份可以直接 `v-for` 的行。因此它可以脱离页面单独测。
 *
 * 「同一楼超过 3 条回复就折叠」这套阈值与三处判定照搬改造前的实现，一行没改。
 */
export function useCommunityCommentRows(comments: Ref<CommunityComment[]>) {
  /** 已展开的楼（按根评论 id 记）。展开/收起只影响显示，不属于评论域的业务状态，所以留在这里。 */
  const expandedReplyIds = ref(new Set<number>())

  /** 按「父 → 子」深度优先铺平：树是同一个 `<ul>`，子评论靠 `--comment-depth` 缩进而不是嵌套节点。 */
  const orderedComments = computed(() => {
    const childrenByParent = new Map<number | null, CommunityComment[]>()
    for (const comment of comments.value) {
      const parentId = comment.parent_comment_id ?? null
      const children = childrenByParent.get(parentId) ?? []
      children.push(comment)
      childrenByParent.set(parentId, children)
    }

    const ordered: CommunityComment[] = []
    const appendComments = (parentId: number | null) => {
      for (const comment of childrenByParent.get(parentId) ?? []) {
        ordered.push(comment)
        appendComments(comment.id)
      }
    }
    appendComments(null)
    return ordered
  })

  /** 沿 `parent_comment_id` 往上走一趟，同时得到深度与根楼 id（两处用的是同一趟遍历）。 */
  function traceOf(comment: CommunityComment): { depth: number; rootId: number } {
    let depth = 0
    let rootId = comment.id
    let parentId = comment.parent_comment_id ?? null
    const visited = new Set<number>()
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId)
      depth += 1
      rootId = parentId
      parentId = comments.value.find((item) => item.id === parentId)?.parent_comment_id ?? null
    }
    return { depth, rootId }
  }

  const rootIdOf = (comment: CommunityComment) => traceOf(comment).rootId

  /** 一栋楼里的全部回复（含孙回复），按铺开顺序。 */
  function repliesOf(rootId: number): CommunityComment[] {
    return orderedComments.value.filter(
      (comment) => comment.id !== rootId && rootIdOf(comment) === rootId,
    )
  }

  function replyIndexOf(comment: CommunityComment): number {
    if (!comment.parent_comment_id) return -1
    return repliesOf(rootIdOf(comment)).findIndex((item) => item.id === comment.id)
  }

  function isReplyCollapsed(comment: CommunityComment): boolean {
    if (!comment.parent_comment_id || expandedReplyIds.value.has(rootIdOf(comment))) return false
    return replyIndexOf(comment) >= 3
  }

  function shouldShowReplyToggle(comment: CommunityComment): boolean {
    const rootId = rootIdOf(comment)
    return Boolean(
      comment.parent_comment_id &&
      replyIndexOf(comment) === 3 &&
      repliesOf(rootId).length > 3 &&
      !expandedReplyIds.value.has(rootId),
    )
  }

  function shouldShowCollapseToggle(comment: CommunityComment): boolean {
    const rootId = rootIdOf(comment)
    const replies = repliesOf(rootId)
    return Boolean(
      comment.parent_comment_id &&
      expandedReplyIds.value.has(rootId) &&
      replies.length > 3 &&
      replyIndexOf(comment) === replies.length - 1,
    )
  }

  /** 被回复的那条评论（用于「回复 @谁」+ 一行原文摘要）。 */
  function parentOf(comment: CommunityComment) {
    const parent = comment.parent_comment_id
      ? comments.value.find((item) => item.id === comment.parent_comment_id)
      : null
    const name = comment.parent_commenter?.trim() || parent?.commenter || ''
    const text = parent?.comment_text?.trim() ?? ''
    return { name, excerpt: text.length > 56 ? `${text.slice(0, 56)}...` : text }
  }

  /** 三层判定一次算完：组件只 `v-for` 一遍、按 `kind` 三选一，不重算楼层与折叠。 */
  const rows = computed<CommunityCommentRow[]>(() => {
    const nextRows: CommunityCommentRow[] = []
    orderedComments.value.forEach((comment, index) => {
      const rootId = rootIdOf(comment)
      if (shouldShowReplyToggle(comment)) {
        const hiddenCount = Math.max(0, repliesOf(rootId).length - 3)
        nextRows.push({ kind: 'expand', key: `expand-${rootId}`, rootId, hiddenCount })
      }

      if (!isReplyCollapsed(comment)) {
        const parent = parentOf(comment)
        const avatarUrl = comment.commenter_avatar_url?.trim() ?? ''
        nextRows.push({
          kind: 'comment',
          key: `comment-${comment.id}`,
          comment,
          depth: traceOf(comment).depth,
          floor: index + 1,
          parentName: parent.name,
          parentExcerpt: parent.excerpt,
          avatarUrl: avatarUrl ? apiUrl(avatarUrl) : '',
          // 头像兜底的首字母（改造前 avatarInitial 的同一句）
          initial: Array.from(comment.commenter?.trim() || '用')[0] ?? '用',
        })
      }

      if (shouldShowCollapseToggle(comment)) {
        nextRows.push({ kind: 'collapse', key: `collapse-${rootId}`, rootId })
      }
    })
    return nextRows
  })

  /** 展开 / 收起某栋楼：换一个新 Set 触发响应式（原地增删不会触发）。 */
  function toggleReplies(rootId: number) {
    const next = new Set(expandedReplyIds.value)
    if (next.has(rootId)) next.delete(rootId)
    else next.add(rootId)
    expandedReplyIds.value = next
  }

  return { rows, toggleReplies }
}
