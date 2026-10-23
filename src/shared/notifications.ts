/**
 * 「系统通知」页的聚合层。
 *
 * 这一页把五类通知合成同一种卡片：评论警告（社区/资源评论被管理员警告）、
 * 历史沟通公开申请（前任开发者负责期间的沟通记录要不要公开）、资源过户（别人把资源转给我 /
 * 我发起的申请走到哪一步）、解除合作案件（我给出去或收到的那条解除合作现在走到哪一步）、
 * 平台公告（官方活动与广播）。五者的后端接口、字段、可做的动作都不一样，
 * 页面上却要是同一种卡片，所以差异全部收在这里，页面只负责渲染与调用动作：
 *
 * | 来源 | 接口 | 卡片可做的动作 |
 * | --- | --- | --- |
 * | 评论警告 | `/community/comment-warnings` | 无（只读，说明原因） |
 * | 历史沟通公开申请 | `/conversation/history-disclosures` | 同意公开 / 拒绝（两票制，轮到自己才能投） |
 * | 资源过户 | `/resources/transfers/inbox`、`/mine` | 待我同意：同意接收 / 拒绝；我发起的待处理：撤销 |
 * | 解除合作案件 | `/dispute/cases` | 无（只读，发起与表态都在需求列表的解除合作弹窗里做） |
 * | 平台公告 | `/community/posts?tag=公告` | 无（点卡片进社区帖） |
 *
 * 后端没有通知表，也没有已读/未读字段，所以这里不产生任何状态，只做映射与排序。
 * 实现按职责分在 `notifications/` 下，此处汇总再导出。
 */

export { NOTIFICATION_KIND_LABELS } from './notifications/types'
export type { NotificationKind, NotificationCard, NotificationSources } from './notifications/types'
export { parseNoticeTime } from './notifications/time'
export {
  buildNotificationCards,
  canVoteHistoryDisclosure,
  announcementPreview,
} from './notifications/cards'
export {
  countByKind,
  pendingVoteCount,
  pendingActionCount,
  filterNotificationCards,
} from './notifications/summary'
