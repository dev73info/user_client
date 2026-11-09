import type { ConversationHistoryDisclosure } from '@/api/conversations'
import type { AfterSalesCaseSummary } from '@/api/afterSales'
import type { CommunityCommentWarning } from '@/api/community'
import type { BackendNotification } from '@/api/notifications'

import { dedupeNotificationCards } from './dedupe'
import {
  backendKindLabel,
  notificationEventLabel,
  notificationKindOf,
  resolveNotificationLink,
} from './events'
import { parseNoticeTime } from './time'
import type { NotificationCard, NotificationSources } from './types'

/**
 * 把四类来源合成一张按时间倒序的通知列表。
 *
 * 前三支是本地聚合（公开申请 / 争议案件 / 评论警告），第四支是后端收件箱。
 * 时间串都是东八区墙钟串，统一交给 `parseNoticeTime` 解析；解析失败的排在最后而不是排到最前——
 * 解析不出来当成「很早」，不要因为格式异常把一条旧通知顶到最上面。
 *
 * 本地卡排在前面：与收件箱重复时保留字段更全的本地卡（评论警告带评论快照与原因），
 * 再把收件箱那条的已读态并过去（见 `dedupeNotificationCards`）。
 */
export function buildNotificationCards(sources: NotificationSources): NotificationCard[] {
  const cards = [
    ...(sources.disclosures ?? []).map((item) =>
      buildHistoryDisclosureCard(item, sources.username),
    ),
    ...(sources.afterSales ?? []).map(buildAfterSalesCard),
    ...(sources.commentWarnings ?? []).map(buildCommentWarningCard),
    ...(sources.inbox ?? []).map((item) => buildInboxCard(item, sources.isDevWorkbench === true)),
  ]

  return dedupeNotificationCards(cards).sort(
    (left, right) => right.sortTime - left.sortTime || left.key.localeCompare(right.key),
  )
}

function buildHistoryDisclosureCard(
  disclosure: ConversationHistoryDisclosure,
  username: string,
): NotificationCard {
  const title = disclosure.requirement_title || disclosure.requirement_id
  return {
    key: `history-disclosure-${disclosure.id}`,
    kind: 'requirement',
    source: 'history-disclosure',
    kindLabel: '公开申请',
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
 * 争议按案件合并的组键。
 *
 * 后端争议通知的 `biz_no` 是需求单号，本地案件卡也带 `requirement_id`，两边用同一条
 * `dispute:{需求号}`。同一案件的立案 / 介入 / 裁决 / 结案是同一件事的连续状态，
 * 合并成一张卡：本地卡展示当前状态，收件箱那条补上已读态与跳转。
 */
function disputeGroupKey(requirementId: string | null | undefined): string | undefined {
  const value = (requirementId ?? '').trim()
  return value ? `dispute:${value}` : undefined
}

/**
 * 争议案件卡片：只读。
 *
 * 为什么要进通知页：案件状态的每一次变化都只落在需求会话里的一张卡片上，而结单之后双方本来就
 * 不太会再去盯需求列表——会话未读是个角标，很容易被忽略过去。这里给它第二个可见面。
 *
 * 卡片不带动作：发起、接受/不接受、撤回都在需求列表的解除合作弹窗里做，这里再摆一套按钮就是
 * 两份规则（只读，说明现状）。筛选上归到「需求」：争议都挂在某张需求单上。
 */
function buildAfterSalesCard(row: AfterSalesCaseSummary): NotificationCard {
  const claim = row.claim_amount_fen > 0 ? `主张金额 ${row.claim_amount} 元` : '不主张资金'
  return {
    key: `after-sales-${row.case_no}`,
    kind: 'requirement',
    source: 'after-sales',
    kindLabel: '争议',
    title: row.requirement_id,
    body: [`${row.case_no} · ${row.kind_label}`, `诉求：${claim} · 当前状态：${row.status_label}`],
    meta: `${row.created_time} 由 ${row.filed_by} 发起`,
    createdAt: row.created_time,
    sortTime: parseNoticeTime(row.created_time),
    groupKey: disputeGroupKey(row.requirement_id),
    caseStatus: row.status_label,
    canVote: false,
  }
}

/**
 * 评论警告只读：源评论可能已删除，卡片直接展示保留的快照，不依赖原评论是否还存在。
 *
 * `groupKey` 与后端 `comment_warned` 通知的 `biz_no` 同构（`comment:{类型}-{评论 id}`）：
 * 同一次警告在两个来源里都出现时，按「分组键 + 同一时间」去重。
 */
function buildCommentWarningCard(warning: CommunityCommentWarning): NotificationCard {
  return {
    key: `comment-warning-${warning.id}`,
    kind: 'system',
    source: 'comment-warning',
    kindLabel: '评论警告',
    title: `评论 #${warning.comment_id}`,
    body: [`评论快照：${warning.comment_snapshot}`, `警告原因：${warning.reason}`],
    meta: `${warning.created_at} 由 ${warning.operator} 发出警告`,
    createdAt: warning.created_at,
    sortTime: parseNoticeTime(warning.created_at),
    groupKey: `comment:${warning.comment_type}-${warning.comment_id}`,
    canVote: false,
  }
}

/**
 * 后端收件箱卡片：标题 / 正文直接取后端成品文案。
 *
 * 去重键分两类：
 * - 争议事件（`dispute_*`）用案件级键 `dispute:{需求号}`，与本地案件卡合并成一条；
 * - `biz_no` 里带命名空间的（`comment:` / `community_post:` / `resource:`）是事件级键，
 *   与本地来源按「分组键 + 同一时间」匹配。
 * 需求单号这类裸业务号不单独做键——需求事件（交付/验收等）本来就是各自独立的一条。
 */
function buildInboxCard(item: BackendNotification, isDevWorkbench: boolean): NotificationCard {
  const kind = notificationKindOf(item.kind)
  const bizNo = (item.biz_no ?? '').trim()
  const event = (item.event ?? '').trim()
  const groupKey = event.startsWith('dispute_')
    ? disputeGroupKey(bizNo)
    : bizNo.includes(':')
      ? bizNo
      : undefined
  const sortTime = parseNoticeTime(item.created_time)
  return {
    key: `notification-${item.notification_id}`,
    kind,
    source: 'inbox',
    kindLabel: notificationEventLabel(item.event) ?? backendKindLabel(item.kind),
    title: item.title,
    body: item.body.trim() ? [item.body] : [],
    meta: item.created_time,
    createdAt: item.created_time,
    sortTime,
    // 案件级合并时以这条事件为「当前最新」起点，避免更早的事件覆盖 meta
    latestEventTime: groupKey?.startsWith('dispute:') ? sortTime : undefined,
    event: item.event,
    notificationId: item.notification_id,
    read: item.read,
    link: resolveNotificationLink(item.link, isDevWorkbench),
    groupKey,
    canVote: false,
  }
}
