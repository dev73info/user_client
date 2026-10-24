import { ref } from 'vue'
import { TMessage } from 'ui_73info'

import {
  reportTermination,
  respondAfterSalesCase,
  withdrawAfterSalesCase,
  type AfterSalesRespondAction,
} from '@/api/afterSales'

type BreachActionSources = {
  token: string
  requirementId: string
  /** 在办案件的案号：表态与撤回都作用在它上面（契约路径参数是 `case_no`，不是数字 id）。 */
  caseNo: string | null
  /** 提交成功后请外层重取案件（判据是后端算的，前端不留旧态）。 */
  onRefreshed: () => void
  /** 与原来的 `changed` 一致：让外层刷新整条工具条。 */
  onChanged: () => void
  /** 申报成功后关窗。 */
  onClosed: () => void
}

/**
 * 会话工具条里解除合作案件的动作：申报、表态（同意 / 不同意）、撤回。
 *
 * 契约里只有这三个：`/api/requirement/{id}/termination` 与
 * `/api/dispute/cases/{case_no}/respond|withdraw`。「申请平台介入」是客服在管理端的动作，
 * 这里没有对应端点，也就不再包一层假动作。
 */
export function useConversationBreachActions(readSources: () => BreachActionSources) {
  const breachReason = ref('')
  const breachDecisionNote = ref('')
  const breachSubmitting = ref(false)
  const breachActing = ref(false)

  function resetForm() {
    breachReason.value = ''
    breachDecisionNote.value = ''
  }

  async function submitBreachReport() {
    const { token, requirementId, onRefreshed, onChanged, onClosed } = readSources()
    const reason = breachReason.value.trim()
    if (!reason) {
      TMessage.warning('请填写解除合作的事实与依据')
      return
    }
    if (reason.length < 5) {
      TMessage.warning('事实与依据至少 5 个字')
      return
    }

    breachSubmitting.value = true
    try {
      const result = await reportTermination(token, requirementId, reason)
      TMessage.success(
        result.existing
          ? '该需求已有在办案件，已为你打开那一条'
          : '解除合作申请已提交，等待对方表态',
      )
      onClosed()
      onRefreshed()
      onChanged()
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '提交解除合作申请失败')
    } finally {
      breachSubmitting.value = false
    }
  }

  async function submitBreachDecision(action: AfterSalesRespondAction) {
    const { token, caseNo, onRefreshed, onChanged } = readSources()
    if (!caseNo) {
      return
    }

    breachActing.value = true
    try {
      const note = breachDecisionNote.value.trim()
      if (note) {
        await respondAfterSalesCase(token, caseNo, action, note)
      } else {
        await respondAfterSalesCase(token, caseNo, action)
      }
      breachDecisionNote.value = ''
      TMessage.success(
        action === 'approve'
          ? '已同意解除合作，等待平台按协商一致处理'
          : '已表示不同意，案件转平台裁决',
      )
      onRefreshed()
      onChanged()
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '提交解除合作案件表态失败')
    } finally {
      breachActing.value = false
    }
  }

  async function submitBreachWithdraw() {
    const { token, caseNo, onRefreshed, onChanged } = readSources()
    if (!caseNo) {
      return
    }

    breachActing.value = true
    try {
      await withdrawAfterSalesCase(token, caseNo, '当事人撤回申请')
      TMessage.success('已撤回解除合作申请，如仍有争议可重新发起')
      onRefreshed()
      onChanged()
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '撤回解除合作申请失败')
    } finally {
      breachActing.value = false
    }
  }

  return {
    breachReason,
    breachDecisionNote,
    breachSubmitting,
    breachActing,
    resetForm,
    submitBreachReport,
    submitBreachDecision,
    submitBreachWithdraw,
  }
}
