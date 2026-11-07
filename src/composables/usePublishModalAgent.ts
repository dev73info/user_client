import { ref, watch } from 'vue'

import {
  requirementDraftFieldLabel,
  type RequirementAssistantFormValues,
} from '@/shared/requirementAssistant'

type AgentFormEmit = {
  (event: 'update:publishTitle', value: string): void
  (event: 'update:publishDescription', value: string): void
  (event: 'update:publishBudget', value: string | number): void
  (event: 'update:publishAcceptance', value: string): void
  (event: 'update:publishDevelopmentCycleDays', value: string | number): void
}

export type PublishModalAgentOptions = {
  visible: () => boolean
  /** 当前表单能否选中「电签担保」；不能时不把 AI 的担保草稿写进表单。 */
  platformGuaranteeSelectable: () => boolean
  updatePaymentMode: (value: 'platform_guarantee' | 'self_managed') => void
  emit: AgentFormEmit
}

/**
 * 发布弹窗里的「AI 需求分析」状态（R047 拆出，保持 `PublishModal` 在结构预算内）。
 *
 * 三块状态：
 * - `agentMode`：面板是否展开（PC 分栏 / 移动整屏）；
 * - `agentMounted`：面板是否挂载过（挂载后保留会话，收起再展开不丢对话）；
 * - `mobileFormOpen`：移动端表单抽屉是否打开（PC 不用）。
 *
 * `applyAgentDraft` 把 AI 草稿写回表单：只覆盖草稿里有内容的字段，空值不抹掉用户手填内容；
 * 担保方式要过 `platformGuaranteeSelectable` 门禁（BETA 未开放时保持原值）。
 */
export function usePublishModalAgent(options: PublishModalAgentOptions) {
  const agentMode = ref(false)
  const agentMounted = ref(false)
  const mobileFormOpen = ref(false)
  /** 最近一次真的写进表单的字段（中文名），用于「已自动填入：…」提示。 */
  const appliedLabels = ref<string[]>([])

  function openAgentPanel() {
    agentMounted.value = true
    agentMode.value = true
  }

  function closeAgentPanel() {
    agentMode.value = false
    mobileFormOpen.value = false
  }

  function toggleAgentPanel() {
    if (agentMode.value) {
      closeAgentPanel()
      return
    }
    openAgentPanel()
  }

  function openMobileForm() {
    mobileFormOpen.value = true
  }

  function closeMobileForm() {
    mobileFormOpen.value = false
  }

  function applyAgentDraft(values: RequirementAssistantFormValues) {
    const applied: string[] = []

    if (values.title) {
      options.emit('update:publishTitle', values.title)
      applied.push(requirementDraftFieldLabel('title'))
    }
    if (values.description) {
      options.emit('update:publishDescription', values.description)
      applied.push(requirementDraftFieldLabel('description'))
    }
    if (values.budget) {
      options.emit('update:publishBudget', values.budget)
      applied.push(requirementDraftFieldLabel('budget'))
    }
    if (values.acceptance) {
      options.emit('update:publishAcceptance', values.acceptance)
      applied.push(requirementDraftFieldLabel('acceptance'))
    }
    if (values.developmentCycleDays) {
      options.emit('update:publishDevelopmentCycleDays', values.developmentCycleDays)
      applied.push(requirementDraftFieldLabel('development_cycle_days'))
    }

    if (values.paymentMode === 'self_managed') {
      options.updatePaymentMode('self_managed')
      applied.push(requirementDraftFieldLabel('payment_mode'))
    } else if (options.platformGuaranteeSelectable()) {
      options.updatePaymentMode('platform_guarantee')
      applied.push(requirementDraftFieldLabel('payment_mode'))
    }

    appliedLabels.value = applied.filter((label) => label.length > 0)
  }

  // 弹窗关闭时回到表单视图，下次打开不残留对话层
  watch(options.visible, (visible) => {
    if (!visible) {
      agentMode.value = false
      agentMounted.value = false
      mobileFormOpen.value = false
    }
  })

  return {
    agentMode,
    agentMounted,
    mobileFormOpen,
    appliedLabels,
    closeAgentPanel,
    toggleAgentPanel,
    openMobileForm,
    closeMobileForm,
    applyAgentDraft,
  }
}
