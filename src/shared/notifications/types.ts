import type { ConversationHistoryDisclosure } from '@/api/conversations'
import type { AfterSalesCaseSummary } from '@/api/afterSales'
import type { CommunityCommentWarning } from '@/api/community'
import type { BackendNotification } from '@/api/notifications'

/**
 * 「系统通知」聚合层用到的类别、卡片与来源契约。
 *
 * 筛选口径是四个胶囊：全部 / 需求 / 资金 / 系统。后端 kind 有四个取值
 * （requirement / breach / payment / system），其中 breach（争议）都挂在某张需求单上，
 * 归到「需求」这一类；卡片上的徽标仍写「争议」，筛选时按需求看。
 */

export type NotificationKind = 'requirement' | 'payment' | 'system'

/** 筛选胶囊的中文名，与后端 kind 的归类一一对应。 */
export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  requirement: '需求',
  payment: '资金',
  system: '系统',
}

/** 卡片来源：三支本地聚合接口 + 后端通知收件箱。 */
export type NotificationSource = 'history-disclosure' | 'after-sales' | 'comment-warning' | 'inbox'

export type NotificationCard = {
  /** 跨来源唯一的键：本地来源的 id 各自从 1 开始，只拼 id 会撞在一起 */
  key: string
  /** 筛选桶：需求 / 资金 / 系统 */
  kind: NotificationKind
  /** 具体来源：决定图标与颜色；收件箱再按 event 细分 */
  source: NotificationSource
  /** 卡片徽标文案：公开申请 / 争议 / 评论警告 / 定金已支付… */
  kindLabel: string
  /** 主标题：本地来源是需求名或编号，收件箱用后端 title */
  title: string
  /** 卡片的正文行，按顺序渲染 */
  body: string[]
  /** 时间与操作人等弱信息，卡片右上角一行 */
  meta: string
  /** 原始时间字符串，用于显示 */
  createdAt: string
  /** 排序用的毫秒数：各类来源的时间串统一在聚合层解析一次 */
  sortTime: number
  /** 后端事件码，仅收件箱来源有 */
  event?: string
  /** 后端通知单号：有它才能标已读 */
  notificationId?: string
  /** 后端通知的已读态；本地三源没有 read 字段，保持 undefined */
  read?: boolean
  /** 已按用户端真实路由改写过的跳转地址；空表示没有可跳的页面 */
  link?: string
  /** 去重分组键：同一业务对象的通知归为一组（如 `comment:community-5`） */
  groupKey?: string
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
  /** 后端收件箱（已翻完全部页） */
  inbox?: BackendNotification[]
  /** 当前是不是开发者工作台：决定收件箱里的需求链接跳到哪一条消息路由 */
  isDevWorkbench?: boolean
  /** 当前登录用户名：判定公开申请里我是哪一方、是否轮到我投票 */
  username: string
}
