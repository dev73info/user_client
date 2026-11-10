import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import WorkbenchIconRail from '@/components/workbench/WorkbenchIconRail.vue'

const routes = [
  'dev-home',
  'dev-messages',
  'dev-resource-list',
  'dev-my-requirements',
  'dev-requirement-hall',
  'dev-oauth-clients',
  'workbench-teams',
  'dev-wallet',
  'dev-invoices',
].map((name) => ({
  name,
  path: `/${name}`,
  component: { template: '<div />' },
  meta: { devArea: true, workbenchChat: name === 'dev-messages' },
}))

async function render(name: string, groupPanelOpen: boolean) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push({ name })
  const wrapper = mount(WorkbenchIconRail, {
    props: {
      isDevWorkbenchMode: true,
      unreadCount: 0,
      notificationUnreadCount: 0,
      realnameApproved: true,
      username: 'dev_flow_03562487',
      groupPanelOpen,
    },
    global: { plugins: [router] },
  })
  await flushPromises()
  return { router, wrapper }
}

/** 悬浮菜单有 120ms 的打开延迟，用例里用真实计时器等一小会儿。 */
function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function findGroupButton(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper
    .findAll('.workbench-icon-rail__item')
    .find((button) => button.attributes('aria-label') === label)!
}

describe('图标栏分组悬浮菜单（PC）', () => {
  it('面板收起时悬浮分组图标弹出菜单列表，点条目只导航、不重新展开中栏', async () => {
    const { router, wrapper } = await render('dev-home', false)
    const groupButton = findGroupButton(wrapper, '接单与交付')

    await groupButton.trigger('mouseenter')
    // 有 120ms 延迟：刚移上去还不弹
    expect(document.querySelector('.workbench-icon-rail__flyout')).toBeNull()
    await wait(160)

    const flyout = document.querySelector('.workbench-icon-rail__flyout')
    expect(flyout).not.toBeNull()
    // 悬浮层脱离滚动容器，直接挂在 body 上
    expect(flyout!.parentElement).toBe(document.body)

    const items = flyout!.querySelectorAll('.workbench-icon-rail__flyout-item')
    expect(items).toHaveLength(3)
    expect(flyout!.textContent).not.toContain('开发者总览')
    expect(flyout!.textContent).toContain('我的接单')
    // 悬浮层出现时不再叠一层分组 tooltip
    expect(document.querySelector('.workbench-icon-rail__tooltip--floating')).toBeNull()

    const target = Array.from(items).find((entry) => entry.textContent?.includes('我的接单'))!
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('dev-my-requirements')
    // 悬浮菜单是「收起后的替代品」：点条目只导航，不把中栏顶回来
    expect(wrapper.emitted('open-group')).toBeUndefined()
    expect(document.querySelector('.workbench-icon-rail__flyout')).toBeNull()

    wrapper.unmount()
  })

  it('鼠标离开分组图标后悬浮菜单收起', async () => {
    const { wrapper } = await render('dev-home', false)
    const groupButton = findGroupButton(wrapper, '接单与交付')

    await groupButton.trigger('mouseenter')
    await wait(160)
    expect(document.querySelector('.workbench-icon-rail__flyout')).not.toBeNull()

    await groupButton.trigger('mouseleave')
    // 160ms 内还留着，方便鼠标移进悬浮层
    expect(document.querySelector('.workbench-icon-rail__flyout')).not.toBeNull()
    await wait(200)
    expect(document.querySelector('.workbench-icon-rail__flyout')).toBeNull()

    wrapper.unmount()
  })

  it('面板展开时悬浮分组图标只出 tooltip，不弹菜单列表', async () => {
    const { wrapper } = await render('dev-home', true)
    const groupButton = findGroupButton(wrapper, '接单与交付')

    await groupButton.trigger('mouseenter')
    await wait(160)

    expect(document.querySelector('.workbench-icon-rail__flyout')).toBeNull()
    expect(document.querySelector('.workbench-icon-rail__tooltip--floating')?.textContent).toBe(
      '接单与交付',
    )

    wrapper.unmount()
  })
})
