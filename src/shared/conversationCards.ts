import type { RouteLocationRaw } from 'vue-router'

/**
 * 需求会话里的状态变化卡片：后端写入 message_type='card' 的消息，
 * action_type 为事件码，前端在这里统一决定标题、说明、按钮文案与跳转目标。
 * 卡片只负责把人送到能做事的页面（支付类动作仍需先创建支付单），不做一键操作。
 */
export type ConversationCardMeta = {
  title: string
  description: string
  actionLabel: string
  to: RouteLocationRaw
}

export type ConversationCardRole = 'customer' | 'developer'

export function conversationCardMeta(
  actionType: string,
  requirementId: string,
  role: ConversationCardRole | null,
): ConversationCardMeta | null {
  const requirementListRoute: RouteLocationRaw =
    role === 'developer'
      ? { name: 'dev-my-requirements' }
      : { name: 'workbench-requirements' }
  const contractSignRoute: RouteLocationRaw = {
    name: 'contract-sign',
    query: { requirement_id: requirementId, from: role === 'developer' ? 'dev' : 'user' },
  }

  switch (actionType) {
    case 'contract_party_b_signed':
      return {
        title: '开发者已签署合同',
        description: '《需求开发合同》等待需求方签署，双方签完并支付定金后进入开发。',
        actionLabel: '去签署合同',
        to: contractSignRoute,
      }
    case 'contract_party_a_signed':
      return {
        title: '需求方已签署合同',
        description: '《需求开发合同》等待开发者签署，双方签完并支付定金后进入开发。',
        actionLabel: '去签署合同',
        to: contractSignRoute,
      }
    case 'contract_signed':
      return {
        title: '合同已签署完成',
        description: '《需求开发合同》双方已签署，等待需求方支付定金。',
        actionLabel: role === 'developer' ? '去我的需求' : '去支付定金',
        to: requirementListRoute,
      }
    case 'deposit_paid':
      return {
        title: '定金已缴纳',
        description: '需求方已缴纳定金，需求进入开发阶段。',
        actionLabel: role === 'developer' ? '去交付' : '去我的需求',
        to: requirementListRoute,
      }
    case 'delivery_submitted':
      return {
        title: '收到交付版本',
        description: '开发者已提交交付版本，请验收后支付尾款。',
        actionLabel: role === 'developer' ? '去我的需求' : '去验收',
        to: requirementListRoute,
      }
    case 'acceptance_passed':
      return {
        title: '验收已通过',
        description: '需求方已验收通过，等待支付尾款。',
        actionLabel: role === 'developer' ? '去我的需求' : '去支付尾款',
        to: requirementListRoute,
      }
    case 'final_paid':
      return {
        title: '需求已结单',
        description: '尾款已支付，需求已完成结单。',
        actionLabel: '去我的需求',
        to: requirementListRoute,
      }
    case 'binding_released':
      return {
        title: '绑定已解除',
        description: '需求已回到待接单状态。',
        actionLabel: '去需求大厅',
        to: role === 'developer' ? { name: 'dev-requirement-hall' } : requirementListRoute,
      }
    default:
      return null
  }
}
