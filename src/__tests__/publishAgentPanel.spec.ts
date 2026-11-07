import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'

import PublishModal from '@/components/PublishModal.vue'

/**
 * 发布需求弹窗的「AI 需求分析」接线。
 *
 * 钉三件事：
 * 1. 入口在「需求描述」标签右侧，点开才挂面板（收起后保留会话）；
 * 2. 面板回抛的草稿写回五个字段（空值不覆盖已填内容）；
 * 3. 担保方式受发布表单门禁约束：BETA 未开放时不把草稿里的电签担保写进表单。
 */

vi.mock('@/shared/adapayAvailability', () => ({
  platformGuaranteeReady: computed(() => true),
  platformGuaranteeLoaded: computed(() => true),
  loadAdapayAvailability: vi.fn(async () => {}),
}))

const RichTextEditorStub = {
  name: 'RichTextEditor',
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:model-value', 'notify'],
  template: '<textarea class="rich-stub" :value="modelValue" />',
}

const AgentPanelStub = {
  name: 'RequirementAgentPanel',
  emits: ['close', 'view-form', 'draft-update', 'notify'],
  template: '<div class="agent-stub" />',
}

function renderModal() {
  return mount(PublishModal, {
    props: { visible: true },
    global: {
      stubs: {
        teleport: true,
        RichTextEditor: RichTextEditorStub,
        RequirementAgentPanel: AgentPanelStub,
      },
    },
  })
}

describe('发布需求弹窗的 AI 需求分析', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('入口在需求描述标签右侧，点开后显示面板并可收起', async () => {
    const wrapper = renderModal()

    const trigger = wrapper.find('.publish-rich-field__head .publish-agent-trigger')
    expect(trigger.exists()).toBe(true)
    expect(trigger.text()).toContain('AI 需求分析')
    expect(wrapper.find('.agent-stub').exists()).toBe(false)

    await trigger.trigger('click')
    expect(wrapper.find('.agent-stub').exists()).toBe(true)
    expect(wrapper.find('.publish-modal').classes()).toContain('publish-modal--agent')

    await wrapper.findComponent(AgentPanelStub).vm.$emit('close')
    expect(wrapper.find('.publish-modal').classes()).not.toContain('publish-modal--agent')
    // 收起后仍保留挂载（会话不丢），只是隐藏
    expect(wrapper.find('.agent-stub').exists()).toBe(true)
  })

  it('AI 草稿自动写回表单，空字段不覆盖已有内容', async () => {
    const wrapper = renderModal()
    await wrapper.find('.publish-rich-field__head .publish-agent-trigger').trigger('click')

    const panel = wrapper.findComponent(AgentPanelStub)
    panel.vm.$emit('draft-update', {
      title: '企业官网改版',
      description: '<p>重做首页与产品页</p>',
      budget: '3000',
      acceptance: '',
      paymentMode: 'self_managed',
      developmentCycleDays: '30',
    })

    const emitted = wrapper.emitted()
    const last = (event: string): unknown => {
      const calls = emitted[event]
      return calls == null ? undefined : calls[calls.length - 1]
    }

    expect(last('update:publishTitle')).toEqual(['企业官网改版'])
    expect(last('update:publishDescription')).toEqual(['<p>重做首页与产品页</p>'])
    expect(last('update:publishBudget')).toEqual(['3000'])
    expect(last('update:publishAcceptance')).toBeUndefined()
    expect(last('update:publishPaymentMode')).toEqual(['self_managed'])
    expect(last('update:publishDevelopmentCycleDays')).toEqual(['30'])
  })

  it('电签担保未开放时不把草稿里的担保方式写进表单', async () => {
    const wrapper = renderModal()
    await wrapper.find('.publish-rich-field__head .publish-agent-trigger').trigger('click')

    wrapper.findComponent(AgentPanelStub).vm.$emit('draft-update', {
      title: '带担保的需求',
      description: '',
      budget: '',
      acceptance: '',
      paymentMode: 'platform_guarantee',
      developmentCycleDays: '',
    })

    const emitted = wrapper.emitted()
    expect(emitted['update:publishPaymentMode']).toBeUndefined()
  })

  it('移动端点「查看需求」打开表单抽屉，弹窗关闭后回到表单视图', async () => {
    const wrapper = renderModal()
    await wrapper.find('.publish-rich-field__head .publish-agent-trigger').trigger('click')

    await wrapper.findComponent(AgentPanelStub).vm.$emit('view-form')
    expect(wrapper.find('.publish-modal__workspace').classes()).toContain('is-form-open')

    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })

    expect(wrapper.find('.publish-modal').classes()).not.toContain('publish-modal--agent')
    expect(wrapper.find('.publish-modal__workspace').classes()).not.toContain('is-form-open')
    expect(wrapper.find('.agent-stub').exists()).toBe(false)
  })
})
