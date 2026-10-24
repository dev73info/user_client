import type { ConversationHistoryDisclosure } from '@/api/conversations'
import type { AfterSalesCaseSummary } from '@/api/afterSales'

import { parseNoticeTime } from './time'
import { NOTIFICATION_KIND_LABELS } from './types'
import type { NotificationCard, NotificationSources } from './types'

/**
 * 把两类来源合成一张按时间倒序的通知列表。
 *
 * 时间串都是东八区墙钟串，统一交给 `parseNoticeTime` 解析；解析失败的排在最后而不是排到最前——
 * 解析不出来当成「很早」，不要因为格式异常把一条旧通知顶到最上面。
 *
 * 资源过户那两类来源已整体下线（契约里没有 `/resources/transfers/**`）。
 */
export function buildNotificationCards(sources: NotificationSources): NotificationCard[] {
  const cards = [
    ...(sources.disclosures ?? []).map((item) =>
      buildHistoryDisclosureCard(item, sources.username),
    ),
    ...(sources.afterSales ?? []).map(buildAfterSalesCard),
  ]

  return cards.sort((left, right) => right.sortTime - left.sortTime)
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
 * 解除合作案件卡片：只读。
 *
 * 为什么要进通知页：案件状态的每一次变化都只落在需求会话里的一张卡片上，而结单之后双方本来就
 * 不太会再去盯需求列表——会话未读是个角标，很容易被忽略过去。这里给它第二个可见面。
 *
 * 卡片不带动作：发起、接受/不接受、撤回都在需求列表的解除合作弹窗里做，这里再摆一套按钮就是
 * 两份规则（只读，说明现状）。
 */
function buildAfterSalesCard(row: AfterSalesCaseSummary): NotificationCard {
  const claim = row.claim_amount_fen > 0 ? `主张金额 ${row.claim_amount} 元` : '不主张资金'
  return {
    key: `after-sales-${row.case_no}`,
    kind: 'after-sales',
    kindLabel: NOTIFICATION_KIND_LABELS['after-sales'],
    title: row.requirement_id,
    body: [`${row.case_no} · ${row.kind_label}`, `诉求：${claim} · 当前状态：${row.status_label}`],
    meta: `${row.created_time} 由 ${row.filed_by} 发起`,
    createdAt: row.created_time,
    sortTime: parseNoticeTime(row.created_time),
    canVote: false,
  }
}
