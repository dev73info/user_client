import type { RouteLocationRaw } from 'vue-router'

/**
 * 需求会话里的状态变化卡片：后端写入 message_type='card' 的消息，
 * action_type 为事件码，前端在这里统一决定标题、说明、按钮文案与跳转目标。
 * 卡片只负责把人送到能做事的页面（支付类动作仍需先创建支付单），不做一键操作。
 */
export type ConversationCardMeta = {
  title: string
  description: string
  /** 动作按钮文案；为空表示这张卡片当前不给按钮（例如定金缴完后需求方已无事可做）。 */
  actionLabel?: string
  /** 站内跳转目标；与 asignPreview 同时给出时，作为爱签预览取不到链接的回退。 */
  to?: RouteLocationRaw
  /** 跳爱签合同预览页（可查看可签署），取不到链接时回退 to。 */
  asignPreview?: boolean
  /** 下载交付产物：按卡片上的版本号取绑定资源项目的交付版本文件，不再走 to 跳转。 */
  downloadDelivery?: boolean
}

export type ConversationCardRole = 'customer' | 'developer'

export function conversationCardMeta(
  actionType: string,
  requirementId: string,
  role: ConversationCardRole | null,
  requirementStatus: string | null,
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
    // 合同在爱签侧，点按钮就是去看爱签那份合同（未签署时爱签页面里也能直接签），
    // 所以文案与需求列表页的「查看合同」一致；爱签侧还没发起签署（取不到预览链接）时回退站内签约页。
    case 'contract_party_b_signed':
      return {
        title: '开发者已签署合同',
        description: '《需求开发合同》等待需求方签署，双方签完并支付定金后进入开发。',
        actionLabel: '查看合同',
        asignPreview: true,
        to: contractSignRoute,
      }
    case 'contract_party_a_signed':
      return {
        title: '需求方已签署合同',
        description: '《需求开发合同》等待开发者签署，双方签完并支付定金后进入开发。',
        actionLabel: '查看合同',
        asignPreview: true,
        to: contractSignRoute,
      }
    case 'contract_signed':
      return {
        title: '合同已签署完成',
        description: '《需求开发合同》双方已签署，等待需求方支付定金。',
        // 付定金是需求方的动作，开发者这边只是通知；定金缴清后这张历史卡片也不再给按钮，
        // 否则点进去只会重复发起一笔已完成的支付。
        actionLabel:
          role !== 'developer' && requirementStatus === 'pending_deposit' ? '去支付定金' : undefined,
        to: requirementListRoute,
      }
    case 'deposit_paid':
      return {
        title: '定金已缴纳',
        description: '需求方已缴纳定金，需求进入开发阶段。',
        // 交付是开发者的动作，需求方这边没有可执行入口，只保留卡片本身。
        actionLabel: role === 'developer' ? '去交付' : undefined,
        to: requirementListRoute,
      }
    case 'delivery_submitted':
      return {
        title: '收到交付版本',
        description: '开发者已提交交付版本，请验收后支付尾款。',
        // 交付是开发者自己提交的，这张卡片对开发者只是通知，不给按钮；
        // 需求方这边直接给交付产物的下载入口（不跳页）。
        actionLabel: role === 'developer' ? undefined : '下载交付产物',
        downloadDelivery: role !== 'developer',
      }
    case 'acceptance_passed':
      return {
        title: '验收已通过',
        description: '需求方已验收通过，等待支付尾款。',
        // 付尾款是需求方的动作，开发者这边只是通知，不给按钮。
        actionLabel: role === 'developer' ? undefined : '去支付尾款',
        to: requirementListRoute,
      }
    case 'acceptance_rejected':
      return {
        title: '验收未通过',
        description: '需求方验收未通过，开发者整改后可重新提交验收。',
        // 整改与重新交付都是开发者的动作，需求方这边只是通知，不给按钮。
        actionLabel: role === 'developer' ? '去交付' : undefined,
        to: requirementListRoute,
      }
    case 'final_paid':
      return {
        title: '尾款已缴纳',
        description: '需求方已缴纳尾款，等待渠道分账完成（通常 7 天），分账成功后正式结单。',
        // 待分账期间双方都没有可执行的动作（等待期内终止合作走需求卡片上的入口）；
        // 「去我的需求」只是把人送回自己已经在的需求列表，属空跳转，故不给按钮。
      }
    case 'requirement_settled':
      return {
        title: '需求已结单',
        description: '尾款分账已完成，需求正式结单，售后入口已开放。',
        // 与 final_paid 同口径：售后入口就在需求卡片上，这里再给按钮只是空跳转。
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
