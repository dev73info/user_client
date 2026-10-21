import { computed, ref } from 'vue'

import {
  getAdapayBreachCase,
  reportAdapayTermination,
  requestAdapayPlatformReview,
  submitAdapayBreachDecision,
  withdrawAdapayBreach,
  type AdapayBreachCase,
  type AdapayBreachDecisionValue,
} from '@/api/adapay'
import type { ContractSigningStatus } from '@/api/contracts'
import type { RequirementItem } from '@/api/requirements'
import {
  breachWithdrawnByMe as breachWithdrawnBy,
  canRespondTermination,
  canWithdrawBreachCase,
  isTerminationNegotiating,
} from '@/shared/requirementBreach'
import {
  canReportBreach,
  isRequirementContractSigned,
  isSelfManagedRequirement,
} from '@/shared/requirementRowRules'
import { TMessage } from 'ui_73info'

type UseRequirementBreachOptions = {
  /** 当前登录 token：视图持有 `auth`，这里只按需取值，不把 pinia 拖进来。 */
  token: () => string
  /** 当前登录用户名：只喂给「是不是发起人」那组判定（撤回 / 表态 / 重新申报措辞）。 */
  username: () => string
  /**
   * 取某条需求的合同签署状态。
   *
   * 这份事实只有 `useMyRequirementsData` 的三张按条 map 持有（视图用 `rowFacts` 取出来）。
   * 在这里**重新判断**「有没有合同」会立刻产生第二套口径——签约状态必须注入，
   * 与需求卡片上的 `canReportBreach` 保持同一份数据。
   */
  contractOf: (item: RequirementItem) => ContractSigningStatus | null
}

/**
 * 「解除合作」这一域：案件加载、申报、撤回、表态、申请平台介入与重新申报。
 *
 * 状态、请求与 toast 都在这里；弹窗只拿 props 渲染、只 emit 动作，跳转（补收款银行卡）留给视图。
 * 案件内的判定与文案都是纯函数，在 `shared/requirementBreach.ts`，本文件只负责编排。
 */
export function useRequirementBreach(options: UseRequirementBreachOptions) {
  const visible = ref(false)
  const requirement = ref<RequirementItem | null>(null)
  const reason = ref('')
  const loading = ref(false)
  const breachCase = ref<AdapayBreachCase | null>(null)
  const caseLoading = ref(false)
  /** 已结束的案件走「新一轮申报」时置真：表单与上一轮说明同屏展示，提交会新建一条案件。 */
  const newRound = ref(false)
  const platformReviewLoading = ref(false)
  const withdrawLoading = ref(false)
  const withdrawConfirm = ref(false)
  const decisionLoading = ref(false)
  /** 不接受判定的原因输入框：纯 UI 态，跟着弹窗走。 */
  const rejectPanel = ref(false)
  const decisionNote = ref('')

  /** 上一轮撤回人是不是本人：只有本人撤回才叫「重新申报」，对方撤回时本人是首次申报。 */
  const withdrawnByMe = computed(() => breachWithdrawnBy(breachCase.value, options.username()))

  /** 当事人里不是发起人的那一位才能表态（同意 / 不同意解除合作）。 */
  const canRespond = computed(() => canRespondTermination(breachCase.value, options.username()))

  /** 只有申请人本人能撤回自己的申请。 */
  const canWithdraw = computed(() => canWithdrawBreachCase(breachCase.value, options.username()))

  /**
   * 无生效合同时不能再发起一轮（BUG-038）：结案（`succeeded`）会作废合同、把需求退回大厅，
   * 此时后端 `load_breach_report_context` 会按「无生效担保合同」直接拒收，界面上不该留一个
   * 点了才报错的按钮。判据用签约状态（后端已把作废合同排除在 `has_contract` 之外），
   * 与需求卡片上的 `canReportBreach` 同一口径；签约状态由视图注入，不在这里二次判断。
   */
  const canStartNewRound = computed(() => {
    const item = requirement.value
    return (
      item != null &&
      !isSelfManagedRequirement(item) &&
      isRequirementContractSigned({ contract: options.contractOf(item) })
    )
  })

  async function open(item: RequirementItem) {
    if (!canReportBreach(item, { contract: options.contractOf(item) })) {
      return
    }
    requirement.value = item
    reason.value = ''
    breachCase.value = null
    newRound.value = false
    visible.value = true
    caseLoading.value = true
    try {
      breachCase.value = await getAdapayBreachCase(options.token(), item.requirement_id)
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载解除合作案件失败')
    } finally {
      caseLoading.value = false
    }
  }

  /**
   * 关闭：任何一个请求在跑都不关。
   *
   * 这五个 loading 是一个整体——漏掉其中一个，「处理中点遮罩关闭」就会把请求的中断留在界面上
   * （案件已经变了、界面还停在旧状态）。挪动这段代码时先数一遍这几个。
   */
  function close() {
    if (
      loading.value ||
      platformReviewLoading.value ||
      withdrawLoading.value ||
      decisionLoading.value ||
      caseLoading.value
    ) {
      return
    }
    visible.value = false
    requirement.value = null
    reason.value = ''
    breachCase.value = null
    newRound.value = false
    rejectPanel.value = false
    decisionNote.value = ''
    withdrawConfirm.value = false
  }

  async function submitPlatformReview() {
    if (!breachCase.value) {
      return
    }
    platformReviewLoading.value = true
    try {
      breachCase.value = await requestAdapayPlatformReview(options.token(), breachCase.value.id)
      TMessage.success('已申请平台介入，等待平台判定')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '申请平台介入失败')
    } finally {
      platformReviewLoading.value = false
    }
  }

  /** 撤回是不可撤销动作（撤回后要重新申报），故先要求二次确认。 */
  function openWithdrawConfirm() {
    withdrawConfirm.value = true
  }

  function cancelWithdrawConfirm() {
    if (withdrawLoading.value) {
      return
    }
    withdrawConfirm.value = false
  }

  async function submitWithdraw() {
    const current = breachCase.value
    if (!current) {
      return
    }
    withdrawLoading.value = true
    try {
      breachCase.value = await withdrawAdapayBreach(options.token(), current.id)
      withdrawConfirm.value = false
      TMessage.success('解除合作申请已撤回，如仍有争议可重新发起')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '撤回解除合作申请失败')
    } finally {
      withdrawLoading.value = false
    }
  }

  /**
   * 已结束的案件回到申请表单：结案 / 驳回会新建一条案件，撤回则沿用同一案件重新提交；
   * 两种情况都保留上一轮案件，供表单上方的说明引用。
   */
  function reopen() {
    newRound.value = true
    reason.value = ''
    withdrawConfirm.value = false
  }

  function openRejectPanel() {
    decisionNote.value = ''
    rejectPanel.value = true
  }

  function cancelRejectPanel() {
    if (decisionLoading.value) {
      return
    }
    rejectPanel.value = false
    decisionNote.value = ''
  }

  async function submitDecision(decision: AdapayBreachDecisionValue) {
    const current = breachCase.value
    if (!current) {
      return
    }
    const negotiating = isTerminationNegotiating(current)
    decisionLoading.value = true
    try {
      breachCase.value = await submitAdapayBreachDecision(
        options.token(),
        current.id,
        decision,
        decisionNote.value.trim(),
      )
      rejectPanel.value = false
      decisionNote.value = ''
      const toast = negotiating
        ? decision === 'accepted'
          ? '已同意解除合作，按协商一致处理'
          : '已表示不同意，任一方可申请平台介入'
        : decision === 'accepted'
          ? '已接受 AI 判定，等待对方表态'
          : '已提交不接受，案件转客服人工判定'
      TMessage.success(toast)
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '提交解除合作案件表态失败')
    } finally {
      decisionLoading.value = false
    }
  }

  async function submitReport() {
    const item = requirement.value
    const text = reason.value.trim()
    if (!item || !text) {
      TMessage.warning('请填写解除合作的事实和相关依据')
      return
    }
    loading.value = true
    try {
      breachCase.value = await reportAdapayTermination(options.token(), item.requirement_id, text)
      newRound.value = false
      TMessage.success('解除合作申请已提交，请先与对方协商')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '提交解除合作申请失败')
    } finally {
      loading.value = false
    }
  }

  return {
    breachVisible: visible,
    breachRequirement: requirement,
    breachReason: reason,
    breachLoading: loading,
    breachCase,
    breachCaseLoading: caseLoading,
    breachNewRound: newRound,
    platformReviewLoading,
    breachWithdrawLoading: withdrawLoading,
    breachWithdrawConfirm: withdrawConfirm,
    breachDecisionLoading: decisionLoading,
    breachRejectPanel: rejectPanel,
    breachDecisionNote: decisionNote,
    breachWithdrawnByMe: withdrawnByMe,
    breachCanRespond: canRespond,
    breachCanWithdraw: canWithdraw,
    breachCanStartNewRound: canStartNewRound,
    openBreachReport: open,
    closeBreachReport: close,
    submitPlatformReview,
    openBreachWithdrawConfirm: openWithdrawConfirm,
    cancelBreachWithdrawConfirm: cancelWithdrawConfirm,
    submitBreachWithdraw: submitWithdraw,
    reopenBreachReport: reopen,
    openBreachRejectPanel: openRejectPanel,
    cancelBreachRejectPanel: cancelRejectPanel,
    submitBreachDecision: submitDecision,
    submitBreachReport: submitReport,
  }
}
