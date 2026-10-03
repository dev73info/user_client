import type { RouteLocationRaw } from 'vue-router'

/**
 * 需求会话里的状态变化卡片：后端写入 message_type='card' 的消息，
 * action_type 为事件码，前端在这里统一决定标题、说明、按钮文案与跳转目标。
 * 卡片自己能做的动作（交付、验收、支付定金 / 尾款）都在同一条会话的底部工具条上，
 * 有原地的弹窗就把人交给它，只有真的在别处才能做的事（签约、需求大厅）才跳页。
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
  /**
   * 这张卡片当前还该不该给「交付」入口（开发者视角），点了原地打开交付弹窗，不跳页。
   *
   * 与 `to` 的区别就在这儿：交付弹窗一直挂在会话底部的工具条上，「去交付」把它打开即可，
   * 把人送回需求列表再自己找入口是白跑一趟。能不能交付仍由工具条裁定（没绑资源项目、
   * 阶段不对都不给），卡片只负责把入口摆出来。
   */
  deliveryAction?: boolean
  /**
   * 这张卡片当前还该不该给「验收」入口（需求方视角）。
   *
   * 只说「卡片所在的这一步还是验收那一步」，不看合同、绑定资源与版本数这些实际条件——
   * 那些由会话工具条按需求当前状态裁定，渲染时两者取交集，所以这里放宽也只会少给按钮，
   * 不会给出一个点下去必然报错的入口。
   */
  acceptanceAction?: boolean
  /**
   * 这张卡片当前还该不该给「支付」入口（需求方视角）：定金或尾款按需求当前状态判断，
   * 点了原地打开支付弹窗，不跳页。
   *
   * 与 `to` 的区别同 `deliveryAction`：支付弹窗一直挂在会话底部的工具条上，「支付定金 /
   * 支付尾款」把它打开即可，把人送回需求列表再自己找入口是白跑一趟。能不能付仍由工具条
   * 裁定（自管模式、合同未签、阶段不对都不给），卡片只负责把入口摆出来。
   */
  paymentAction?: boolean
}

export type ConversationCardRole = 'customer' | 'developer'

/** 卡片在会话里靠哪一侧。 */
export type ConversationCardSide = 'mine' | 'other' | 'system'

/**
 * 卡片该摆在会话的哪一侧：这一步是谁做的，就靠谁那一侧。
 *
 * 发起方由后端写卡片时定下（`requirement_conversation_message.actor_role`）：双方某一方做的
 * 动作带 `customer` / `developer`，纯平台通知（结单、客服裁决、超时兜底）为空。平台通知居中；
 * 查看者身份也认不出时（历史卡片先于换人，双方对不上）同样按平台通知处理——摆错侧比居中
 * 更容易被误读成「对方做的」或「我做的」。
 */
export function conversationCardSide(
  actorRole: 'customer' | 'developer' | null | undefined,
  viewerRole: 'customer' | 'developer' | null,
): ConversationCardSide {
  if (actorRole !== 'customer' && actorRole !== 'developer') {
    return 'system'
  }
  if (!viewerRole) {
    return 'system'
  }
  return actorRole === viewerRole ? 'mine' : 'other'
}

/**
 * 「交付」这一步还开着的需求状态：开发中与待付尾款，阶段性判定与工具条 `canDeliver` 一致。
 *
 * 工具条另需「已绑定资源项目 + 已发布版本」，卡片看不到那两个条件，只按阶段裁定：
 * 真正的交集由工具条兜底，所以这里放宽只会少给按钮，不会给出一个点下去必然报错的入口。
 * 门控的意义在历史卡片上——待分账与结单时交付早已做完，卡片再挂「去交付」，
 * 点开也只会落到一个没有交付入口的页面上。
 */
const DELIVERABLE_STATUSES: readonly string[] = ['in_development', 'pending_final']
/**
 * 尾款还在等需求方缴的状态。
 *
 * 尾款一缴清，需求立刻转「待分账」（`pending_settlement`），渠道分账完成后才结单，
 * 这两步里需求方都没有可付的尾款——历史卡片再挂「支付尾款」只会把人送回一个
 * 已经没有该入口的需求列表，甚至重复发起一笔已完成的支付。
 */
const FINAL_PAYABLE_STATUSES: readonly string[] = ['pending_final']

/**
 * 定金还在等需求方缴的状态。
 *
 * 与 `FINAL_PAYABLE_STATUSES` 分开列：两张卡片各管自己那一步——「合同已签署完成」上的
 * 「支付定金」到了待付尾款就不该再出现（那一步早做完了），反之亦然。
 */
const DEPOSIT_PAYABLE_STATUSES: readonly string[] = ['pending_deposit']

/** 需求当前是否落在给定的一组状态里；状态还没取到时按「不在」处理，宁可不给按钮。 */
function statusIn(status: string | null, allowed: readonly string[]): boolean {
  return status != null && allowed.includes(status)
}

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
  // 交付那一步还开着（开发者视角）：卡片上的「去交付」原地打开交付弹窗，不跳页。
  const canDeliverFromCard =
    role === 'developer' && statusIn(requirementStatus, DELIVERABLE_STATUSES)
  // 缴款那一步还开着（需求方视角）：卡片上的「支付定金 / 支付尾款」原地打开支付弹窗，
  // 同样不跳页。定金与尾款各看各的状态——「合同已签署完成」那张只在待缴定金时给按钮。
  const canPayDeposit = role !== 'developer' && statusIn(requirementStatus, DEPOSIT_PAYABLE_STATUSES)
  const canPayFinal = role !== 'developer' && statusIn(requirementStatus, FINAL_PAYABLE_STATUSES)

  // 案件类卡片（违约、售后）的详情都在需求卡片的弹窗里，没有可一键执行的资金动作，
  // 常规流转一律不给按钮，避免空跳转。转人工那两张也不给催办出口：客服本来就在跟进，
  // 把「催办」做成一张工单只是把平台的跟进变成用户的开单，平添客服工作量。
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
        // 否则点进去只会重复发起一笔已完成的支付。按下去原地打开支付弹窗，不跳需求列表。
        actionLabel: canPayDeposit ? '支付定金' : undefined,
        paymentAction: canPayDeposit,
        to: canPayDeposit ? undefined : requirementListRoute,
      }
    case 'deposit_paid':
      return {
        title: '定金已缴纳',
        description: '需求方已缴纳定金，需求进入开发阶段。',
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
          role === 'developer'
            ? '你已提交交付版本，等待需求方验收；验收通过后需求进入待付尾款。'
            : '开发者已提交交付版本，请验收后支付尾款。',
        // 交付是开发者自己提交的，这张卡片对开发者只是回执，不给按钮；
        // 需求方这边直接给交付产物的下载入口（不跳页），并在同一行给出「验收」：
        // 卡片说的就是「请验收后支付尾款」，入口放这儿比只留在底部工具条里更顺路。
        // 只在「开发中」给验收入口：交付产物的下载一直保留，但验收通过后卡片所在的那一步
        // 已经做完（该做的是付尾款，工具条的入口在），待付尾款上再点验收还会被后端拒掉
        // 不通过的结论，历史卡片不该留这样一个入口。
        actionLabel: role === 'developer' ? undefined : '下载交付产物',
        downloadDelivery: role !== 'developer',
        acceptanceAction: role === 'customer' && requirementStatus === 'in_development',
      }
    case 'acceptance_passed':
      return {
        title: '验收已通过',
        description: '需求方已验收通过，等待支付尾款。',
        // 付尾款是需求方的动作，开发者这边只是通知，不给按钮。
        // 只在「待付尾款」这一步给：尾款缴清即转「待分账」，这一步已经做完，
        // 再挂按钮只会把人送回一个没有尾款可付的需求列表。按下去原地打开支付弹窗，不跳页。
        actionLabel: canPayFinal ? '支付尾款' : undefined,
        paymentAction: canPayFinal,
        to: canPayFinal ? undefined : requirementListRoute,
      }
    case 'acceptance_rejected':
      return {
        title: '验收未通过',
        description: '需求方验收未通过，开发者整改后可重新提交验收。',
        // 整改与重新交付都是开发者的动作，需求方这边只是通知，不给按钮；
        // 与「定金已缴纳」同口径：交付入口只在交付那一步给，且原地打开交付弹窗不跳页，
        // 结单后的历史卡片不再挂。
        actionLabel: canDeliverFromCard ? '去交付' : undefined,
        deliveryAction: canDeliverFromCard,
        to: canDeliverFromCard ? undefined : requirementListRoute,
      }
    case 'final_paid':
      return {
        title: '尾款已缴纳',
        description: '需求方已缴纳尾款，等待渠道分账完成后正式结单。',
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
    // 协商解除：担保与自管两种模式共用这几条卡片码。卡片只交代「谁提了、对方处理了没有」，
    // 资金口径（担保模式同意即退定金、作废合同）在需求卡片的弹窗里讲，这里不重复细节。
    // 全部不给按钮：申请与表态都在需求卡片的弹窗里，这里再给入口只是空跳转。
    case 'unbind_request_submitted':
      return {
        title: '解除绑定申请已提交',
        description:
          '等待对方确认。对方同意后需求回到待接单，担保模式下同时作废合同、已缴定金全额原路退还；长时间未处理则申请自动作废，需求按原约定继续。',
      }
    case 'unbind_request_approved':
      return {
        title: '双方已同意解除绑定',
        description:
          '需求已回到待接单状态，担保模式下同时作废合同、已缴定金全额原路退还，双方仍可在会话里沟通。',
      }
    case 'unbind_request_rejected':
      return {
        title: '解除绑定申请未获同意',
        description: '需求按原约定继续履行。确有需要可在状态窗口内重新发起一笔申请。',
      }
    case 'unbind_request_auto_rejected':
      return {
        title: '解除绑定申请已自动驳回',
        description:
          '按当时「担保模式不支持协商解除」的规则被自动驳回；该规则已取消，现在双方都可直接申请解除。',
      }
    case 'unbind_request_expired':
      return {
        title: '解除绑定申请已自动作废',
        description: '对方长时间未处理，需求按原约定继续。确需解除可重新发起申请。',
      }
    // 违约案件进展（AD-5）：后端在案件每一步流转时都写一条卡片，这里给出对应中文。
    // 案件详情（责任方、退款与赔付金额、协商记录）都在需求卡片的违约弹窗里，
    // 没有可一键执行的资金动作，所以全部不给按钮，避免空跳转。
    case 'breach_case_submitted':
      return {
        title: '违约申报已提交',
        description: '双方可先在案件内自行协商；协商不成再由任一方申请平台介入判定。',
      }
    case 'breach_case_ai_judged':
      return {
        title: '平台已完成责任判定',
        description: '请在案件内表态是否接受判定，双方都接受后平台才会执行退款与赔付。',
      }
    case 'breach_case_support_reviewing':
      return {
        title: '违约案件已转客服人工判定',
        description: '请等待客服处理，判定结论会同步到案件与这里。',
      }
    case 'breach_case_resolved':
      return {
        title: '违约案件已结案',
        description: '资金已按判定处理完成，需求已回到待接单状态。',
      }
    case 'breach_case_rejected':
      return {
        title: '违约申报未获支持',
        description: '平台未支持本次违约申报，案件已关闭，双方合同仍按原约定继续履行。',
      }
    case 'breach_case_withdrawn':
      return {
        title: '违约申报已撤回',
        description: '申报人已撤回本次申报，合作按原约定继续履行。',
      }
    case 'breach_case_manual_required':
      return {
        title: '违约案件需人工处理',
        description: '资金处理未能自动完成，客服会尽快跟进并在案件内同步进展。',
      }
    // 「需人工处理」之后的两个事件码：后台滞留提醒与客服人工结案。停在人工处理这一段时
    // 案件不再有自动动作，会话里不补卡片，双方的感受就是「点了申报之后再没下文」。
    // 提醒不写死「几天」：阈值是后端常量，文案写死天数后常量一改就在说假话。
    case 'breach_case_manual_required_reminder':
      return {
        title: '违约案件仍在人工处理中',
        description:
          '案件转人工后仍未收口，客服会尽快处理并在案件内同步结论；双方的接单保证金在此期间继续冻结。',
      }
    case 'breach_case_manual_closed':
      return {
        title: '违约案件已由客服人工结案',
        description: '本次终止合作案件已由客服人工处理完毕，结论与资金口径见案件详情与需求卡片。',
      }
    // 协商还价与「申请平台介入」此前不写卡片，对方不提就没人在会话里说一声。
    // 与案件其它卡片同口径：详情在弹窗里，不给按钮。
    case 'breach_case_negotiation_proposed':
      return {
        title: '对方已发起终止合作协商',
        description:
          '请在案件内表态是否接受该退款额度。不接受可改额度重新提议，或申请平台介入判定。',
      }
    case 'breach_case_negotiation_rejected':
      return {
        title: '协商提议未获同意',
        description: '双方可改额度重新提议，或由任一方申请平台介入判定责任方。',
      }
    case 'breach_case_ai_reviewing':
      return {
        title: '已申请平台介入',
        description: '平台将依据会话记录与交付材料判定责任方，判定结论会同步到案件与这里。',
      }
    // 售后案件进展：售后此前完全不写卡片，界面却承诺「对方会在会话里收到通知」。
    // 每一步流转都有卡片，双方不必点进弹窗才知道进展。
    case 'after_sales_case_opened':
      return {
        title: '售后申请已提交',
        description: '诉求与诉求金额都在需求卡片的售后弹窗里，等待对方接受或不接受。',
      }
    case 'after_sales_case_negotiation_proposed':
      return {
        title: '对方已发起售后协商',
        description: '请在售后弹窗里表态是否接受该方案。不接受可改额度重新提议。',
      }
    case 'after_sales_case_negotiation_rejected':
      return {
        title: '售后协商提议未获同意',
        description: '双方可改额度重新提议，或由任一方按原诉求表态、交平台裁决。',
      }
    case 'after_sales_case_agreed':
      return {
        title: '对方已接受诉求',
        description: '等待发起人确认落实后结案；发起人也可上报未落实转平台裁决。',
      }
    case 'after_sales_case_rework_accepted':
      return {
        title: '对方已接受返工诉求',
        description: '返工完成后由发起人验收：确认落实即结案，未落实则转平台裁决。',
      }
    case 'after_sales_case_rework_unfulfilled':
      return {
        title: '返工未落实',
        description: '售后案件已转平台裁决，判定结论会同步到案件与这里。',
      }
    case 'after_sales_case_support_reviewing':
      return {
        title: '售后案件已转客服裁决',
        description: '请等待平台判定，裁决结论与资金动账都会同步到案件与这里。',
      }
    case 'after_sales_case_funds_processing':
      // 这张卡片同一事件码有两种来路：双方一致（对方点了「接受诉求」）与平台裁决。卡片没有载荷，
      // 只说资金的去向与进度——写成「裁决已认定」会把双方谈成的案子说成平台介入。
      return {
        title: '售后资金处理中',
        description: '退款与赔付正在处理中（渠道退款有等待期），完成后会再有一条结案通知。',
      }
    case 'after_sales_case_resolved':
      return {
        title: '售后案件已结案',
        description: '资金已处理完成：尾款原路退还需求方，赔付从开发者保证金扣划。',
      }
    case 'after_sales_case_rejected':
      return {
        title: '售后申请未获支持',
        description: '平台未支持本次售后诉求，案件已关闭。',
      }
    case 'after_sales_case_withdrawn':
      return {
        title: '售后申请已撤回',
        description: '发起人已撤回本次申请，案件已关闭；窗口内仍可重新发起。',
      }
    case 'after_sales_case_manual_required':
      return {
        title: '售后案件需人工处理',
        description: '资金处理未能自动完成，客服会尽快跟进并在案件内同步进展。',
      }
    default:
      return null
  }
}
