import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import type { AdapayAcceptanceResult } from '@/api/adapay'
import { createRequirementContract, fetchAsignRequirementPreviewUrl } from '@/api/contracts'
import { requestRequirementFinalPayCure, requestRequirementFinalPayment } from '@/api/requirements'
import type { ActionRequirement } from '@/composables/useConversationActionState'

type ActionCommandSources = {
  token: string
  requirement: ActionRequirement | null
  /** request-final 拿回新状态时直接推进本地需求单，避免依赖列表刷新的时序。 */
  setRequirement: (value: ActionRequirement) => void
  isDeveloper: boolean
  myPartySigned: boolean
  hasBoundResource: boolean
  canPayFinal: boolean
  openPayDialog: () => void
  loadActions: () => Promise<void>
  /** 与原来的 `emit('changed')` 一致：让会话容器刷新。 */
  onChanged: () => void
}

/**
 * 工具条上的命令：发起 / 查看合同、确认完成、催告付款、交付、验收、结单后解除合作。
 *
 * 从 `RequirementConversationActions.vue` 抽出。每个动作的成功收尾都照旧：刷新工具条 +
 * `changed`；支付相关的那几步还顺手打开支付弹窗，用户不必再回列表找入口。
 */
export function useConversationActionCommands(readSources: () => ActionCommandSources) {
  const router = useRouter()
  const actingKey = ref('')
  const deliveryVisible = ref(false)
  const acceptanceVisible = ref(false)
  /** 结单后的解除合作：入口只在担保模式且需求已完成时出现，弹窗自己负责案件列表、诉求与表态。 */
  const afterSalesVisible = ref(false)

  async function createContract() {
    const item = readSources().requirement
    if (!item) {
      return
    }

    actingKey.value = 'create-contract'
    try {
      await createRequirementContract(readSources().token, item.requirement_id)
      // R012：合同页多了「自定义合同附件」。不提示这句，双方会直接签平台模板，事后要改就得作废重签。
      TMessage.success('合同已发起；如需补充条款，可在合同页准备自定义附件，平台放行后即可签署')
      await readSources().loadActions()
      readSources().onChanged()
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '发起合同失败')
    } finally {
      actingKey.value = ''
    }
  }

  async function openContract() {
    const item = readSources().requirement
    if (!item) {
      return
    }

    const signRoute = {
      name: 'contract-sign',
      query: {
        requirement_id: item.requirement_id,
        from: readSources().isDeveloper ? 'dev' : 'user',
      },
    }

    if (!readSources().myPartySigned) {
      await router.push(signRoute)
      return
    }

    // 已签署时优先进爱签预览页，爱签不可用再回退本地合同页（与需求列表页一致）。
    try {
      const previewUrl = await fetchAsignRequirementPreviewUrl(
        readSources().token,
        item.requirement_id,
      )
      if (previewUrl) {
        window.location.href = previewUrl
        return
      }
    } catch {
      // 忽略，回退本地合同页
    }
    await router.push(signRoute)
  }

  function openAcceptanceDialog() {
    if (!readSources().requirement) {
      return
    }

    acceptanceVisible.value = true
  }

  function closeAcceptanceDialog() {
    acceptanceVisible.value = false
  }

  /**
   * 验收提交成功后的收尾：刷新动作栏，让按钮组跟着新状态走。
   *
   * 验收通过会把需求推到「待付尾款」，此时该出现的是「支付尾款」；与「我的需求」页一致，
   * 顺手把支付弹窗打开，用户不必再回列表找入口。
   */
  async function handleAcceptanceSubmitted(result: AdapayAcceptanceResult) {
    await readSources().loadActions()
    readSources().onChanged()
    if (result === 'passed' && readSources().canPayFinal) {
      readSources().openPayDialog()
    }
  }

  async function requestFinalPayment() {
    const item = readSources().requirement
    if (!item) {
      return
    }

    actingKey.value = 'request-final'
    try {
      const updated = await requestRequirementFinalPayment(readSources().token, item.requirement_id)
      // 先用返回值推进本地状态，避免依赖列表刷新的时序再去判断支付阶段。
      readSources().setRequirement({ ...item, status: updated.status })
      if (item.payment_mode === 'self_managed') {
        TMessage.success('需求已确认完成')
      } else {
        TMessage.success('请支付尾款')
        readSources().openPayDialog()
      }
      readSources().onChanged()
      void readSources().loadActions()
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '结束开发失败')
    } finally {
      actingKey.value = ''
    }
  }

  async function cureFinalPayment() {
    const item = readSources().requirement
    if (!item) {
      return
    }
    actingKey.value = 'final-pay-cure'
    try {
      await requestRequirementFinalPayCure(readSources().token, item.requirement_id)
      TMessage.success('已催告客户支付尾款')
      readSources().onChanged()
      void readSources().loadActions()
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '催告付款失败')
    } finally {
      actingKey.value = ''
    }
  }

  function openDeliveryDialog() {
    if (!readSources().hasBoundResource) {
      TMessage.warning('当前需求还没有关联资源项目')
      return
    }

    deliveryVisible.value = true
  }

  /** 交付版本提交成功后刷新会话动作：需求的交付版本与可用入口会一起变化。 */
  async function handleDeliverySubmitted() {
    await readSources().loadActions()
    readSources().onChanged()
  }

  /** 结单后的解除合作：入口只在担保模式且需求已完成时出现，弹窗自己负责案件列表、诉求与表态。 */
  function openAfterSalesDialog() {
    afterSalesVisible.value = true
  }

  return {
    actingKey,
    deliveryVisible,
    acceptanceVisible,
    afterSalesVisible,
    createContract,
    openContract,
    openAcceptanceDialog,
    closeAcceptanceDialog,
    handleAcceptanceSubmitted,
    requestFinalPayment,
    cureFinalPayment,
    openDeliveryDialog,
    handleDeliverySubmitted,
    openAfterSalesDialog,
  }
}
