import type { RouteLocationRaw } from 'vue-router'

import type { ConversationCardMeta } from './types'
import type { ConversationCardContext } from './context'
import { statusIn, withDeliveryVersion } from './context'

/** 解除合作相关卡片：协商解除、解除绑定、解除合作案件与售后案件进展。 */
export function resolutionConversationCard(
  context: ConversationCardContext,
): ConversationCardMeta | undefined {
  const { actionType, role, requirementListRoute } = context

  switch (actionType) {
    // 解除合作（2026-10-06）：协商解除与判责合并成一个入口后的三条卡片。
    // 案件先进入协商阶段，对方同意即无责退出、不同意（或超时未回应）才由任一方申请平台介入。
    // 全部不给按钮：发起与表态都在需求卡片的弹窗里，这里再给入口只是空跳转。
    case 'termination_submitted':
      return {
        title: '解除合作申请已提交',
        description: '等待对方回应；不同意可申请平台介入。',
      }
    case 'termination_agreed':
      return {
        title: '双方已同意解除合作',
        description: '合同作废、款项原路退还，双方免责。',
      }
    case 'termination_rejected':
      return {
        title: '对方不同意解除合作',
        description: '可申请平台介入判责，或继续履约。',
      }
    // 协商解除：担保与自管两种模式共用这几条卡片码。**只用于渲染历史卡片**——2026-10-06 起
    // 这条通道并入「解除合作」案件（上面的 termination_*），事件码不再写入。
    case 'unbind_request_submitted':
      return {
        title: '解除绑定申请已提交',
        description: '等待对方确认。',
      }
    case 'unbind_request_approved':
      return {
        title: '双方已同意解除绑定',
        description: '需求回到待接单；担保模式下定金原路退还。',
      }
    case 'unbind_request_rejected':
      return {
        title: '解除绑定申请未获同意',
        description: '需求按原约定继续。',
      }
    case 'unbind_request_auto_rejected':
      return {
        title: '解除绑定申请已自动驳回',
        description: '按旧规则自动驳回，现已可直接申请。',
      }
    case 'unbind_request_expired':
      return {
        title: '解除绑定申请已自动作废',
        description: '对方未处理，需求按原约定继续。',
      }
    // 解除合作案件进展（AD-5）：后端在案件每一步流转时都写一条卡片，这里给出对应中文。
    // 案件详情（责任方、退款与赔付金额、协商表态）都在需求卡片的解除合作弹窗里，
    // 没有可一键执行的资金动作，所以全部不给按钮，避免空跳转。
    case 'breach_case_submitted':
      return {
        title: '解除合作案件已立案',
        description: '等待对方回应；不同意可申请平台介入。',
      }
    case 'breach_case_ai_judged':
      return {
        title: '平台已完成责任判定',
        description: '请在案件内表态，双方接受后执行。',
      }
    case 'breach_case_support_reviewing':
      return {
        title: '解除合作案件已转客服人工判定',
        description: '等待客服判定。',
      }
    case 'breach_case_resolved':
      return {
        title: '解除合作案件已结案',
        description: '资金已处理，需求回到待接单。',
      }
    case 'breach_case_rejected':
      return {
        title: '解除合作申请未获支持',
        description: '案件已关闭，合同继续履行。',
      }
    case 'breach_case_withdrawn':
      return {
        title: '解除合作申请已撤回',
        description: '合作按原约定继续。',
      }
    case 'breach_case_manual_required':
      return {
        title: '解除合作案件需人工处理',
        description: '资金未自动完成，客服跟进中。',
      }
    // 中间态（2026-10-11）：赔付要打给需求方，但对方的渠道收款账户没就绪，钱落不下来。
    // 与「需人工处理」不同——下一步在需求方手上（补收款银行卡），补齐后平台自动续做，
    // 所以卡片要把该做什么写清楚，而不是只说一句「处理中」。
    case 'breach_case_awaiting_payer_settlement':
      return {
        title: '解除合作案件赔付待需求方补收款账户',
        description: '需求方完成收款银行卡绑定后，平台自动续做赔付与退款。',
        // 下一步在需求方手上，所以只给需求方一个直达绑卡的入口；
        // 开发者侧这条只是进展说明，不给按钮（他无处可做）。
        actionLabel: role === 'customer' ? '去完成收款银行卡' : undefined,
        to: role === 'customer' ? { name: 'workbench-account', query: { settle: '1' } } : undefined,
      }
    // 「需人工处理」之后的两个事件码：后台滞留提醒与客服人工结案。停在人工处理这一段时
    // 案件不再有自动动作，会话里不补卡片，双方的感受就是「点了申报之后再没下文」。
    // 提醒不写死「几天」：阈值是后端常量，文案写死天数后常量一改就在说假话。
    case 'breach_case_manual_required_reminder':
      return {
        title: '解除合作案件仍在人工处理中',
        description: '客服处理中，接单保证金继续冻结。',
      }
    case 'breach_case_manual_closed':
      return {
        title: '解除合作案件已由客服人工结案',
        description: '结论见案件详情。',
      }
    // 协商还价与「申请平台介入」此前不写卡片，对方不提就没人在会话里说一声。
    // 与案件其它卡片同口径：详情在弹窗里，不给按钮。
    case 'breach_case_negotiation_proposed':
      return {
        title: '对方已发起解除合作协商',
        description: '请在案件内表态是否接受该额度。',
      }
    case 'breach_case_negotiation_rejected':
      return {
        title: '协商提议未获同意',
        description: '可改额度重新提议，或申请平台介入。',
      }
    case 'breach_case_ai_reviewing':
      return {
        title: '已申请平台介入',
        description: '平台将依据记录判定责任方。',
      }
    // 解除合作案件进展：解除合作此前完全不写卡片，界面却承诺「对方会在会话里收到通知」。
    // 每一步流转都有卡片，双方不必点进弹窗才知道进展。
    case 'after_sales_case_opened':
      return {
        title: '解除合作申请已提交',
        description: '等待对方回应。',
      }
    case 'after_sales_case_negotiation_proposed':
      return {
        title: '对方已发起解除合作协商',
        description: '请在解除合作弹窗里表态。',
      }
    case 'after_sales_case_negotiation_rejected':
      return {
        title: '解除合作协商提议未获同意',
        description: '可改额度重新提议，或交平台裁决。',
      }
    case 'after_sales_case_agreed':
      return {
        title: '对方已接受诉求',
        description: '等待发起人确认落实后结案。',
      }
    case 'after_sales_case_rework_accepted':
      return {
        title: '对方已接受返工诉求',
        description: '返工完成后由发起人验收。',
      }
    case 'after_sales_case_rework_unfulfilled':
      return {
        title: '返工未落实',
        description: '已转平台裁决。',
      }
    case 'after_sales_case_support_reviewing':
      return {
        title: '解除合作案件已转客服裁决',
        description: '等待平台裁决。',
      }
    case 'after_sales_case_funds_processing':
      // 这张卡片同一事件码有两种来路：双方一致（对方点了「接受诉求」）与平台裁决。卡片没有载荷，
      // 只说资金的去向与进度——写成「裁决已认定」会把双方谈成的案子说成平台介入。
      return {
        title: '解除合作资金处理中',
        description: '退款与赔付处理中，完成后另行通知。',
      }
    case 'after_sales_case_resolved':
      return {
        title: '解除合作案件已结案',
        description: '尾款原路退还，赔付从开发者保证金扣划。',
      }
    case 'after_sales_case_rejected':
      return {
        title: '解除合作申请未获支持',
        description: '案件已关闭。',
      }
    case 'after_sales_case_withdrawn':
      return {
        title: '解除合作申请已撤回',
        description: '案件已关闭，窗口内可重新发起。',
      }
    case 'after_sales_case_manual_required':
      return {
        title: '解除合作案件需人工处理',
        description: '资金未自动完成，客服跟进中。',
      }
    // 滞留提醒（BUG-046）：`manual_required` 之后案件不再有自动动作，会话里没有新卡片，
    // 双方的感受就是「转人工之后没下文」，而该需求的接单保证金冻结一直占着。与违约侧的
    // `breach_case_manual_required_reminder` 同一口径：只说明进展，不给按钮也不给跳转。
    // 提醒不写死「几天」：阈值是后端常量，文案写死天数后常量一改就在说假话。
    case 'after_sales_case_manual_required_reminder':
      return {
        title: '解除合作案件仍在人工处理中',
        description: '客服处理中，接单保证金继续冻结。',
      }
  }

  return undefined
}
