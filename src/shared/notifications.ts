import type { CommentWarning, CommunityPost } from '@/api/community'
import type { ConversationHistoryDisclosure } from '@/api/conversations'
import type { AfterSalesCase } from '@/api/afterSales'
import { afterSalesKindLabel, afterSalesStatusLabel } from '@/shared/afterSalesStatus'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

/**
 * 「系统通知」页的聚合层。
 *
 * 这一页把四类通知合成同一种卡片：评论警告（社区/资源评论被管理员警告）、
 * 历史沟通公开申请（前任开发者负责期间的沟通记录要不要公开）、售后案件（我给出去或收到的那条
 * 售后现在走到哪一步）、平台公告（官方活动与广播）。四者的后端接口、字段、可做的动作都不一样，
 * 页面上却要是同一种卡片，所以差异全部收在这里，页面只负责渲染与调用动作：
 *
 * | 来源 | 接口 | 卡片可做的动作 |
 * | --- | --- | --- |
 * | 评论警告 | `/community/comment-warnings` | 无（只读，说明原因） |
 * | 历史沟通公开申请 | `/conversation/history-disclosures` | 同意公开 / 拒绝（两票制，轮到自己才能投） |
 * | 售后案件 | `/after-sales/cases` | 无（只读，发起与表态都在需求列表的售后弹窗里做） |
 * | 平台公告 | `/community/posts?tag=公告` | 无（点卡片进社区帖） |
 *
 * 后端没有通知表，也没有已读/未读字段，所以这里不产生任何状态，只做映射与排序。
 */

export type NotificationKind =
  | 'comment-warning'
  | 'history-disclosure'
  | 'after-sales'
  | 'announcement'

/** 卡片上的类别标签，与筛选胶囊一一对应。 */
export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  'comment-warning': '评论警告',
  'history-disclosure': '公开申请',
  'after-sales': '售后案件',
  announcement: '平台公告',
}

export type NotificationCard = {
  /** 跨类别唯一的键：三类来源的 id 各自从 1 开始，只拼 id 会撞在一起 */
  key: string
  kind: NotificationKind
  /** 类别标签（胶囊筛选与卡片徽标共用同一份文案） */
  kindLabel: string
  /** 主标题：公告是帖子标题，公开申请是需求名，评论警告是说明性短句 */
  title: string
  /** 卡片的正文行，按顺序渲染 */
  body: string[]
  /** 时间与操作人等弱信息，卡片右上角一行 */
  meta: string
  /** 原始时间字符串，用于显示 */
  createdAt: string
  /** 排序用的毫秒数：三类来源的时间格式不同，统一在聚合层解析一次 */
  sortTime: number
  /** 评论警告展示原评论快照，操作栏留空 */
  snapshot?: string
  /** 平台公告点击后要跳的社区帖 id */
  postId?: number
  /** 公开申请：投票要用到的 id */
  disclosureId?: number
  /** 公开申请：当前是否轮到我投票（只有轮到我时才给按钮） */
  canVote: boolean
  /** 公开申请：两票状态的一句话说明，投票按钮上方展示 */
  voteHint?: string
}

export type NotificationSources = {
  warnings?: CommentWarning[]
  disclosures?: ConversationHistoryDisclosure[]
  afterSales?: AfterSalesCase[]
  announcements?: CommunityPost[]
  /** 当前登录用户名：判定公开申请里我是哪一方、是否轮到我投票 */
  username: string
}

/**
 * 把四类来源合成一张按时间倒序的通知列表。
 *
 * 时间格式各类都不一样（评论警告与帖子是 `YYYY-MM-DD HH:MM:SS`，公开申请与售后案件带时区），
 * 解析失败的排在最后而不是排到最前——解析不出来当成「很早」，不要因为格式异常把一条旧通知顶到最上面。
 */
export function buildNotificationCards(sources: NotificationSources): NotificationCard[] {
  const cards = [
    ...(sources.warnings ?? []).map(buildCommentWarningCard),
    ...(sources.disclosures ?? []).map((item) => buildHistoryDisclosureCard(item, sources.username)),
    ...(sources.afterSales ?? []).map(buildAfterSalesCard),
    ...(sources.announcements ?? []).map(buildAnnouncementCard),
  ]

  return cards.sort((left, right) => right.sortTime - left.sortTime)
}

/** 与后端「Asia/Shanghai」的 `YYYY-MM-DD HH:MM:SS` 对齐：这种字符串 `new Date()` 在 Safari 上解析不了，补成 ISO 再解析。 */
export function parseNoticeTime(value?: string | null): number {
  if (!value) {
    return 0
  }

  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const time = new Date(normalized).getTime()
  return Number.isNaN(time) ? 0 : time
}

function buildCommentWarningCard(warning: CommentWarning): NotificationCard {
  return {
    key: `comment-warning-${warning.id}`,
    kind: 'comment-warning',
    kindLabel: NOTIFICATION_KIND_LABELS['comment-warning'],
    title: warning.comment_type === 'resource' ? '资源评论被平台警告' : '社区评论被平台警告',
    // 原评论与原因分两行：原因往往是长句，与快照挤在一行会把快照截掉，而快照是用户唯一能对照的内容。
    body: [`原评论：${warning.comment_snapshot || '（内容已不可见）'}`, `警告原因：${warning.reason}`],
    meta: `${warning.created_at} · 操作人 ${warning.operator}`,
    createdAt: warning.created_at,
    sortTime: parseNoticeTime(warning.created_at),
    snapshot: warning.comment_snapshot,
    canVote: false,
  }
}

function buildHistoryDisclosureCard(
  disclosure: ConversationHistoryDisclosure,
  username: string,
): NotificationCard {
  const title = disclosure.requirement_title || disclosure.requirement_id
  return {
    key: `history-disclosure-${disclosure.id}`,
    kind: 'history-disclosure',
    kindLabel: NOTIFICATION_KIND_LABELS['history-disclosure'],
    title,
    body: [
      `${disclosure.requirement_id} · 前任开发者 ${disclosure.previous_developer}，现任开发者 ${disclosure.current_developer}`,
      '现任开发者申请查看前任开发者负责期间的沟通记录。你和对方都同意后，这段记录才会向他公开；任何一方拒绝则维持隐藏。',
    ],
    meta: `${disclosure.created_at} 发起`,
    createdAt: disclosure.created_at,
    sortTime: parseNoticeTime(disclosure.created_at),
    disclosureId: disclosure.id,
    canVote: canVoteHistoryDisclosure(disclosure, username),
    voteHint: historyDisclosureVoteHint(disclosure, username),
    // 卡片上还要显示两票各自的进度，标签由下面这两个字段衍生（见 voteStateLabels）。
  }
}

/**
 * 这张公开申请现在轮不轮到我投票。
 *
 * 与消息中心同一口径：前任开发者只投 `developer_consent`、客户只投 `customer_consent`，
 * 已经投过（approved / rejected）或这一票不属于我就没有按钮——按钮点下去后端会拒，
 * 摆在界面上只会让人以为还能改主意。
 */
export function canVoteHistoryDisclosure(
  disclosure: ConversationHistoryDisclosure,
  username: string,
): boolean {
  if (disclosure.status !== 'pending') {
    return false
  }
  if (username === disclosure.previous_developer) {
    return disclosure.developer_consent === 'pending'
  }
  if (username === disclosure.customer) {
    return disclosure.customer_consent === 'pending'
  }
  return false
}

function consentLabel(value: ConversationHistoryDisclosure['developer_consent']): string {
  return { pending: '待表决', approved: '已同意', rejected: '已拒绝' }[value]
}

/** 两票进度的一句话说明：把「等谁」摊开，免得「待表决」被当成在等我。 */
function historyDisclosureVoteHint(
  disclosure: ConversationHistoryDisclosure,
  username: string,
): string {
  const developer = `前任开发者 ${consentLabel(disclosure.developer_consent)}`
  const customer = `客户 ${consentLabel(disclosure.customer_consent)}`
  if (disclosure.status !== 'pending') {
    return `${developer} · ${customer} · ${disclosure.status === 'approved' ? '已公开' : '申请未通过'}`
  }
  if (canVoteHistoryDisclosure(disclosure, username)) {
    return `${developer} · ${customer} · 还在等你这一票`
  }
  if (username === disclosure.current_developer) {
    return `${developer} · ${customer} · 等双方确认后自动公开`
  }
  return `${developer} · ${customer}`
}

/**
 * 售后案件卡片：只读。
 *
 * 为什么要进通知页：案件状态的每一次变化都只落在需求会话里的一张卡片上，而结单之后双方本来就
 * 不太会再去盯需求列表——会话未读是个角标，很容易被忽略过去。这里给它第二个可见面。
 *
 * 卡片不带动作：发起、接受/不接受、撤回都在需求列表的售后弹窗里做，这里再摆一套按钮就是
 * 两份规则；与评论警告同一取舍（只读，说明现状）。
 */
function buildAfterSalesCard(row: AfterSalesCase): NotificationCard {
  const claim =
    row.claimAmountFen > 0
      ? `${afterSalesKindLabel(row.kind)}（诉求额度 ${row.claimAmountCny} 元）`
      : afterSalesKindLabel(row.kind)
  return {
    key: `after-sales-${row.id}`,
    kind: 'after-sales',
    kindLabel: NOTIFICATION_KIND_LABELS['after-sales'],
    title: row.requirementTitle || row.requirementId,
    body: [
      `${row.caseNo} · 需求 ${row.requirementId}`,
      `诉求：${claim} · 当前状态：${afterSalesStatusLabel(row.status)}`,
    ],
    // 时间与发起人放在弱信息行：卡片右上角只摆这两项，正文留给「这条售后在等谁做什么」。
    meta: `${row.createdAt} 由 ${row.openedBy} 发起`,
    createdAt: row.createdAt,
    sortTime: parseNoticeTime(row.createdAt),
    canVote: false,
  }
}

function buildAnnouncementCard(post: CommunityPost): NotificationCard {
  return {
    key: `announcement-${post.id}`,
    kind: 'announcement',
    kindLabel: NOTIFICATION_KIND_LABELS.announcement,
    title: post.title,
    body: [announcementPreview(post.content_html)],
    meta: `${post.published_at} 发布`,
    createdAt: post.published_at,
    sortTime: parseNoticeTime(post.published_at),
    postId: post.id,
    canVote: false,
  }
}

/** 公告正文摘要：富文本先净化再剥标签，与我的收藏的预览同一做法（sanitizeHtml 已在前端过一次）。 */
export function announcementPreview(contentHtml: string, limit = 140): string {
  const text = sanitizeRichHtml(contentHtml).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  if (!text) {
    return '点击查看公告全文。'
  }
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

/** 各类别的条数：读数条与筛选胶囊的计数都取这里，避免两处各算一遍。 */
export function countByKind(cards: NotificationCard[]): Record<NotificationKind, number> {
  return {
    'comment-warning': cards.filter((card) => card.kind === 'comment-warning').length,
    'history-disclosure': cards.filter((card) => card.kind === 'history-disclosure').length,
    'after-sales': cards.filter((card) => card.kind === 'after-sales').length,
    announcement: cards.filter((card) => card.kind === 'announcement').length,
  }
}

/** 还在等我投票的公开申请数：读数条与「待我确认」那一格用。 */
export function pendingVoteCount(cards: NotificationCard[]): number {
  return cards.filter((card) => card.kind === 'history-disclosure' && card.canVote).length
}

/**
 * 类别筛选 + 关键字搜索。
 *
 * 搜索覆盖标题、正文与弱信息行：用户记得的多半是「哪条需求」「公告里的某个词」，
 * 只搜标题会让「在正文里提过但你忘了标题」的通知搜不到。
 */
export function filterNotificationCards(
  cards: NotificationCard[],
  kind: NotificationKind | 'all',
  keyword: string,
): NotificationCard[] {
  const search = keyword.trim().toLocaleLowerCase()
  return cards.filter((card) => {
    if (kind !== 'all' && card.kind !== kind) {
      return false
    }
    if (!search) {
      return true
    }
    return [card.title, card.kindLabel, card.meta, ...card.body]
      .join(' ')
      .toLocaleLowerCase()
      .includes(search)
  })
}
