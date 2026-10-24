/**
 * 需求会话里的状态变化卡片：后端写入 message_type='card' 的消息，
 * action_type 为事件码，前端在这里统一决定标题、说明、按钮文案与跳转目标。
 * 卡片自己能做的动作（交付、验收、支付定金 / 尾款）都在同一条会话的底部工具条上，
 * 有原地的弹窗就把人交给它，只有真的在别处才能做的事（签约、需求大厅）才跳页。
 *
 * 事件码按业务分在 `conversationCards/` 下（合同与交付 / 违约与结单 / 解除合作），
 * 这里只做门控计算与派发。
 */

import type { RouteLocationRaw } from 'vue-router'

import { breachConversationCard } from './conversationCards/breach'
import { contractConversationCard } from './conversationCards/contract'
import {
  DELIVERABLE_STATUSES,
  DEPOSIT_PAYABLE_STATUSES,
  FINAL_PAYABLE_STATUSES,
  FINAL_PAYMENT_DONE_STATUSES,
  statusIn,
} from './conversationCards/context'
import type { ConversationCardContext } from './conversationCards/context'
import { resolutionConversationCard } from './conversationCards/resolution'
import type { ConversationCardMeta, ConversationCardRole } from './conversationCards/types'

export { conversationCardSide } from './conversationCards/side'
export type {
  ConversationCardMeta,
  ConversationCardRole,
  ConversationCardSide,
} from './conversationCards/types'

export function conversationCardMeta(
  actionType: string,
  requirementId: string,
  role: ConversationCardRole | null,
  requirementStatus: string | null,
  /** 卡片消息上的 `action_ref`：交付 / 验收类是版本号。 */
  actionRef?: string | null,
): ConversationCardMeta | null {
  const requirementListRoute: RouteLocationRaw =
    role === 'developer' ? { name: 'dev-my-requirements' } : { name: 'workbench-requirements' }
  const contractSignRoute: RouteLocationRaw = {
    name: 'contract-sign',
    query: { requirement_id: requirementId, from: role === 'developer' ? 'dev' : 'user' },
  }
  // 交付那一步还开着（开发者视角）：卡片上的「去交付」原地打开交付弹窗，不跳页。
  const canDeliverFromCard =
    role === 'developer' && statusIn(requirementStatus, DELIVERABLE_STATUSES)
  // 缴款那一步还开着（需求方视角）：卡片上的「支付定金 / 支付尾款」原地打开支付弹窗，
  // 同样不跳页。定金与尾款各看各的状态——「合同已签署完成」那张只在待缴定金时给按钮。
  const canPayDeposit =
    role !== 'developer' && statusIn(requirementStatus, DEPOSIT_PAYABLE_STATUSES)
  const canPayFinal = role !== 'developer' && statusIn(requirementStatus, FINAL_PAYABLE_STATUSES)
  /**
   * 「验收已通过 / 视为验收通过」卡片上的支付尾款入口：尾款付清前一直挂着。
   *
   * 与工具条 `canPayFinal`（只认 `pending_final`）不同——验收打回会把需求退回「开发中」，
   * 若按当前状态藏按钮，用户会觉得「支付入口又没了」。入口留在卡片上；若当时还不能付，
   * 点下去由会话容器提示「请先重新验收通过」。
   */
  const canShowFinalPayOnAcceptanceCard =
    role !== 'developer' &&
    requirementStatus != null &&
    !statusIn(requirementStatus, FINAL_PAYMENT_DONE_STATUSES) &&
    (canPayFinal || statusIn(requirementStatus, ['in_development']))

  const context: ConversationCardContext = {
    actionType,
    role,
    requirementStatus,
    actionRef,
    requirementListRoute,
    contractSignRoute,
    canDeliverFromCard,
    canPayDeposit,
    canPayFinal,
    canShowFinalPayOnAcceptanceCard,
  }

  // 事件码按业务分组分在 `conversationCards/` 下，三组互不重叠；都不认时返回 null。
  return (
    contractConversationCard(context) ??
    breachConversationCard(context) ??
    resolutionConversationCard(context) ??
    null
  )
}
