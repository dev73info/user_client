import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import WorkbenchIconRail from '@/components/workbench/WorkbenchIconRail.vue'

const routes = [
  'workbench',
  'workbench-account',
  'workbench-requirement-hall',
  'dev-home',
  'dev-messages',
  'dev-resource-list',
].map((name) => ({
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
  it('用户模式保留消息与核心业务入口，需求大厅留在工作台外壳内', async () => {
    const { router, wrapper } = await render('workbench', false)

    expect(wrapper.findAll('.workbench-icon-rail__item')).toHaveLength(9)
    expect(wrapper.text()).toContain('消息')
    expect(wrapper.text()).toContain('我的需求')
    expect(wrapper.text()).toContain('系统通知')
    expect(wrapper.text()).not.toContain('我的\n')
    expect(wrapper.find('.workbench-icon-rail__item.is-active').text()).toContain('消息')
    expect(wrapper.find('.workbench-icon-rail__badge').text()).toBe('3')

    const hall = wrapper
      .findAll('.workbench-icon-rail__item')
      .find((item) => item.attributes('title') === '需求大厅')
    await hall!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('workbench-requirement-hall')
    wrapper.unmount()
  })

  it('齿轮菜单提供账户入口和模式切换出口', async () => {
    const { wrapper } = await render('dev-home', true)

    expect(wrapper.text()).toContain('开发者总览')
    expect(wrapper.find('.workbench-icon-rail__item.is-active').text()).toContain('开发者总览')

    await wrapper.find('.workbench-icon-rail__settings-trigger').trigger('click')
    expect(wrapper.find('[role="menu"]').text()).toContain('个人账户')
    expect(wrapper.find('[role="menu"]').text()).toContain('账户详情')
    expect(wrapper.find('[role="menu"]').text()).toContain('回到用户工作台')

    await wrapper.find('.workbench-icon-rail__settings-switch').trigger('click')
    expect(wrapper.emitted('switch-mode')).toHaveLength(1)
    wrapper.unmount()
  })

  it('账户详情从齿轮菜单进入对应路由', async () => {
    const { router, wrapper } = await render('workbench', false)

    await wrapper.find('.workbench-icon-rail__settings-trigger').trigger('click')
    const account = wrapper
      .findAll('.workbench-icon-rail__settings-option')
      .find((item) => item.text() === '账户详情')
    await account!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('workbench-account')
    wrapper.unmount()
  })
})
