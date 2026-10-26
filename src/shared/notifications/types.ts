import type { ConversationHistoryDisclosure } from '@/api/conversations'
import type { AfterSalesCaseSummary } from '@/api/afterSales'
import type { CommunityCommentWarning } from '@/api/community'

/**
 * 「系统通知」聚合层用到的类别、卡片与来源契约。
 *
 * 当前支持公开申请、解除合作案件与本人评论警告；平台公告与资源过户不在这份模型里。
 */

export type NotificationKind = 'history-disclosure' | 'after-sales' | 'comment-warning'

/** 卡片上的类别标签，与筛选胶囊一一对应。 */
export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  'history-disclosure': '公开申请',
  'after-sales': '解除合作案件',
  'comment-warning': '评论警告',
}

export type NotificationCard = {
  /** 跨类别唯一的键：各类来源的 id 各自从 1 开始，只拼 id 会撞在一起 */
  key: string
  kind: NotificationKind
  /** 类别标签（胶囊筛选与卡片徽标共用同一份文案） */
  kindLabel: string
  /** 主标题：公开申请是需求名，解除合作是需求编号 */
  title: string
  /** 卡片的正文行，按顺序渲染 */
  body: string[]
  /** 时间与操作人等弱信息，卡片右上角一行 */
  meta: string
  /** 原始时间字符串，用于显示 */
  createdAt: string
  /** 排序用的毫秒数：各类来源的时间串统一在聚合层解析一次 */
  sortTime: number
  /** 公开申请：投票要用到的 id */
  disclosureId?: number
  /** 公开申请：当前是否轮到我投票（只有轮到我时才给按钮） */
  canVote: boolean
  /** 公开申请：两票状态的一句话说明，投票按钮上方展示 */
  voteHint?: string
}

export type NotificationSources = {
  disclosures?: ConversationHistoryDisclosure[]
  afterSales?: AfterSalesCaseSummary[]
  commentWarnings?: CommunityCommentWarning[]
  /** 当前登录用户名：判定公开申请里我是哪一方、是否轮到我投票 */
  username: string
}
