import type { RouteLocationRaw } from 'vue-router'

import type { ConversationCardRole } from './types'

/**
 * 「交付」这一步还开着的需求状态：开发中与待付尾款，阶段性判定与工具条 `canDeliver` 一致。
 *
 * 工具条另需「已绑定资源项目 + 已发布版本」，卡片看不到那两个条件，只按阶段裁定：
 * 真正的交集由工具条兜底，所以这里放宽只会少给按钮，不会给出一个点下去必然报错的入口。
 * 门控的意义在历史卡片上——待分账与结单时交付早已做完，卡片再挂「去交付」，
 * 点开也只会落到一个没有交付入口的页面上。
 */
export const DELIVERABLE_STATUSES: readonly string[] = ['in_development', 'pending_final']
/**
 * 尾款还在等需求方缴的状态。
 *
 * 尾款一缴清，需求立刻转「待分账」（`pending_settlement`），渠道分账完成后才结单，
 * 这两步里需求方都没有可付的尾款——历史卡片再挂「支付尾款」只会把人送回一个
 * 已经没有该入口的需求列表，甚至重复发起一笔已完成的支付。
 */
export const FINAL_PAYABLE_STATUSES: readonly string[] = ['pending_final']
/**
 * 尾款已经付清之后的状态：历史「验收已通过」卡片上的「支付尾款」必须收起，
 * 否则会把人送回没有尾款可付的列表，甚至重复发起支付。
 */
export const FINAL_PAYMENT_DONE_STATUSES: readonly string[] = [
  'pending_settlement',
  'completed',
  'cancelled',
]

/**
 * 定金还在等需求方缴的状态。
 *
 * 与 `FINAL_PAYABLE_STATUSES` 分开列：两张卡片各管自己那一步——「合同已签署完成」上的
 * 「支付定金」到了待付尾款就不该再出现（那一步早做完了），反之亦然。
 */
export const DEPOSIT_PAYABLE_STATUSES: readonly string[] = ['pending_deposit']

/** 需求当前是否落在给定的一组状态里；状态还没取到时按「不在」处理，宁可不给按钮。 */
export function statusIn(status: string | null, allowed: readonly string[]): boolean {
  return status != null && allowed.includes(status)
}

/**
 * 验收类卡片说明末尾挂上交付版本号（来自消息 `action_ref`）。
 * 没有版本时保持原说明，避免历史空卡片多出一句「版本：」。
 */
export function withDeliveryVersion(description: string, actionRef?: string | null): string {
  const version = actionRef?.trim()
  if (!version) {
    return description
  }
  return `${description.replace(/。$/, '')}（交付版本 ${version}）。`
}

/**
 * 派发一张卡片所需的一切：调用参数已经解析成路由与几个门控布尔值，
 * 各分组模块只按事件码挑文案，不再重复算一遍。
 */
export type ConversationCardContext = {
  actionType: string
  role: ConversationCardRole | null
  requirementStatus: string | null
  /** 卡片消息上的 `action_ref`：交付 / 验收类是版本号。 */
  actionRef?: string | null
  requirementListRoute: RouteLocationRaw
  contractSignRoute: RouteLocationRaw
  canDeliverFromCard: boolean
  canPayDeposit: boolean
  canPayFinal: boolean
  canShowFinalPayOnAcceptanceCard: boolean
}
