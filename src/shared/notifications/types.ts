import type { CommentWarning, CommunityPost } from '@/api/community'
import type { ConversationHistoryDisclosure } from '@/api/conversations'
import type { AfterSalesCase } from '@/api/afterSales'
import type { ResourceTransferPayload } from '@/api/resourceTransfers'

/** 「系统通知」聚合层用到的类别、卡片与来源契约。 */

export type NotificationKind =
  | 'comment-warning'
  | 'history-disclosure'
  | 'resource-transfer'
  | 'after-sales'
  | 'announcement'

/** 卡片上的类别标签，与筛选胶囊一一对应。 */
export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  'comment-warning': '评论警告',
  'history-disclosure': '公开申请',
  'resource-transfer': '资源过户',
  'after-sales': '解除合作案件',
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
  /** 资源过户：申请 id，卡片上的动作要用 */
  transferId?: number
  /** 资源过户：资源名，确认弹窗里复用 */
  transferResourceName?: string
  /** 资源过户：待我同意（同意/拒绝）或我发起的待处理（撤销） */
  transferAction?: 'respond' | 'cancel'
}

export type NotificationSources = {
  warnings?: CommentWarning[]
  disclosures?: ConversationHistoryDisclosure[]
  afterSales?: AfterSalesCase[]
  announcements?: CommunityPost[]
  /** 待我同意的过户（只有开发者工作台会传） */
  transferInbox?: ResourceTransferPayload[]
  /** 我发起的过户（只有开发者工作台会传） */
  myTransfers?: ResourceTransferPayload[]
  /** 当前登录用户名：判定公开申请里我是哪一方、是否轮到我投票 */
  username: string
}
