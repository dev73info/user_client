import type { RouteLocationRaw } from 'vue-router'

import type { ConversationCardMeta } from './types'
import type { ConversationCardContext } from './context'
import { DELIVERABLE_STATUSES, statusIn, withDeliveryVersion } from './context'

/** 合同、定金、交付与验收这几步的卡片文案与入口。 */
export function contractConversationCard(
  context: ConversationCardContext,
): ConversationCardMeta | undefined {
  const {
    actionType,
    role,
    actionRef,
    requirementStatus,
    requirementListRoute,
    contractSignRoute,
    canPayDeposit,
    canDeliverFromCard,
    canShowFinalPayOnAcceptanceCard,
  } = context

  switch (actionType) {
    case 'contract_party_b_signed':
      return {
        title: '开发者已签署合同',
        description: '等待需求方签署。',
        actionLabel: '查看合同',
        asignPreview: true,
        to: contractSignRoute,
      }
    case 'contract_party_a_signed':
      return {
        title: '需求方已签署合同',
        description: '等待开发者签署。',
        actionLabel: '查看合同',
        asignPreview: true,
        to: contractSignRoute,
      }
    case 'contract_signed':
      return {
        title: '合同已签署完成',
        description: '等待需求方支付定金。',
        // 付定金是需求方的动作，开发者这边只是通知；定金缴清后这张历史卡片也不再给按钮，
        // 否则点进去只会重复发起一笔已完成的支付。按下去原地打开支付弹窗，不跳需求列表。
        actionLabel: canPayDeposit ? '支付定金' : undefined,
        paymentAction: canPayDeposit,
        to: canPayDeposit ? undefined : requirementListRoute,
      }
    case 'deposit_paid':
      return {
        title: '定金已缴纳',
        description: '需求进入开发阶段。',
        // 交付是开发者的动作，需求方这边没有可执行入口，只保留卡片本身。
        // 开发者这边的「去交付」不再跳需求列表：交付弹窗就在同一条会话的底部工具条上，
        // 按下去原地打开它。只在交付那一步给——待分账与结单后交付早已做完，
        // 这时候再挂按钮也只会是一个点了没反应的死入口。
        actionLabel: canDeliverFromCard ? '去交付' : undefined,
        deliveryAction: canDeliverFromCard,
        to: canDeliverFromCard ? undefined : requirementListRoute,
      }
    case 'delivery_submitted':
      return {
        // 同一张卡片两个视角各说各话：需求方是「收到了什么」，开发者是自己刚做完的那一步，
        // 对开发者写成「收到交付版本」会像是别人交给了他。
        title: role === 'developer' ? '已提交交付版本' : '收到交付版本',
        description:
          role === 'developer' ? '你已提交，等待需求方验收。' : '请下载验收，通过后支付尾款。',
        // 交付是开发者自己提交的，这张卡片对开发者只是回执，不给按钮；
        // 需求方这边直接给交付产物的下载入口（不跳页），并在同一行给出「验收」：
        // 卡片说的就是「请验收后支付尾款」，入口放这儿比只留在底部工具条里更顺路。
        // 交付那一步在「开发中」与「待付尾款」都还开着：待付尾款上打回验收会把需求退回开发中、
        // 同时挡住宿尾款（后端 `accept_delivery` 的 rolling_back 分支），所以这里不能再藏，
        // 否则尾款阶段发现问题时，卡片上唯一的按钮是「支付尾款」。
        // 交付产物的下载一直保留；待分账与结单后交付早已做完，历史卡片不再挂验收入口。
        actionLabel: role === 'developer' ? undefined : '下载交付产物',
        downloadDelivery: role !== 'developer',
        acceptanceAction: role === 'customer' && statusIn(requirementStatus, DELIVERABLE_STATUSES),
      }
    // 结单（completed）后开发者仍可发布版本（解除合作返工），但验收动作在后端此时一律被拒
    // （`accept_delivery` 只认 in_development / pending_final），所以这张卡片不能再说
    // 「等待验收」——需求方点不出验收动作，卡片就是一句兑现不了的承诺。
    // 口径与后端一致：结单后返工、退款或赔付走解除合作；只保留产物下载（版本确实发布了，
    // 是这张卡片上唯一真实可做的动作）。
    case 'delivery_submitted_after_completed':
      return {
        title: role === 'developer' ? '已提交结单后的新版本' : '收到结单后的新版本',
        description:
          role === 'developer'
            ? '你已提交新版本；需求已结单，不再验收，售后走解除合作。'
            : '需求已结单，不再验收；返工或退款请走解除合作。',
        actionLabel: role === 'developer' ? undefined : '下载交付产物',
        downloadDelivery: role !== 'developer',
      }
    case 'acceptance_passed':
      return {
        title: '验收已通过',
        description: withDeliveryVersion('等待需求方支付尾款。', actionRef),
        // 付尾款是需求方的动作，开发者这边只是通知，不给按钮。
        // 尾款付清前这张卡片一直挂「支付尾款」（含验收打回退回开发中的时候），
        // 缴清进入待分账 / 结单后才收起，避免历史卡片变成重复支付的死入口。
        actionLabel: canShowFinalPayOnAcceptanceCard ? '支付尾款' : undefined,
        paymentAction: canShowFinalPayOnAcceptanceCard,
        to: canShowFinalPayOnAcceptanceCard ? undefined : requirementListRoute,
      }
    case 'acceptance_rejected':
      return {
        title: '验收未通过',
        description: withDeliveryVersion('等待开发者整改后重新交付。', actionRef),
        // 整改与重新交付都是开发者的动作，需求方这边只是通知，不给按钮；
        // 与「定金已缴纳」同口径：交付入口只在交付那一步给，且原地打开交付弹窗不跳页，
        // 结单后的历史卡片不再挂。
        actionLabel: canDeliverFromCard ? '去交付' : undefined,
        deliveryAction: canDeliverFromCard,
        to: canDeliverFromCard ? undefined : requirementListRoute,
      }
  }

  return undefined
}
