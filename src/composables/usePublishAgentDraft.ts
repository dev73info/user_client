import { ref } from 'vue'

import type { RequirementDraftFormValues } from '@/shared/requirementDraft'

type NotifyType = 'success' | 'warning' | 'error'
type DraftFieldKey = 'publishTitle' | 'publishDescription' | 'publishBudget' | 'publishAcceptance'

export type PublishAgentDraftOptions = {
  /** 单字段回填（组件那一侧就是 `emit('update:<key>', value)`）。 */
  applyField: (key: DraftFieldKey, value: string) => void
  /** 回填发布方式（仍走「电签担保不可选就不切」那条门禁）。 */
  applyPaymentMode: (mode: 'platform_guarantee' | 'self_managed') => void
  notify: (message: string, type?: NotifyType) => void
}

/**
 * 发布弹窗里的「跟 AI 聊着填」（R047 从 `components/PublishModal.vue` 拆出）。
 *
 * 在弹窗内以二级层承载对话面板，聊出的草稿回填到表单字段，最终仍由用户点原来的「确认发布」
 * 创建需求（**本组件不直接建需求**）。回填**只覆盖草稿里有内容的字段**，避免把用户手填的内容抹成空。
 */
export function usePublishAgentDraft(options: PublishAgentDraftOptions) {
  /** 二级层开关：`true` 时表单项整体让位给对话面板。 */
  const agentMode = ref(false)

  function toggleAgentPanel() {
    agentMode.value = !agentMode.value
  }

  function applyAgentDraft(values: RequirementDraftFormValues) {
    const title = values.title.trim()
    if (title) {
      options.applyField('publishTitle', title)
    }
    if (values.description.trim()) {
      options.applyField('publishDescription', values.description)
    }
    if (values.budget.trim()) {
      options.applyField('publishBudget', values.budget)
    }
    if (values.acceptance.trim()) {
      options.applyField('publishAcceptance', values.acceptance)
    }
    options.applyPaymentMode(values.paymentMode)

    agentMode.value = false
    options.notify('已把整理好的需求填入表单，确认无误后点「确认发布」', 'success')
  }

  return { agentMode, toggleAgentPanel, applyAgentDraft }
}
