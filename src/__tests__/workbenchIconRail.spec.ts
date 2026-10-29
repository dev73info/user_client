import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import WorkbenchIconRail from '@/components/workbench/WorkbenchIconRail.vue'

const routes = ['workbench', 'dev-home', 'dev-messages', 'dev-resource-list'].map((name) => ({
  name,
  path: `/${name}`,
  component: { template: '<div />' },
  meta: name.startsWith('dev-')
    ? { devArea: true }
    : name === 'workbench'
      ? { workbenchChat: true }
      : {},
}))

async function render(name: string, isDevWorkbenchMode: boolean) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push({ name })
  const wrapper = mount(WorkbenchIconRail, {
    props: { isDevWorkbenchMode, unreadCount: 3, teamInvitationCount: 2 },
    global: { plugins: [router] },
  })
  return { router, wrapper }
}

describe('工作台图标栏', () => {
  it('用户模式保留消息、个人中心与核心业务入口', async () => {
    const { wrapper } = await render('workbench', false)

    expect(wrapper.findAll('.workbench-icon-rail__item')).toHaveLength(10)
    expect(wrapper.text()).toContain('消息')
    expect(wrapper.text()).toContain('我的需求')
    expect(wrapper.text()).toContain('系统通知')
    expect(wrapper.find('.workbench-icon-rail__item.is-active').text()).toContain('消息')
    expect(wrapper.find('.workbench-icon-rail__badge').text()).toBe('3')
    wrapper.unmount()
  })

  it('开发者模式切换为开发者入口，并保持模式切换出口', async () => {
    const { wrapper } = await render('dev-home', true)

    expect(wrapper.text()).toContain('开发者总览')
    expect(wrapper.text()).toContain('资源项目')
    expect(wrapper.text()).toContain('我的接单')
    expect(wrapper.text()).toContain('收益钱包')
    expect(wrapper.find('.workbench-icon-rail__item.is-active').text()).toContain('开发者总览')

    await wrapper.find('.workbench-icon-rail__switch').trigger('click')
    expect(wrapper.emitted('switch-mode')).toHaveLength(1)
    wrapper.unmount()
  })
})
