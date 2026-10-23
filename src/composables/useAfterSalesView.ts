import { computed, type Ref } from 'vue'

import type { AfterSalesCase } from '@/api/afterSales'
import {
  CLOSED_STATUSES,
  CONCLUDED_STATUSES,
  STATUS_DETAILS,
  STATUS_TIPS,
  actionAllowed,
  executedFunds,
  pendingFunds,
  processingTip,
  statusText,
  withdrawAllowed,
} from '@/shared/afterSalesView'
import { formatCnDateTime } from '@/shared/requirementDisplay'

export type AfterSalesViewProps = {
  currentUsername: string
  /** 当前登录人是否是本需求的需求方（甲方）：只有甲方能发起解除合作。 */
  canOpenCase: boolean
}

export type AfterSalesViewState = {
  cases: Ref<AfterSalesCase[]>
  windowOpen: Ref<boolean | null>
  windowClosesAt: Ref<string | null>
  /** 主张金额的**分**值（`useAfterSalesCase` 的同名派生），发起表单的上限要用它。 */
  budgetFen: Ref<number>
}

/**
 * 解除合作弹窗的**展示派生层**（R047 从 `components/AfterSalesModal.vue` 拆出）：
 * 挑出「在办案件 / 上次收口的案件」、窗口与入口守卫、以及各种「能不能点」的判定。
 *
 * 纯文案与算式在 `shared/afterSalesView.ts`，这里只做结合状态的选择与拼接。
 *
 * 两条判据必须与后端保持一致，改之前先看注释：
 * - `concludedWithFunds` 与后端 `dispute::service::self_service_reopen_allowed` 对齐（都看认定额度，
 *   不看渠道单号）：口径一旦分叉，前端会渲染出一个后端必然 409 的表单；
 * - `actionAllowed` / `withdrawAllowed` 与后端的状态守卫对齐。
 */

export function useAfterSalesView(options: AfterSalesViewProps, state: AfterSalesViewState) {
  /** 解除合作窗口已关闭：此时不再渲染发起表单——表单填完必然被后端 409 拒绝。 */
  const windowClosed = computed(() => state.windowOpen.value === false)

  /** 窗口已关闭时的说明文案：拿得到关闭时间就说清楚，拿不到（结单时间异常）退化为通用措辞。 */
  const windowClosedTip = computed(() =>
    state.windowClosesAt.value
      ? `解除合作窗口已于 ${formatCnDateTime(state.windowClosesAt.value)} 关闭，本需求不再受理新的解除合作申请。如需反映其它问题，请走工单中心联系平台。`
      : '本需求的解除合作窗口已关闭，不再受理新的解除合作申请。如需反映其它问题，请走工单中心联系平台。',
  )

  /**
   * 当前需求正在办理的解除合作案件（一个需求只有一条案件，收口前就挂在它上面）。
   */
  const currentCase = computed(() =>
    state.cases.value.find((row) => !CLOSED_STATUSES.includes(row.status)),
  )

  /**
   * 已经拿到结论的收口案件（结案 / 驳回）：案件只有一条，所以它就是「上次解除合作」的结果。
   *
   * 解除合作不记录轮次：再次提交会复用同一条案件，上一次的诉求与结论被这次的覆盖，
   * 平台侧也查不到历史诉求，所以这里只展示「上次解除合作」这一条结论，不堆历史列表。
   *
   * 撤回不进这块：撤回只是发起人自己收手，没有责任认定也没有资金执行，不是「结论」。
   */
  const lastConcludedCase = computed(() =>
    state.cases.value.find((row) => CONCLUDED_STATUSES.includes(row.status)),
  )

  /** 上次解除合作收口的展示时间：优先用后端给的结案时间，兜底用最后更新时间。 */
  const lastConcludedAt = computed(() => {
    const row = lastConcludedCase.value
    return row ? row.resolvedAt || row.updatedAt : ''
  })

  /**
   * 收口案件里「动过钱」的那种（认定过退款或赔付额度）：它是终态，需求方**不能再自助发起**
   * ——后端会以 409「该需求已有裁决结果的解除合作案件」挡下，所以这里不能再渲染发起表单，
   * 否则等于摆一个必然失败的入口。重新主张要由客服在平台侧重开案件（复用同一行，不记轮次）。
   *
   * 没动过钱的收口案件（只反馈问题、诉求不成立被驳回）不在这里：那类结论没有钱可翻，
   * 需求方可以自己再来一次，后端也放行——`withdrawn` 同理（他自己收的手，本来就不算结论）。
   *
   * 判据必须与后端 `dispute::service::self_service_reopen_allowed` 对齐（都看认定额度，不看渠道
   * 单号）：口径一旦分叉，前端会渲染出一个后端必然 409 的表单。
   */
  const concludedWithFunds = computed(() => {
    const row = lastConcludedCase.value
    return Boolean(row && (row.refundAmountFen > 0 || row.compensationAmountFen > 0))
  })

  /** 已裁决且动过钱时的说明：把「为什么不能自助发起、下一步找谁」说清楚。 */
  const caseConcludedTip = computed(() => {
    const row = lastConcludedCase.value
    const funds = row ? executedFunds(row).join(' / ') || pendingFunds(row).join(' / ') : ''
    return (
      `本需求已有裁决结果的解除合作案件（${row ? statusText(row.status) : '已收口'}` +
      `${funds ? `：${funds}` : ''}），需求方不能再次自助发起。` +
      '如需重新主张，请联系平台客服重开该案件，或到工单中心提交工单。'
    )
  })

  /**
   * 能不能发起解除合作：调用方允许（需求方视角）+ 窗口还开着 + 没有「已裁决且执行过资金」的收口案件。
   * 窗口 / 案件状态未知（老后端、或列表还没加载完）时不拦，保留后端 409 兜底。
   */
  const canSubmitCase = computed(
    () => options.canOpenCase && !windowClosed.value && !concludedWithFunds.value,
  )

  /**
   * 主张金额的文案：它只是发起人的**主张**，平台认定时作参考（实际能执行多少由「客户已付且未退的
   * 部分」与「仍冻结的接单保证金」两个上限决定）。
   *
   * 文案里不出现「尾款」「保证金」这些池子名——「钱从哪出」是平台认定的事，发起人只需要说
   * 「我希望拿回多少」。留空表示由平台认定（按诉求与上限给）；上限是需求预算（这笔单子的价），
   * 后端也会以 400 拒收超预算的主张，所以这里直接把它写进占位提示。
   */
  const claimAmountField = computed(() => ({
    label: '希望拿回多少（元）',
    placeholder: state.budgetFen.value
      ? `留空由平台认定；最多不超过需求预算 ${(state.budgetFen.value / 100).toFixed(2)} 元`
      : '留空由平台认定，不超过你已支付的金额',
  }))

  /**
   * 本方在这次案件里的表态：发起人走撤回 / 确认落实；他那一列在发起时已被写成 `opened`
   * （诉求即表态），所以这里不会是 null 只对本方是发起人时成立。
   */
  const myDecision = computed(() => {
    const row = currentCase.value
    if (!row) {
      return null
    }
    return row.viewerRole === 'customer' ? row.customerDecision : row.developerDecision
  })

  /**
   * 能不能表态：案件处于可表态状态，且本方还没有表态过。
   * 后端每方只收一次表态（`*_decision IS NULL`），已经表过态的按钮留着只会点出 409。
   */
  const canRespond = computed(() => {
    const row = currentCase.value
    if (!row || row.viewerRole === null || row.viewerRole === row.openerRole) {
      return false
    }
    return actionAllowed(row.status) && myDecision.value === null
  })

  /** 发起人视角的收口动作：确认落实（`agreed`）与撤回申请。 */
  const isOpener = computed(() =>
    Boolean(currentCase.value && currentCase.value.openedBy === options.currentUsername),
  )

  /** 发起人撤回：`agreed`（等确认落实）与 `rework_pending`（返工中）也放行，不想再追究就收口。 */
  function withdrawAllowed(status: AfterSalesCase['status']) {
    return actionAllowed(status) || status === 'agreed' || status === 'rework_pending'
  }

  const canWithdraw = computed(() => {
    const row = currentCase.value
    return Boolean(row && isOpener.value && withdrawAllowed(row.status))
  })

  /** 发起人确认诉求已落实：`agreed`（没要钱 / 或两个上限都是 0）与 `rework_pending`（返工）都在等这一步。 */
  const canComplete = computed(() =>
    Boolean(
      isOpener.value && ['agreed', 'rework_pending'].includes(currentCase.value?.status ?? ''),
    ),
  )

  /**
   * 发起人报返工未落实：只有返工中能用，点了转平台裁决（客服可动用退款与赔付两个渠道）。
   *
   * 这是返工单独开 `rework_pending` 的意义所在——`agreed` 上只有「确认已落实」一条路，
   * 对方答应了没做到时，发起人除了撤回重开没有别的说法。
   */
  const canReportUnfulfilled = computed(() =>
    Boolean(isOpener.value && currentCase.value?.status === 'rework_pending'),
  )

  const statusTip = computed(() => {
    const row = currentCase.value
    if (!row) {
      return null
    }
    if (row.status === 'processing') {
      return processingTip(row.liableParty)
    }
    return STATUS_TIPS[row.status] ?? null
  })

  const statusDetail = computed(() =>
    currentCase.value ? (STATUS_DETAILS[currentCase.value.status] ?? null) : null,
  )

  return {
    windowClosed,
    windowClosedTip,
    currentCase,
    lastConcludedCase,
    lastConcludedAt,
    concludedWithFunds,
    caseConcludedTip,
    canSubmitCase,
    claimAmountField,
    myDecision,
    canRespond,
    isOpener,
    canWithdraw,
    canComplete,
    canReportUnfulfilled,
    statusTip,
    statusDetail,
  }
}
