import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { Grid } from 'ui_73info'

import WorkbenchRailGroupNav from '@/components/workbench/WorkbenchRailGroupNav.vue'
import type { RailGroup } from '@/shared/workbenchRailGroups'

const routes = ['workbench-requirements', 'workbench-invoices'].map((name) => ({
  name,
  path: `/${name}`,
  component: { template: '<div />' },
}))

const group: RailGroup = {
  key: 'orders',
  label: '订单与合同',
  icon: Grid,
  items: [
    { key: 'requirements', label: '我的需求', name: 'workbench-requirements', description: '查看进度' },
    { key: 'invoices', label: '我的发票', name: 'workbench-invoices', description: '下载发票' },
  ],
}

async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push({ name: 'workbench-requirements' })
  const wrapper = mount(WorkbenchRailGroupNav, {
    props: {
      group,
      isItemActive: (item) => item.name === String(router.currentRoute.value.name),
    },
    global: { plugins: [router] },
  })
  await flushPromises()
  return { router, wrapper }
}

describe('分组菜单中栏', () => {
  it('头部有收起按钮，点击发出 close', async () => {
    const { wrapper } = await render()

    const close = wrapper.find('.workbench-rail-group__close')
    expect(close.exists()).toBe(true)
    expect(close.attributes('aria-label')).toBe('收起菜单列表')
    expect(close.attributes('title')).toBe('收起菜单列表')

    await close.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper.unmount()
  })

  it('仍然渲染组内条目并标出当前页', async () => {
    const { wrapper } = await render()

    const links = wrapper.findAll('.workbench-rail-group__link')
    expect(links).toHaveLength(2)
    expect(links.map((link) => link.text())).toEqual(['我的需求查看进度', '我的发票下载发票'])
    expect(links[0]!.classes()).toContain('active')

    await links[1]!.trigger('click')
    expect(wrapper.emitted('navigate')).toHaveLength(1)

    wrapper.unmount()
  })
})
