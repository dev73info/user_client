/**
 * 「系统通知」页的聚合层。
 *
 * 这一页把三类通知合成同一种卡片：历史沟通公开申请（前任开发者负责期间的沟通记录要不要公开）、
 * 解除合作案件（解除合作现在走到哪一步）、本人评论警告（评论快照、警告原因与发出时间）。
 * 三者的后端接口、字段、可做的动作都不一样，页面上却要是同一种卡片，所以差异全部收在这里：
 *
 * | 来源 | 接口 | 卡片可做的动作 |
 * | --- | --- | --- |
 * | 历史沟通公开申请 | `/conversation/history-disclosures` | 同意公开 / 拒绝（两票制，轮到自己才能投） |
 * | 解除合作案件 | `/dispute/cases` | 无（只读，发起与表态都在需求列表的解除合作弹窗里做） |
 * | 本人评论警告 | `/community/comment-warnings` | 无（只读，保留评论快照与警告原因） |
 *
 * 后端没有通知表，也没有已读/未读字段，所以这里不产生任何状态，只做映射与排序。
 * 实现按职责分在 `notifications/` 下，此处汇总再导出。
 */

export { NOTIFICATION_KIND_LABELS } from './notifications/types'
export type { NotificationKind, NotificationCard, NotificationSources } from './notifications/types'
export { parseNoticeTime } from './notifications/time'
export { buildNotificationCards, canVoteHistoryDisclosure } from './notifications/cards'
export {
  countByKind,
  pendingVoteCount,
  pendingActionCount,
  filterNotificationCards,
} from './notifications/summary'
