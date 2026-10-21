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
import type { RequirementItem } from '@/api/devRequirements'
import {
  breachWithdrawnByMe as breachWithdrawnBy,
  canDecideBreachCase,
  canRespondTermination,
  canWithdrawBreachCase,
  isTerminationNegotiating,
} from '@/shared/requirementBreach'
import { TMessage } from 'ui_73info'

type UseBreachCaseOptions = {
  /** 当前登录 token：视图持有 `auth`，这里只按需取值，不把 pinia 拖进来。 */
  token: () => string
  /** 当前登录用户名：只喂给「是不是发起人」那组判定（撤回 / 表态 / 重新申报措辞）。 */
  username: () => string
  /**
   * 取某条需求的合同签署状态。
   *
   * 这份事实只有视图持有的 `signingStatusMap`（列表加载时一次取回）知道。
   * 在这里**重新判断**「有没有合同」会立刻产生第二套口径——签约状态必须注入，
   * 与需求卡片上「解除合作」入口的 `canReportBreach` 保持同一份数据。
   */
  contractOf: (item: RequirementItem) => ContractSigningStatus | null
}

/**
 * 开发者侧「解除合作案件」这一域：案件加载、申报、协商、AI 判定表态、撤回、申请平台介入与重新申报。
 *
 * 状态、请求与 toast 都在这里，弹窗（`components/dev/RequirementBreachDialog.vue`）只拿 props 渲染、
 * 只 emit 动作。案件内的判定与文案是纯函数，在 `shared/requirementBreach.ts`；本文件只做编排。
 *
 * 与需求方那一侧（`useRequirementBreach`）是同一条后端案件的两个视角，**状态机完全一样**，
 * 差别只有一处：AI 判定后该谁表态——本页是开发者，看 `developerDecision`（见下面 `breachCanDecide`）。
 */
export function useBreachCase(options: UseBreachCaseOptions) {
  const breachVisible = ref(false)
  const breachRequirement = ref<RequirementItem | null>(null)
  const breachReason = ref('')
  const breachLoading = ref(false)
  const breachCase = ref<AdapayBreachCase | null>(null)
  const breachCaseLoading = ref(false)
  /** 已结束的案件走「新一轮申报」时置真：表单与上一轮说明同屏展示，提交会新建一条案件。 */
  const breachNewRound = ref(false)
  const platformReviewLoading = ref(false)
  const breachWithdrawLoading = ref(false)
  const breachWithdrawConfirm = ref(false)
  const breachDecisionLoading = ref(false)
  /** 不接受判定的原因输入框：纯 UI 态，跟着弹窗走。 */
  const breachRejectPanel = ref(false)
  const breachDecisionNote = ref('')

  /** 上一轮撤回人是不是本人：只有本人撤回才叫「重新申报」，对方撤回时本人是首次申报。 */
  const breachWithdrawnByMe = computed(() =>
    breachWithdrawnBy(breachCase.value, options.username()),
  )

  /** 协商阶段里能表态（同意 / 不同意解除合作）的是「当事人里不是发起人的那一位」。 */
  const breachCanRespond = computed(() =>
    canRespondTermination(breachCase.value, options.username()),
  )

  /** 只有申请人本人能在 AI 判定与客服介入之前撤回自己的申请（后端同样按状态与申请人校验）。 */
  const breachCanWithdraw = computed(() =>
    canWithdrawBreachCase(breachCase.value, options.username()),
  )

  /**
   * AI 判定后该不该出「接受 / 不接受」：**开发者视角**看 `developerDecision`
   * （需求方那一侧看 `customerDecision`，共享层的 `canDecideBreachCase` 按视角参数区分）。
   */
  const breachCanDecide = computed(() => canDecideBreachCase(breachCase.value, 'dev'))

  /**
   * 无生效合同时不能再发起一轮（BUG-038）：结案（`succeeded`）会作废合同、把需求退回大厅，
   * 此时后端按「无生效担保合同」直接拒收，界面上不该留一个点了才报错的按钮。
   * 判据用注入的签约状态（后端已把作废合同排除在 `has_contract` 之外），与列表入口同一口径。
   */
  const breachCanStartNewRound = computed(() => {
    const item = breachRequirement.value
    if (item == null || item.payment_mode === 'self_managed') {
      return false
    }
    return Boolean(options.contractOf(item)?.has_contract)
  })

  async function open(item: RequirementItem) {
    breachRequirement.value = item
    breachReason.value = ''
    breachCase.value = null
    breachNewRound.value = false
    breachVisible.value = true
    breachCaseLoading.value = true
    try {
      breachCase.value = await getAdapayBreachCase(options.token(), item.requirement_id)
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载解除合作案件失败')
    } finally {
      breachCaseLoading.value = false
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
      breachLoading.value ||
      platformReviewLoading.value ||
      breachWithdrawLoading.value ||
      breachDecisionLoading.value ||
      breachCaseLoading.value
    ) {
      return
    }
    breachVisible.value = false
    breachRequirement.value = null
    breachReason.value = ''
    breachCase.value = null
    breachNewRound.value = false
    breachRejectPanel.value = false
    breachDecisionNote.value = ''
    breachWithdrawConfirm.value = false
  }

  async function submitPlatformReview() {
    if (!breachCase.value) {
      return
    }
    platformReviewLoading.value = true
    try {
      breachCase.value = await requestAdapayPlatformReview(options.token(), breachCase.value.id)
      TMessage.success('已申请平台介入，案件转客服人工判定')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '申请平台介入失败')
    } finally {
      platformReviewLoading.value = false
    }
  }

  /** 撤回是不可撤销动作（撤回后要重新申报），故先要求二次确认。 */
  function openBreachWithdrawConfirm() {
    breachWithdrawConfirm.value = true
  }

  function cancelBreachWithdrawConfirm() {
    if (breachWithdrawLoading.value) {
      return
    }
    breachWithdrawConfirm.value = false
  }

  async function submitBreachWithdraw() {
    const current = breachCase.value
    if (!current) {
      return
    }
    breachWithdrawLoading.value = true
    try {
      breachCase.value = await withdrawAdapayBreach(options.token(), current.id)
      breachWithdrawConfirm.value = false
      TMessage.success('解除合作申请已撤回，如仍有争议可重新发起')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '撤回解除合作申请失败')
    } finally {
      breachWithdrawLoading.value = false
    }
  }

  /**
   * 已结束的案件回到申报表单：结案 / 驳回会新建一条案件，撤回则沿用同一案件重新提交；
   * 两种情况都保留上一轮案件，供表单上方的说明引用。
   */
  function reopenBreachReport() {
    breachNewRound.value = true
    breachReason.value = ''
    breachWithdrawConfirm.value = false
  }

  function openBreachRejectPanel() {
    breachDecisionNote.value = ''
    breachRejectPanel.value = true
  }

  function cancelBreachRejectPanel() {
    if (breachDecisionLoading.value) {
      return
    }
    breachRejectPanel.value = false
    breachDecisionNote.value = ''
  }

  async function submitBreachDecision(decision: AdapayBreachDecisionValue) {
    const current = breachCase.value
    if (!current) {
      return
    }
    // 协商阶段的「同意 / 不同意」与 AI 判定后的「接受 / 不接受」是同一组接口，toast 口径要分开。
    const negotiating = isTerminationNegotiating(current)
    breachDecisionLoading.value = true
    try {
      breachCase.value = await submitAdapayBreachDecision(
        options.token(),
        current.id,
        decision,
        breachDecisionNote.value.trim(),
      )
      breachRejectPanel.value = false
      breachDecisionNote.value = ''
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
      breachDecisionLoading.value = false
    }
  }

  async function submitBreachReport() {
    const item = breachRequirement.value
    const reason = breachReason.value.trim()
    if (!item || !reason) {
      TMessage.warning('请填写解除合作的事实和相关依据')
      return
    }
    breachLoading.value = true
    try {
      breachCase.value = await reportAdapayTermination(options.token(), item.requirement_id, reason)
      breachNewRound.value = false
      TMessage.success('解除合作申请已提交，请先与对方协商')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '提交解除合作申请失败')
    } finally {
      breachLoading.value = false
    }
  }

  return {
    breachVisible,
    breachRequirement,
    breachReason,
    breachLoading,
    breachCase,
    breachCaseLoading,
    breachNewRound,
    platformReviewLoading,
    breachWithdrawLoading,
    breachWithdrawConfirm,
    breachDecisionLoading,
    breachRejectPanel,
    breachDecisionNote,
    breachWithdrawnByMe,
    breachCanRespond,
    breachCanWithdraw,
    breachCanDecide,
    breachCanStartNewRound,
    openBreachReport: open,
    closeBreachReport: close,
    submitPlatformReview,
    openBreachWithdrawConfirm,
    cancelBreachWithdrawConfirm,
    submitBreachWithdraw,
    reopenBreachReport,
    openBreachRejectPanel,
    cancelBreachRejectPanel,
    submitBreachDecision,
    submitBreachReport,
  }
}
