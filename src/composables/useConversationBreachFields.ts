import { computed } from 'vue'

import type { AdapayBreachCase } from '@/api/adapay'
import {
  breachWithdrawnByMe as isBreachWithdrawnByMe,
  canDecideBreachCase,
  canRequestPlatformReview as canRequestPlatformReviewOf,
  canRespondTermination as canRespondTerminationOf,
  canWithdrawBreachCase,
  isTerminationNegotiating,
} from '@/shared/requirementBreach'
import { BREACH_CLOSED_STATUSES, SETTLED_BREACH_STATUSES } from '@/shared/breachStatus'

type BreachCaseSources = {
  case: AdapayBreachCase | null
  isDeveloper: boolean
  currentUsername?: string
}

/**
 * 会话工具条里解除合作弹窗的派生判断与文案。
 *
 * 从 `RequirementConversationActions.vue` 抽出。判断口径尽量用 `shared/requirementBreach` 那组纯函数
 * （开发者页与需求方页共用同一套状态机）；只有这条工具条自己的两处文案——弹窗标题与「上一轮」
 * 说明——留在这里，措辞与另两个入口不完全一致，不合并以免改掉界面文案。
 */
export function useConversationBreachFields(readSources: () => BreachCaseSources) {
  const currentCase = () => readSources().case
  const currentUsername = () => readSources().currentUsername ?? ''
  const breachView = () => (readSources().isDeveloper ? 'dev' : 'creator')

  /** 未结束的案件（已撤回 / 已驳回 / 已结案不再提供入口）。 */
  const hasLiveBreachCase = computed(() => {
    const item = currentCase()
    return item != null && !BREACH_CLOSED_STATUSES.includes(item.status)
  })

  /** 已撤回 / 已驳回 / 已结案的案件不再展示明细，回到申报表单（与需求列表页一致）。 */
  const activeBreachCase = computed(() => (hasLiveBreachCase.value ? currentCase() : null))

  /** 已结案 / 已驳回的案件：结论在表单上方只读展示，入口回到「新一轮申报」。 */
  const settledBreachCase = computed(() => {
    const item = currentCase()
    return item && SETTLED_BREACH_STATUSES.includes(item.status) ? item : null
  })

  /**
   * 上一轮已撤回的案件：撤回不等于没有案件，表单上方要把上一轮交代清楚，
   * 否则用户看到「重新申报」也不知道自己重的是什么。
   */
  const withdrawnBreachCase = computed(() =>
    currentCase()?.status === 'withdrawn' ? currentCase() : null,
  )

  /** 撤回方是不是本人：只有本人撤回才叫「重新申报」，对方撤回时本人是首次申报。 */
  const breachWithdrawnByMe = computed(() =>
    isBreachWithdrawnByMe(currentCase(), currentUsername()),
  )

  const canDecideBreach = computed(() => canDecideBreachCase(activeBreachCase.value, breachView()))

  /**
   * 协商阶段（解除合作的第一步）是否仍在等表态：案件在 `submitted` 且双方都没就「解除合作」表态。
   *
   * 表态用同一枚接口（`submitBreachDecision`）承担两段语义：协商阶段传 `accepted` = 同意解除、
   * `rejected` = 不同意；判定阶段（`ai_judged`）传 `accepted` / `rejected` = 对 AI 判定的表态。
   */
  const terminationNegotiating = computed(() =>
    Boolean(isTerminationNegotiating(activeBreachCase.value)),
  )

  /** 能不能由本人对「解除合作」表态：当事人里**不是发起人**的那一位。 */
  const canRespondTermination = computed(() =>
    canRespondTerminationOf(activeBreachCase.value, currentUsername()),
  )

  const canRequestPlatformReview = computed(() =>
    canRequestPlatformReviewOf(activeBreachCase.value),
  )

  /** 撤回是申请人的单方动作：待判定期间（还没有结论）只有本人能撤回自己的申请，与需求列表页一致。 */
  const canWithdrawBreach = computed(() =>
    canWithdrawBreachCase(activeBreachCase.value, currentUsername()),
  )

  /**
   * 中间态：赔付要打给需求方，但需求方的渠道会员没有结算账户，钱落不下来。
   *
   * 这时案件不会转人工，而是停在 `awaiting_payer_settlement` 等需求方补收款账户——补齐后平台
   * 会自动按原认定续做赔付与退款。所以这里必须把「下一步在谁手上」说清楚：需求方看到的是
   * 一个去绑卡的入口，开发者看到的是「等对方补账户」，两边都不该干等。
   */
  const breachAwaitingPayerSettlement = computed(
    () => activeBreachCase.value?.status === 'awaiting_payer_settlement',
  )

  const breachDialogTitle = computed(() => {
    if (activeBreachCase.value) {
      return '解除合作进展'
    }
    if (settledBreachCase.value) {
      return '发起新的解除合作'
    }
    return breachWithdrawnByMe.value ? '重新发起解除合作' : '解除合作'
  })

  /**
   * 申请表单上方的「上一轮」说明：把歧义点讲清楚——结案 / 驳回的结论不能翻案、新一轮会新建案件，
   * 撤回则是沿用同一案件重新提交（案件编号不变，申请人与理由以本次提交为准）。
   */
  const breachRoundHint = computed(() => {
    const settled = settledBreachCase.value
    if (settled) {
      // 结案（`succeeded`）会按「结案即自动解除」作废合同、把需求退回大厅：同一需求上已经没有
      // 可裁决的合同，新一轮不是「再提一条新案件」而是「重新接单并签约」（BUG-038）。
      // 驳回不动合同，结论不能翻案，但需求仍在履约中，可以就新发生的事实再申报。
      return settled.status === 'succeeded'
        ? '上一轮案件已结案，需求已退回大厅、原合同已作废；需重新接单并签约后才能再次发起解除合作。'
        : '上一轮案件已驳回，结论不能翻案；下面提交的是新一轮申请，会新建一条案件，只针对驳回之后新发生的事实。'
    }
    if (withdrawnBreachCase.value) {
      return breachWithdrawnByMe.value
        ? '上一轮由你撤回，本次提交沿用同一条案件（案件编号不变），申请人与理由以本次提交为准，双方继续跟踪这一条。'
        : '上一轮由对方申请后撤回，本次提交沿用同一条案件（案件编号不变），按你本次提交的事实与依据重新判定。'
    }
    return ''
  })

  return {
    hasLiveBreachCase,
    activeBreachCase,
    settledBreachCase,
    withdrawnBreachCase,
    breachWithdrawnByMe,
    canDecideBreach,
    terminationNegotiating,
    canRespondTermination,
    canRequestPlatformReview,
    canWithdrawBreach,
    breachAwaitingPayerSettlement,
    breachDialogTitle,
    breachRoundHint,
  }
}
