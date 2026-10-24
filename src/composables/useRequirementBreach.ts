import { computed, ref } from 'vue'

import {
  getAfterSalesCase,
  getRequirementBreachCase,
  reportTermination,
  respondAfterSalesCase,
  withdrawAfterSalesCase,
  type AfterSalesCaseDetail,
  type AfterSalesRespondAction,
  type RequirementBreachCaseItem,
} from '@/api/afterSales'
import type { ContractSigningStatus } from '@/api/contracts'
import type { RequirementItem } from '@/api/requirements'
import {
  breachWithdrawnByMe as breachWithdrawnBy,
  canRespondBreachCase,
  canWithdrawBreachCase,
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
  /** 当前登录用户名：只喂给「是不是发起人 / 是不是对方」那组判定。 */
  username: () => string
  /**
   * 取某条需求的合同签署状态。
   *
   * 这份事实只有列表一次取回的那张按条 map 持有（视图用 `rowFacts` 取出来）。
   * 在这里**重新判断**「有没有合同」会立刻产生第二套口径——签约状态必须注入，
   * 与需求卡片上的 `canReportBreach` 保持同一份数据。
   */
  contractOf: (item: RequirementItem) => ContractSigningStatus | null
}

/**
 * 「解除合作」这一域的**唯一**状态机：案件读取、申报（发起解除合作）、表态（同意 / 不同意）、
 * 撤回与重新申报。需求方、开发者、会话工具条三处入口共用它，不再各留一套。
 *
 * 三个端点各司其职（字段全部照契约，见 `@/api/afterSales`）：
 * - 读案件：`GET /api/requirement/{id}/breach-case`（`has_case = false` 是正常空态）；
 * - 申报：`POST /api/requirement/{id}/termination`（固定「协商解除」，只带一段事实与依据）；
 * - 表态 / 撤回：`POST /api/dispute/cases/{case_no}/respond|withdraw`（**路径参数是案号**）。
 *
 * 契约里没有「申请平台介入」这个动作，也没有「AI 判定后接受 / 不接受」这一段：
 * 案件转平台由客服在管理端开闸，前端不再伪造入口。
 */
export function useRequirementBreach(options: UseRequirementBreachOptions) {
  const visible = ref(false)
  const requirement = ref<RequirementItem | null>(null)
  const reason = ref('')
  const loading = ref(false)
  const breachCase = ref<RequirementBreachCaseItem | null>(null)
  /** 案件详情（诉求说明、表态流水、裁决）：读到案件后再取一次。 */
  const breachCaseDetail = ref<AfterSalesCaseDetail | null>(null)
  const caseLoading = ref(false)
  /** 已收口的案件走「新一轮申报」时置真：表单与上一轮说明同屏展示，提交会新建一条案件。 */
  const newRound = ref(false)
  const withdrawLoading = ref(false)
  const withdrawConfirm = ref(false)
  const decisionLoading = ref(false)
  /** 表态说明（同意 / 不同意的理由）：双方与客服都会看到，可为空。 */
  const decisionNote = ref('')

  const withdrawnByMe = computed(() => breachWithdrawnBy(breachCase.value, options.username()))
  const canRespond = computed(() => canRespondBreachCase(breachCase.value, options.username()))
  const canWithdraw = computed(() => canWithdrawBreachCase(breachCase.value, options.username()))

  /**
   * 无生效合同时不能再发起一轮（BUG-038）：结案会作废合同、把需求退回大厅，
   * 此时后端按「无生效担保合同」直接拒收，界面上不该留一个点了才报错的按钮。
   * 判据用注入的签约状态（后端已把作废合同排除在 `has_contract` 之外），与列表入口同一口径。
   */
  const canStartNewRound = computed(() => {
    const item = requirement.value
    return (
      item != null &&
      !isSelfManagedRequirement(item) &&
      isRequirementContractSigned({ contract: options.contractOf(item) })
    )
  })

  /** 读一次案件 + 详情；调用方负责把错误变成 toast。 */
  async function loadCase(requirementId: string) {
    const response = await getRequirementBreachCase(options.token(), requirementId)
    // 契约里 `case` 是可选字段（`has_case = false` 时为空）：折成 null，状态里不留 undefined
    breachCase.value = response.has_case ? (response.case ?? null) : null
    breachCaseDetail.value = null
    const caseNo = breachCase.value?.case_no
    if (!caseNo) {
      return
    }
    breachCaseDetail.value = await getAfterSalesCase(options.token(), caseNo)
  }

  async function refreshCase() {
    const item = requirement.value
    if (!item) {
      return
    }
    caseLoading.value = true
    try {
      await loadCase(item.requirement_id)
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载解除合作案件失败')
    } finally {
      caseLoading.value = false
    }
  }

  async function open(item: RequirementItem) {
    if (!canReportBreach(item, { contract: options.contractOf(item) })) {
      return
    }
    requirement.value = item
    reason.value = ''
    breachCase.value = null
    breachCaseDetail.value = null
    newRound.value = false
    visible.value = true
    caseLoading.value = true
    try {
      await loadCase(item.requirement_id)
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载解除合作案件失败')
    } finally {
      caseLoading.value = false
    }
  }

  /**
   * 关闭：任何一个请求在跑都不关。
   *
   * 这四个 loading 是一个整体——漏掉其中一个，「处理中点遮罩关闭」就会把请求的中断留在界面上
   * （案件已经变了、界面还停在旧状态）。挪动这段代码时先数一遍这几个。
   */
  function close() {
    if (loading.value || withdrawLoading.value || decisionLoading.value || caseLoading.value) {
      return
    }
    visible.value = false
    requirement.value = null
    reason.value = ''
    breachCase.value = null
    breachCaseDetail.value = null
    newRound.value = false
    decisionNote.value = ''
    withdrawConfirm.value = false
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
      await withdrawAfterSalesCase(options.token(), current.case_no, '当事人撤回申请')
      withdrawConfirm.value = false
      TMessage.success('解除合作申请已撤回，如仍有争议可重新发起')
      await refreshCase()
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '撤回解除合作申请失败')
    } finally {
      withdrawLoading.value = false
    }
  }

  /**
   * 已收口的案件回到申请表单：结案 / 驳回会新建一条案件，撤回则沿用同一案件重新提交；
   * 两种情况都保留上一轮案件，供表单上方的说明引用。
   */
  function reopen() {
    newRound.value = true
    reason.value = ''
    withdrawConfirm.value = false
  }

  /** 表态：`approve` 同意解除，`reject` 不同意（案件转平台裁决）。 */
  async function submitDecision(action: AfterSalesRespondAction) {
    const current = breachCase.value
    if (!current) {
      return
    }
    decisionLoading.value = true
    try {
      const note = decisionNote.value.trim()
      if (note) {
        await respondAfterSalesCase(options.token(), current.case_no, action, note)
      } else {
        await respondAfterSalesCase(options.token(), current.case_no, action)
      }
      decisionNote.value = ''
      TMessage.success(
        action === 'approve'
          ? '已同意解除合作，等待平台按协商一致处理'
          : '已表示不同意，案件转平台裁决',
      )
      await refreshCase()
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '提交解除合作案件表态失败')
    } finally {
      decisionLoading.value = false
    }
  }

  /**
   * 发起解除合作：`reason` 是事实与依据，后端要求 5～2000 字（先在前端拦一道，
   * 免得把一段空话发出去换回 400）。
   */
  async function submitReport() {
    const item = requirement.value
    const text = reason.value.trim()
    if (!item || !text) {
      TMessage.warning('请填写解除合作的事实和相关依据')
      return
    }
    if (text.length < 5) {
      TMessage.warning('事实与依据至少 5 个字')
      return
    }
    loading.value = true
    try {
      const result = await reportTermination(options.token(), item.requirement_id, text)
      newRound.value = false
      TMessage.success(
        result.existing
          ? '该需求已有在办案件，已为你打开那一条'
          : '解除合作申请已提交，等待对方表态',
      )
      await refreshCase()
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
    breachCaseDetail,
    breachCaseLoading: caseLoading,
    breachNewRound: newRound,
    breachWithdrawLoading: withdrawLoading,
    breachWithdrawConfirm: withdrawConfirm,
    breachDecisionLoading: decisionLoading,
    breachDecisionNote: decisionNote,
    breachWithdrawnByMe: withdrawnByMe,
    breachCanRespond: canRespond,
    breachCanWithdraw: canWithdraw,
    breachCanStartNewRound: canStartNewRound,
    openBreachReport: open,
    closeBreachReport: close,
    refreshBreachCase: refreshCase,
    openBreachWithdrawConfirm: openWithdrawConfirm,
    cancelBreachWithdrawConfirm: cancelWithdrawConfirm,
    submitBreachWithdraw: submitWithdraw,
    reopenBreachReport: reopen,
    submitBreachDecision: submitDecision,
    submitBreachReport: submitReport,
  }
}
