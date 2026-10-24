import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import {
  reportAdapayTermination,
  requestAdapayPlatformReview,
  submitAdapayBreachDecision,
  withdrawAdapayBreach,
  type AdapayBreachCase,
  type AdapayBreachDecisionValue,
} from '@/api/adapay'

type BreachActionSources = {
  token: string
  requirementId: string
  /** 当前在办的案件：撤回 / 表态 / 申请介入都作用在它上面。 */
  activeCase: AdapayBreachCase | null
  /** 提交拿到的新案件交回给持有它的组件。 */
  onCaseChanged: (value: AdapayBreachCase) => void
  /** 与原来的 `changed` 一致：让外层刷新整条工具条。 */
  onChanged: () => void
  /** 申报成功后关窗。 */
  onClosed: () => void
}

/** 解除合作案件的三个可裁决动作与申报表单的动作。 */
export function useConversationBreachActions(readSources: () => BreachActionSources) {
  const router = useRouter()

  const breachReason = ref('')
  const breachDecisionNote = ref('')
  const breachRejectPanel = ref(false)
  const breachSubmitting = ref(false)
  const breachActing = ref(false)

  /** 去账号中心补收款银行卡（结算账户）：中间态的续做靠它，绑完平台自动按原认定赔付。 */
  function goBindSettlementAccount(): void {
    readSources().onClosed()
    void router.push({ name: 'workbench-account', query: { settle: '1' } })
  }

  function resetForm() {
    breachReason.value = ''
    breachDecisionNote.value = ''
    breachRejectPanel.value = false
  }

  async function submitBreachReport() {
    const { token, requirementId, onCaseChanged, onChanged, onClosed } = readSources()
    const reason = breachReason.value.trim()
    if (!reason) {
      TMessage.warning('请填写解除合作的事实与依据')
      return
    }

    breachSubmitting.value = true
    try {
      onCaseChanged(await reportAdapayTermination(token, requirementId, reason))
      TMessage.success('解除合作申请已提交，等待对方回应')
      onClosed()
      onChanged()
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '提交解除合作申请失败')
    } finally {
      breachSubmitting.value = false
    }
  }

  async function submitBreachDecision(decision: AdapayBreachDecisionValue) {
    const current = readSources().activeCase
    if (!current) {
      return
    }

    breachActing.value = true
    try {
      readSources().onCaseChanged(
        await submitAdapayBreachDecision(
          readSources().token,
          current.id,
          decision,
          breachDecisionNote.value.trim(),
        ),
      )
      breachRejectPanel.value = false
      breachDecisionNote.value = ''
      TMessage.success(
        decision === 'accepted' ? '已接受 AI 判定' : '已提交不接受，案件转客服人工判定',
      )
      readSources().onChanged()
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '提交解除合作案件表态失败')
    } finally {
      breachActing.value = false
    }
  }

  async function submitPlatformReview() {
    const current = readSources().activeCase
    if (!current) {
      return
    }

    breachActing.value = true
    try {
      readSources().onCaseChanged(
        await requestAdapayPlatformReview(readSources().token, current.id),
      )
      TMessage.success('已申请平台介入，等待平台判定')
      readSources().onChanged()
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '申请平台介入失败')
    } finally {
      breachActing.value = false
    }
  }

  async function submitBreachWithdraw() {
    const current = readSources().activeCase
    if (!current) {
      return
    }

    breachActing.value = true
    try {
      readSources().onCaseChanged(await withdrawAdapayBreach(readSources().token, current.id))
      TMessage.success('已撤回解除合作申请，如仍有争议可重新发起')
      readSources().onChanged()
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '撤回解除合作申请失败')
    } finally {
      breachActing.value = false
    }
  }

  return {
    breachReason,
    breachDecisionNote,
    breachRejectPanel,
    breachSubmitting,
    breachActing,
    goBindSettlementAccount,
    resetForm,
    submitBreachReport,
    submitBreachDecision,
    submitPlatformReview,
    submitBreachWithdraw,
  }
}
