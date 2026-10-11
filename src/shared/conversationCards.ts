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
 * 尾款已经付清之后的状态：历史「验收已通过」卡片上的「支付尾款」必须收起，
 * 否则会把人送回没有尾款可付的列表，甚至重复发起支付。
 */
const FINAL_PAYMENT_DONE_STATUSES: readonly string[] = [
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
const DEPOSIT_PAYABLE_STATUSES: readonly string[] = ['pending_deposit']

/** 需求当前是否落在给定的一组状态里；状态还没取到时按「不在」处理，宁可不给按钮。 */
function statusIn(status: string | null, allowed: readonly string[]): boolean {
  return status != null && allowed.includes(status)
}

/**
 * 验收类卡片说明末尾挂上交付版本号（来自消息 `action_ref`）。
 * 没有版本时保持原说明，避免历史空卡片多出一句「版本：」。
 */
function withDeliveryVersion(description: string, actionRef?: string | null): string {
  const version = actionRef?.trim()
  if (!version) {
    return description
  }
  return `${description}（交付版本 ${version}）`
}

export function conversationCardMeta(
  actionType: string,
  requirementId: string,
  role: ConversationCardRole | null,
  requirementStatus: string | null,
  /** 卡片消息上的 `action_ref`：交付 / 验收类是版本号。 */
  actionRef?: string | null,
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

  // 案件类卡片（解除合作）的详情都在需求卡片的弹窗里，没有可一键执行的资金动作，
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
    // 后端给的文案已写明「需求已结单，如需返工、退款或赔付请通过解除合作发起」，这里照抄口径，
    // 只保留产物下载（版本确实发布了，是这张卡片上唯一真实可做的动作）。
    case 'delivery_submitted_after_completed':
      return {
        title: role === 'developer' ? '已提交结单后的新版本' : '收到结单后的新版本',
        description:
          role === 'developer'
            ? '你已提交新版本，需求此前已结单，本次交付不再走验收；如需返工、退款或赔付，请通过「解除合作」发起。'
            : '开发者已提交新版本，需求此前已结单，本次交付不再走验收；如需返工、退款或赔付，请通过「解除合作」发起。',
        actionLabel: role === 'developer' ? undefined : '下载交付产物',
        downloadDelivery: role !== 'developer',
      }
    case 'acceptance_passed':
      return {
        title: '验收已通过',
        description: withDeliveryVersion('需求方已验收通过，等待支付尾款。', actionRef),
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
        description: withDeliveryVersion(
          '需求方验收未通过，开发者整改后可重新提交验收。',
          actionRef,
        ),
        // 整改与重新交付都是开发者的动作，需求方这边只是通知，不给按钮；
        // 与「定金已缴纳」同口径：交付入口只在交付那一步给，且原地打开交付弹窗不跳页，
        // 结单后的历史卡片不再挂。
        actionLabel: canDeliverFromCard ? '去交付' : undefined,
        deliveryAction: canDeliverFromCard,
        to: canDeliverFromCard ? undefined : requirementListRoute,
      }
    // 违约责任条款（按需判定，见后端 doc/违约与催告.md）：期限届满的四种后果。
    // 它们都是「时间到了」而不是某一方按下的动作，所以卡片本身不给「推进流程」的按钮——
    // 要么平台已按条款推进完（视为验收），要么只是提醒（逾期），当事人真正要做的事
    // 在需求卡片上（缴费 / 交付 / 解除合作）。
    case 'acceptance_deemed_passed':
      return {
        title: '视为验收通过',
        description: withDeliveryVersion(
          '验收催告期限届满，需求方未提出具体异议，按合同约定视为验收通过，需求进入待付尾款。',
          actionRef,
        ),
        actionLabel: canShowFinalPayOnAcceptanceCard ? '支付尾款' : undefined,
        paymentAction: canShowFinalPayOnAcceptanceCard,
      }
    case 'delivery_overdue':
      return {
        title: '交付已逾期',
        description:
          role === 'developer'
            ? '交付已超过合同约定期限，逾期将按约定计迟延履行违约金。'
            : '开发者交付已超过合同约定期限，逾期将按约定计迟延履行违约金。',
        actionLabel: canDeliverFromCard ? '去交付' : undefined,
        deliveryAction: canDeliverFromCard,
      }
    case 'final_pay_overdue':
      return {
        title: '尾款已逾期',
        description: '尾款已超过合同约定期限，逾期将按约定计迟延履行违约金。',
        actionLabel: canPayFinal ? '支付尾款' : undefined,
        paymentAction: canPayFinal,
      }
    case 'final_pay_cure_by_developer':
      return {
        title: '开发者催告支付尾款',
        description:
          role === 'developer'
            ? '你已催告需求方支付尾款。催告只是正式通知，不会自动扣款。'
            : '开发者已催告支付尾款，请尽快按合同约定完成付款。',
        actionLabel: canPayFinal ? '支付尾款' : undefined,
        paymentAction: canPayFinal,
      }
    case 'remediation_expired':
      return {
        title: '限期补救已届满',
        description: '交付仍未合格，需求方可申请减少价款，或按合同约定申报违约。',
        actionLabel: role === 'customer' ? '去我的需求' : undefined,
        to: role === 'customer' ? requirementListRoute : undefined,
      }
    // 顺延（不可抗力 / 需求变更 / 第三方原因）：只延期限、不动钱，没有可执行的动作。
    // 文案必须写明「已发生的逾期不因顺延而消失」，否则会被读成「顺延一下就把逾期抹了」。
    case 'breach_deadline_extended':
      return {
        title: '合同期限已顺延',
        description:
          '因不可抗力 / 需求变更 / 第三方原因，合同期限已顺延（只延期限、不动资金）。已经发生的逾期不因顺延而消失。',
      }
    // 中止 / 恢复：与顺延同一条通道（只动期限、不动钱）。中止期间不判定到期，恢复时按
    // 实际停摆时长整体后移期限——所以「中止」不是免责，已发生的逾期仍然留着。
    case 'breach_deadline_suspended':
      return {
        title: '合同期限已中止计时',
        description:
          '因不可抗力 / 需求变更 / 第三方原因，合同期限已中止计时（中止期间不判定到期，不动资金）。恢复时按实际停摆时长顺延，已经发生的逾期不因中止而消失。',
      }
    case 'breach_deadline_resumed':
      return {
        title: '合同期限已恢复计时',
        description:
          '合同期限已恢复计时，并按实际停摆时长顺延（只延期限、不动资金）。已经发生的逾期不因中止而消失。',
      }
    // 当事人的申请入口：申请只落一张客服工单，期限的实际变更由客服执行，
    // 所以文案说「已提交申请」而不是「期限已变更」。
    case 'breach_deadline_change_requested':
      return {
        title: '已提交期限变更申请',
        description:
          '顺延 / 中止合同期限的申请已提交给平台客服，客服核实事由后会在需求上执行（申请本身不改期限）。',
      }
    case 'final_paid':
      return {
        title: '尾款已缴纳',
        description: '需求方已缴纳尾款，等待渠道分账完成后正式结单。',
        // 待分账期间双方都没有可执行的动作（等待期内解除合作走需求卡片上的入口）；
        // 「去我的需求」只是把人送回自己已经在的需求列表，属空跳转，故不给按钮。
      }
    case 'requirement_settled':
      return {
        title: '需求已结单',
        description: '尾款分账已完成，需求正式结单，解除合作入口已开放。',
        // 与 final_paid 同口径：解除合作入口就在需求卡片上，这里再给按钮只是空跳转。
      }
    case 'binding_released':
      return {
        title: '绑定已解除',
        description: '需求已回到待接单状态。',
        actionLabel: '去需求大厅',
        to: role === 'developer' ? { name: 'dev-requirement-hall' } : requirementListRoute,
      }
    // 需求方单方取消（已缴定金档）：结局是需求被取消，与上面的「回到待接单」不是一回事，
    // 后端为此单列了事件码（BUG-050）。不给按钮——这笔需求已经不在大厅里了。
    case 'requirement_cancelled':
      return {
        title: '需求已被需求方取消',
        description:
          '需求方取消了这笔需求：按合同约定无正当理由取消适用定金罚则，已缴定金不予退还（按客户违约规则分账给平台与开发者），绑定关系已解除、接单保证金冻结已释放。这段会话保留为只读。',
      }
    // 解除合作（2026-10-06）：协商解除与判责合并成一个入口后的三条卡片。
    // 案件先进入协商阶段，对方同意即无责退出、不同意（或超时未回应）才由任一方申请平台介入。
    // 全部不给按钮：发起与表态都在需求卡片的弹窗里，这里再给入口只是空跳转。
    case 'termination_submitted':
      return {
        title: '解除合作申请已提交',
        description:
          '等待对方回应。对方同意即协商一致解除；不同意或超时未回应，任一方可申请平台介入。',
      }
    case 'termination_agreed':
      return {
        title: '双方已同意解除合作',
        description:
          '按协商一致处理：需求回到待接单、合同作废、已缴款项按原路口径退还，双方都不担违约金，会话转为只读。',
      }
    case 'termination_rejected':
      return {
        title: '对方不同意解除合作',
        description:
          '协商不一致。任一方可申请平台介入，由平台核对合同、支付、交付与沟通记录后判定责任方并按责任执行；也可以继续履约。',
      }
    // 协商解除：担保与自管两种模式共用这几条卡片码。**只用于渲染历史卡片**——2026-10-06 起
    // 这条通道并入「解除合作」案件（上面的 termination_*），事件码不再写入。
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
    // 解除合作案件进展（AD-5）：后端在案件每一步流转时都写一条卡片，这里给出对应中文。
    // 案件详情（责任方、退款与赔付金额、协商表态）都在需求卡片的解除合作弹窗里，
    // 没有可一键执行的资金动作，所以全部不给按钮，避免空跳转。
    case 'breach_case_submitted':
      return {
        title: '解除合作案件已立案',
        description: '等待对方回应；对方同意即按协商一致处理，不同意或超时未回应可申请平台介入判定。',
      }
    case 'breach_case_ai_judged':
      return {
        title: '平台已完成责任判定',
        description: '请在案件内表态是否接受判定，双方都接受后平台才会执行退款与赔付。',
      }
    case 'breach_case_support_reviewing':
      return {
        title: '解除合作案件已转客服人工判定',
        description: '请等待客服处理，判定结论会同步到案件与这里。',
      }
    case 'breach_case_resolved':
      return {
        title: '解除合作案件已结案',
        description: '资金已按判定处理完成，需求已回到待接单状态。',
      }
    case 'breach_case_rejected':
      return {
        title: '解除合作申请未获支持',
        description: '平台未支持本次解除合作申请，案件已关闭，双方合同仍按原约定继续履行。',
      }
    case 'breach_case_withdrawn':
      return {
        title: '解除合作申请已撤回',
        description: '发起人已撤回本次申请，合作按原约定继续履行。',
      }
    case 'breach_case_manual_required':
      return {
        title: '解除合作案件需人工处理',
        description: '资金处理未能自动完成，客服会尽快跟进并在案件内同步进展。',
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
        to:
          role === 'customer'
            ? { name: 'workbench-account', query: { settle: '1' } }
            : undefined,
      }
    // 「需人工处理」之后的两个事件码：后台滞留提醒与客服人工结案。停在人工处理这一段时
    // 案件不再有自动动作，会话里不补卡片，双方的感受就是「点了申报之后再没下文」。
    // 提醒不写死「几天」：阈值是后端常量，文案写死天数后常量一改就在说假话。
    case 'breach_case_manual_required_reminder':
      return {
        title: '解除合作案件仍在人工处理中',
        description:
          '案件转人工后仍未收口，客服会尽快处理并在案件内同步结论；双方的接单保证金在此期间继续冻结。',
      }
    case 'breach_case_manual_closed':
      return {
        title: '解除合作案件已由客服人工结案',
        description: '本次解除合作案件已由客服人工处理完毕，结论与资金口径见案件详情与需求卡片。',
      }
    // 协商还价与「申请平台介入」此前不写卡片，对方不提就没人在会话里说一声。
    // 与案件其它卡片同口径：详情在弹窗里，不给按钮。
    case 'breach_case_negotiation_proposed':
      return {
        title: '对方已发起解除合作协商',
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
    // 解除合作案件进展：解除合作此前完全不写卡片，界面却承诺「对方会在会话里收到通知」。
    // 每一步流转都有卡片，双方不必点进弹窗才知道进展。
    case 'after_sales_case_opened':
      return {
        title: '解除合作申请已提交',
        description: '诉求与诉求金额都在需求卡片的解除合作弹窗里，等待对方接受或不接受。',
      }
    case 'after_sales_case_negotiation_proposed':
      return {
        title: '对方已发起解除合作协商',
        description: '请在解除合作弹窗里表态是否接受该方案。不接受可改额度重新提议。',
      }
    case 'after_sales_case_negotiation_rejected':
      return {
        title: '解除合作协商提议未获同意',
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
        description: '解除合作案件已转平台裁决，判定结论会同步到案件与这里。',
      }
    case 'after_sales_case_support_reviewing':
      return {
        title: '解除合作案件已转客服裁决',
        description: '请等待平台判定，裁决结论与资金动账都会同步到案件与这里。',
      }
    case 'after_sales_case_funds_processing':
      // 这张卡片同一事件码有两种来路：双方一致（对方点了「接受诉求」）与平台裁决。卡片没有载荷，
      // 只说资金的去向与进度——写成「裁决已认定」会把双方谈成的案子说成平台介入。
      return {
        title: '解除合作资金处理中',
        description: '退款与赔付正在处理中（渠道退款有等待期），完成后会再有一条结案通知。',
      }
    case 'after_sales_case_resolved':
      return {
        title: '解除合作案件已结案',
        description: '资金已处理完成：尾款原路退还需求方，赔付从开发者保证金扣划。',
      }
    case 'after_sales_case_rejected':
      return {
        title: '解除合作申请未获支持',
        description: '平台未支持本次解除合作诉求，案件已关闭。',
      }
    case 'after_sales_case_withdrawn':
      return {
        title: '解除合作申请已撤回',
        description: '发起人已撤回本次申请，案件已关闭；窗口内仍可重新发起。',
      }
    case 'after_sales_case_manual_required':
      return {
        title: '解除合作案件需人工处理',
        description: '资金处理未能自动完成，客服会尽快跟进并在案件内同步进展。',
      }
    // 滞留提醒（BUG-046）：`manual_required` 之后案件不再有自动动作，会话里没有新卡片，
    // 双方的感受就是「转人工之后没下文」，而该需求的接单保证金冻结一直占着。与违约侧的
    // `breach_case_manual_required_reminder` 同一口径：只说明进展，不给按钮也不给跳转。
    // 提醒不写死「几天」：阈值是后端常量，文案写死天数后常量一改就在说假话。
    case 'after_sales_case_manual_required_reminder':
      return {
        title: '解除合作案件仍在人工处理中',
        description:
          '案件转人工后仍未收口，客服会尽快处理并在案件内同步结论；该需求的接单保证金在此期间继续冻结。',
      }
    default:
      return null
  }
}
