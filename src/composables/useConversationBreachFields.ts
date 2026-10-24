import { computed } from 'vue'

import type { RequirementBreachCaseItem } from '@/api/afterSales'
import {
  breachWithdrawnByMe as isBreachWithdrawnByMe,
  canRespondBreachCase,
  canWithdrawBreachCase,
  isBreachCaseSettled,
} from '@/shared/requirementBreach'

type BreachCaseSources = {
  case: RequirementBreachCaseItem | null
  currentUsername?: string
}

/**
 * 会话工具条里解除合作弹窗的派生判断与文案。
 *
 * 案件读数一律取契约字段（`status_label` / `turn_label` / `is_open`）；
 * 「谁能表态 / 谁能撤回」的判定复用 `shared/requirementBreach`——三个入口共用同一套，
 * 不在这里再写一份。只有在办 / 已收口 / 已撤回三种画面的切换与两处文案留在这里。
 */
export function useConversationBreachFields(readSources: () => BreachCaseSources) {
  const currentCase = () => readSources().case
  const currentUsername = () => readSources().currentUsername ?? ''

  /** 在办案件（`is_open` 由后端按状态机算）。 */
  const hasLiveBreachCase = computed(() => currentCase()?.is_open === true)

  /** 在办的才展示进展与动作；已收口 / 已撤回回到申报表单。 */
  const activeBreachCase = computed(() => (hasLiveBreachCase.value ? currentCase() : null))

  /** 已结案 / 已驳回：结论在表单上方只读展示，入口回到「新一轮申报」。 */
  const settledBreachCase = computed(() => {
    const item = currentCase()
    return isBreachCaseSettled(item) ? item : null
  })

  /** 上一轮已撤回的案件：撤回不等于没有案件，表单上方要把上一轮交代清楚。 */
  const withdrawnBreachCase = computed(() =>
    currentCase()?.status === 'withdrawn' ? currentCase() : null,
  )

  /** 撤回方是不是本人：只有本人撤回才叫「重新申报」，对方撤回时本人是首次申报。 */
  const breachWithdrawnByMe = computed(() =>
    isBreachWithdrawnByMe(currentCase(), currentUsername()),
  )

  /** 能不能由本人表态（同意 / 不同意）：我是对方当事人且在表态窗口内。 */
  const canRespondTermination = computed(() =>
    canRespondBreachCase(activeBreachCase.value, currentUsername()),
  )

  /** 撤回是立案人的单方动作，只在撤回窗口内由本人发起。 */
  const canWithdrawBreach = computed(() =>
    canWithdrawBreachCase(activeBreachCase.value, currentUsername()),
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
   * 申请表单上方的「上一轮」说明：结案 / 驳回的结论不能翻案、新一轮会新建案件，
   * 撤回则是沿用同一案件重新提交（案件编号不变，申请人与理由以本次提交为准）。
   */
  const breachRoundHint = computed(() => {
    if (settledBreachCase.value) {
      // 结案（`closed`）会按「结案即自动解除」作废合同、把需求退回大厅：同一需求上已经没有
      // 可裁决的合同，新一轮不是「再提一条新案件」而是「重新接单并签约」（BUG-038）。
      // 驳回不动合同，结论不能翻案，但需求仍在履约中，可以就新发生的事实再申报。
      return settledBreachCase.value.status === 'closed'
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
    canRespondTermination,
    canWithdrawBreach,
    breachDialogTitle,
    breachRoundHint,
  }
}
