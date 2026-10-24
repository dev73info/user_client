import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import PortalQuickPanels from '@/components/home/PortalQuickPanels.vue'
import PortalWorkflowSection from '@/components/home/PortalWorkflowSection.vue'
import { HOME_QUICK_PANELS, HOME_WORKFLOW_STEPS } from '@/shared/home/portalSections'

describe('首页快捷入口', () => {
  it('固定展示免费资源与需求大厅两张卡，各自带图标', () => {
    const wrapper = mount(PortalQuickPanels, { props: { panels: HOME_QUICK_PANELS } })
    const cards = wrapper.findAll('.portal-quick-card')

    expect(cards).toHaveLength(2)
    expect(cards.map((card) => card.find('h3').text())).toEqual(['免费资源', '需求大厅'])
    expect(cards.map((card) => card.findAll('.portal-quick-card__svg'))).toSatisfy(
      (icons: Array<unknown[]>) => icons.every((items) => items.length === 1),
    )
    expect(wrapper.find('.portal-quick-card--requirement').exists()).toBe(true)
  })

  it('点击需求大厅卡回抛对应入口，由父级负责跳转', async () => {
    const wrapper = mount(PortalQuickPanels, { props: { panels: HOME_QUICK_PANELS } })

    await wrapper.find('.portal-quick-card--requirement').trigger('click')

    expect(wrapper.emitted('open')).toEqual([[HOME_QUICK_PANELS[1]]])
  })
})

describe('首页定制流程', () => {
  it('五个步骤都渲染图标与说明，不留下空白步骤', () => {
    const wrapper = mount(PortalWorkflowSection, { props: { steps: HOME_WORKFLOW_STEPS } })
    const cards = wrapper.findAll('.portal-step-card')

    expect(cards).toHaveLength(5)
    expect(wrapper.findAll('.portal-step-card__icon').map((icon) => icon.text())).toEqual([
      '▣',
      '☑',
      '⊞',
      '☑',
      '♥',
    ])
    expect(cards.map((card) => card.find('strong').text())).toEqual([
      '1. 提交需求',
      '2. 需求审核',
      '3. 开发者接单',
      '4. 完成验收',
      '5. 评价完成',
    ])
  })
})
