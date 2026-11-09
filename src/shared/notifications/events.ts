import type { NotificationKind } from './types'

/**
 * 后端收件箱的 kind / event → 卡片类别、徽标文案、图标与跳转的映射。
 *
 * 后端的 `title` / `body` 已经是中文成品文案，标题与正文直接展示；这里只决定
 * 「归到哪一个筛选桶」「徽标写什么」「用哪个图标」以及「链接落到用户端哪一页」。
 * 事件码以 `backend_73info/crates/api/src/adapters.rs` 里 `NewNotification::new` 的实参为准，
 * 新事件没有登记时按 kind 兜底，不会把通知藏起来。
 */

/** 后端 kind → 筛选桶。争议（breach）都挂在某张需求单上，按需求看。 */
export function notificationKindOf(backendKind: string): NotificationKind {
  switch (backendKind) {
    case 'payment':
      return 'payment'
    case 'requirement':
    case 'breach':
      return 'requirement'
    case 'system':
    default:
      return 'system'
  }
}

/** 后端 kind 的中文名；breach 单独写「争议」，比笼统的「需求」更能说明发生了什么。 */
export function backendKindLabel(backendKind: string): string {
  switch (backendKind) {
    case 'requirement':
      return '需求'
    case 'breach':
      return '争议'
    case 'payment':
      return '资金'
    case 'system':
    default:
      return '系统'
  }
}

const EVENT_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^dispute_/, '争议'],
  [/^invoice_/, '发票'],
  [/^refund_/, '退款'],
  [/^withdrawal_/, '提现'],
  [/^settlement_/, '结算'],
  [/^(deposit|final)_/, '资金'],
  [/^comment_/, '评论警告'],
  [/^community_post_/, '社区'],
  [/^resource_/, '资源'],
  [/^ticket_/, '工单'],
  [/^support_agent_reply$/, '客服'],
]

/** 事件徽标：比筛选桶更细一步；没有登记的事件按 kind 兜底。 */
export function notificationEventLabel(event: string | null | undefined): string | null {
  const code = (event ?? '').trim()
  if (!code) {
    return null
  }
  return EVENT_LABELS.find(([pattern]) => pattern.test(code))?.[1] ?? null
}

/** 图标键：组件层把它映射成 `ui_73info` 的图标，shared 层不依赖组件库。 */
export type NotificationIconKey =
  | 'history-disclosure'
  | 'after-sales'
  | 'comment-warning'
  | 'requirement'
  | 'payment'
  | 'refund'
  | 'invoice'
  | 'dispute'
  | 'comment'
  | 'community'
  | 'resource'
  | 'ticket'
  | 'support'
  | 'system'

/** 收件箱事件 → 图标键；按事件前缀分组，未登记时按 kind 兜底。 */
export function notificationEventIconKey(
  event: string | null | undefined,
  kind: NotificationKind,
): NotificationIconKey {
  const code = (event ?? '').trim()
  if (code.startsWith('dispute_')) return 'dispute'
  if (code.startsWith('invoice_')) return 'invoice'
  if (code.includes('refund')) return 'refund'
  if (/^(withdrawal_|settlement_|deposit_|final_)/.test(code)) return 'payment'
  if (code.startsWith('comment_')) return 'comment'
  if (code.startsWith('community_post_')) return 'community'
  if (code.startsWith('resource_')) return 'resource'
  if (code.startsWith('ticket_')) return 'ticket'
  if (code === 'support_agent_reply') return 'support'
  return kind
}

/**
 * 后端 link → 用户端真实路由。
 *
 * 后端给的是它自己视角的路径（`/workbench/requirements/{id}`、`/wallet`、`/contracts/{id}`…），
 * 用户端没有需求详情路由，需求相关一律落到消息中心对应会话（`?requirement_id=`）；
 * 其余按用户端实际路由逐条改写。认不出的路径不跳，避免点进 404。
 */
export function resolveNotificationLink(
  link: string | null | undefined,
  isDevWorkbench: boolean,
): string | undefined {
  const path = (link ?? '').trim()
  if (!path.startsWith('/')) {
    return undefined
  }

  const messages = isDevWorkbench ? '/workbench/developer/messages' : '/workbench/messages'
  const requirementId = path.match(/^\/(?:workbench\/)?requirements\/([^/?#]+)$/)?.[1]
  if (requirementId) {
    return `${messages}?requirement_id=${encodeURIComponent(requirementId)}`
  }

  if (path === '/workbench/invoices') {
    return isDevWorkbench ? '/workbench/developer/invoices' : '/workbench/invoices'
  }
  if (path === '/wallet') {
    // 用户端没有钱包页：资金事件回工作台总览；开发者端回钱包。
    return isDevWorkbench ? '/workbench/developer/wallet/overview' : '/workbench'
  }

  const contractId = path.match(/^\/contracts\/(\d+)$/)?.[1]
  if (contractId) {
    return `/workbench/signatures/${contractId}`
  }

  if (path === '/community') {
    return '/community'
  }
  const postId = path.match(/^\/community\/posts\/(\d+)$/)?.[1]
  if (postId) {
    return `/community/posts/${postId}`
  }

  if (path === '/workbench/resource-purchases/transfers') {
    return '/workbench/purchase-transfers'
  }
  if (path === '/workbench/developer/resources/list') {
    return '/workbench/developer/resources/list'
  }
  // 通知中心自己的链接：已经在这一页，不给「查看」按钮。
  if (path === '/workbench/notifications') {
    return undefined
  }

  return path
}
