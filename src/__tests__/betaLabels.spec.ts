import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BetaTag from '@/components/BetaTag.vue'
import PaymentModeChip from '@/components/PaymentModeChip.vue'
import PublishModal from '@/components/PublishModal.vue'
import ResourceTypeSection from '@/components/dev/ResourceTypeSection.vue'
import type { ResourceCreationType } from '@/shared/resourceCreation'

/**
 * BETA 标签口径（根仓 D-2026-11-05-04）：
 * - 付费资源 / 接口资源开放测试 → 蓝色 BETA（accent）；
 * - 电签担保暂不开放测试 → 灰色 BETA（neutral），发布弹窗里置灰并提示。
 */
describe('BetaTag', () => {
  it('默认（开放测试）用蓝色：accent', () => {
    const wrapper = mount(BetaTag)
    expect(wrapper.text()).toBe('BETA')
    expect(wrapper.classes()).toContain('t73-tag--tone-accent')
    wrapper.unmount()
  })

  it('tone=soon（暂不开放测试）用灰色：neutral', () => {
    const wrapper = mount(BetaTag, { props: { tone: 'soon' } })
    expect(wrapper.text()).toBe('BETA')
    expect(wrapper.classes()).toContain('t73-tag--tone-neutral')
    wrapper.unmount()
  })

  it('size=xs 只收高度，字号仍是标签档（不引 10px）', () => {
    const wrapper = mount(BetaTag, { props: { size: 'xs' } })
    expect(wrapper.classes()).toContain('beta-tag--xs')
    // 字号档来自 TTag 的 sm（11px），BetaTag 自己不再写 font-size。
    expect(wrapper.classes()).toContain('t73-tag--sm')
    wrapper.unmount()
  })
})

describe('资源类型：接口资源打 BETA，普通资源不打', () => {
  function mountSection(creationType: ResourceCreationType) {
    return mount(ResourceTypeSection, {
      props: { creationType },
    })
  }

  it('两个选项里只有「接口资源」带 BETA', () => {
    const wrapper = mountSection('normal')
    const items = wrapper.findAll('.dev-resource-type > .dev-segmented .dev-segmented__item')
    expect(items.map((item) => item.text())).toEqual(['普通资源', '接口资源BETA'])

    const api = items[1]!
    expect(api.findAll('.beta-tag')).toHaveLength(1)
    expect(api.find('.beta-tag').classes()).toContain('t73-tag--tone-accent')
    expect(items[0]!.findAll('.beta-tag')).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('PaymentModeChip：担保胶囊里追加灰色 BETA', () => {
  it('电签担保有 BETA', () => {
    const wrapper = mount(PaymentModeChip, { props: { mode: 'platform_guarantee' } })
    expect(wrapper.text()).toContain('电签担保')
    const beta = wrapper.find('.beta-tag')
    expect(beta.exists()).toBe(true)
    expect(beta.classes()).toContain('t73-tag--tone-neutral')
    wrapper.unmount()
  })

  it('无电签约定没有 BETA', () => {
    const wrapper = mount(PaymentModeChip, { props: { mode: 'self_managed' } })
    expect(wrapper.find('.beta-tag').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('PublishModal：电签担保入口', () => {
  function mountModal(props: Record<string, unknown> = {}) {
    return mount(PublishModal, {
      props: {
        visible: true,
        publishTitle: '需求',
        publishDescription: '描述',
        publishBudget: 100,
        publishAcceptance: '验收',
        allowPlatformGuarantee: true,
        ...props,
      },
      global: { stubs: { teleport: true, RichTextEditor: true } },
    })
  }

  function guaranteeOption(wrapper: ReturnType<typeof mountModal>) {
    const option = wrapper
      .findAll('.publish-mode-option')
      .find((button) => button.text().includes('电签担保'))
    if (!option) {
      throw new Error('没有渲染电签担保入口')
    }
    return option
  }

  it('默认（未开放测试）：入口仍渲染、置灰 aria-disabled，点击只提示不改模式', async () => {
    const wrapper = mountModal()
    const option = guaranteeOption(wrapper)

    expect(option.text()).toContain('BETA')
    expect(option.attributes('aria-disabled')).toBe('true')
    expect(option.classes()).toContain('is-unavailable')

    await option.trigger('click')
    expect(wrapper.emitted('notify')).toEqual([['电签担保暂未开放测试']])
    expect(wrapper.emitted('update:publishPaymentMode')).toBeUndefined()
    wrapper.unmount()
  })

  it('担保已开放测试但后端不可用：提示「当前不可用」', async () => {
    const wrapper = mountModal({ allowPlatformGuarantee: false, platformGuaranteeBetaOpen: true })
    await guaranteeOption(wrapper).trigger('click')
    expect(wrapper.emitted('notify')).toEqual([['电签担保当前不可用']])
    wrapper.unmount()
  })

  it('未开放测试且可用性尚未落地：仍提示「暂未开放测试」，不误报后端不可用', async () => {
    const wrapper = mountModal({ allowPlatformGuarantee: false })
    await guaranteeOption(wrapper).trigger('click')
    expect(wrapper.emitted('notify')).toEqual([['电签担保暂未开放测试']])
    wrapper.unmount()
  })

  it('platformGuaranteeBetaOpen=true 时可选', async () => {
    const wrapper = mountModal({ platformGuaranteeBetaOpen: true })
    const option = guaranteeOption(wrapper)

    expect(option.attributes('aria-disabled')).toBeUndefined()
    expect(option.classes()).not.toContain('is-unavailable')

    await option.trigger('click')
    expect(wrapper.emitted('update:publishPaymentMode')).toEqual([['platform_guarantee']])
    expect(wrapper.emitted('notify')).toBeUndefined()
    wrapper.unmount()
  })

  it('新发布回填出 platform_guarantee 时降级为 self_managed', async () => {
    const wrapper = mountModal({ publishPaymentMode: 'platform_guarantee' })
    await Promise.resolve()
    expect(wrapper.emitted('update:publishPaymentMode')).toEqual([['self_managed']])
    wrapper.unmount()
  })

  it('编辑存量担保需求（allowExistingGuarantee）：保留可选，不降级', async () => {
    const wrapper = mountModal({
      publishPaymentMode: 'platform_guarantee',
      allowExistingGuarantee: true,
    })
    await Promise.resolve()
    expect(wrapper.emitted('update:publishPaymentMode')).toBeUndefined()
    expect(guaranteeOption(wrapper).attributes('aria-disabled')).toBeUndefined()
    wrapper.unmount()
  })
})
