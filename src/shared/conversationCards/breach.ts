import type { RouteLocationRaw } from 'vue-router'

import type { ConversationCardMeta } from './types'
import type { ConversationCardContext } from './context'
import { statusIn, withDeliveryVersion } from './context'

/** 违约责任与结单相关卡片：逾期、顺延 / 中止、尾款、结单与绑定解除。 */
export function breachConversationCard(
  context: ConversationCardContext,
): ConversationCardMeta | undefined {
  const {
    actionType,
    role,
    actionRef,
    canShowFinalPayOnAcceptanceCard,
    canDeliverFromCard,
    canPayFinal,
    requirementListRoute,
  } = context

  switch (actionType) {
    // 违约责任条款（按需判定，见后端 doc/违约与催告.md）：期限届满的四种后果。
    // 它们都是「时间到了」而不是某一方按下的动作，所以卡片本身不给「推进流程」的按钮——
    // 要么平台已按条款推进完（视为验收），要么只是提醒（逾期），当事人真正要做的事
    // 在需求卡片上（缴费 / 交付 / 解除合作）。
    case 'acceptance_deemed_passed':
      return {
        title: '视为验收通过',
        description: withDeliveryVersion('验收期满无异议，按合同视为通过。', actionRef),
        actionLabel: canShowFinalPayOnAcceptanceCard ? '支付尾款' : undefined,
        paymentAction: canShowFinalPayOnAcceptanceCard,
      }
    case 'delivery_overdue':
      return {
        title: '交付已逾期',
        description: '已超合同期限，按约定计违约金。',
        actionLabel: canDeliverFromCard ? '去交付' : undefined,
        deliveryAction: canDeliverFromCard,
      }
    case 'final_pay_overdue':
      return {
        title: '尾款已逾期',
        description: '已超合同期限，按约定计违约金。',
        actionLabel: canPayFinal ? '支付尾款' : undefined,
        paymentAction: canPayFinal,
      }
    case 'final_pay_cure_by_developer':
      return {
        title: '开发者催告支付尾款',
        description:
          role === 'developer' ? '已正式通知需求方，不会自动扣款。' : '请尽快按合同支付尾款。',
        actionLabel: canPayFinal ? '支付尾款' : undefined,
        paymentAction: canPayFinal,
      }
    case 'remediation_expired':
      return {
        title: '限期补救已届满',
        description: '交付仍未合格，可申请减价或申报违约。',
        actionLabel: role === 'customer' ? '去我的需求' : undefined,
        to: role === 'customer' ? requirementListRoute : undefined,
      }
    // 顺延（不可抗力 / 需求变更 / 第三方原因）：只延期限、不动钱，没有可执行的动作。
    // 文案必须写明「已发生的逾期不因顺延而消失」，否则会被读成「顺延一下就把逾期抹了」。
    case 'breach_deadline_extended':
      return {
        title: '合同期限已顺延',
        description: '只延期限、不动资金；已发生的逾期仍保留。',
      }
    // 中止 / 恢复：与顺延同一条通道（只动期限、不动钱）。中止期间不判定到期，恢复时按
    // 实际停摆时长整体后移期限——所以「中止」不是免责，已发生的逾期仍然留着。
    case 'breach_deadline_suspended':
      return {
        title: '合同期限已中止计时',
        description: '中止期间不判定到期；已发生的逾期仍保留。',
      }
    case 'breach_deadline_resumed':
      return {
        title: '合同期限已恢复计时',
        description: '按停摆时长顺延；已发生的逾期仍保留。',
      }
    // 当事人的申请入口：申请只落一张客服工单，期限的实际变更由客服执行，
    // 所以文案说「已提交申请」而不是「期限已变更」。
    case 'breach_deadline_change_requested':
      return {
        title: '已提交期限变更申请',
        description: '客服核实后执行，申请本身不改期限。',
      }
    case 'final_paid':
      return {
        title: '尾款已缴纳',
        description: '分账完成后正式结单。',
        // 待分账期间双方都没有可执行的动作（等待期内解除合作走需求卡片上的入口）；
        // 「去我的需求」只是把人送回自己已经在的需求列表，属空跳转，故不给按钮。
      }
    case 'requirement_settled':
      return {
        title: '需求已结单',
        description: '分账已完成，解除合作入口已开放。',
        // 与 final_paid 同口径：解除合作入口就在需求卡片上，这里再给按钮只是空跳转。
      }
    case 'binding_released':
      return {
        title: '绑定已解除',
        description: '需求已回到待接单。',
        actionLabel: '去需求大厅',
        to: role === 'developer' ? { name: 'dev-requirement-hall' } : requirementListRoute,
      }
    // 需求方单方取消（已缴定金档）：结局是需求被取消，与上面的「回到待接单」不是一回事，
    // 后端为此单列了事件码（BUG-050）。不给按钮——这笔需求已经不在大厅里了。
    case 'requirement_cancelled':
      return {
        title: '需求已被需求方取消',
        description: '已缴定金按定金罚则不退，绑定已解除，会话只读。',
      }
  }

  return undefined
}
