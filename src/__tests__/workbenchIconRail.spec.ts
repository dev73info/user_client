import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import WorkbenchIconRail from '@/components/workbench/WorkbenchIconRail.vue'

const routes = [
  'workbench',
  'workbench-requirements',
  'workbench-signatures',
  'workbench-invoices',
  'workbench-resource-purchases',
  'workbench-purchase-transfers',
  'workbench-favorites',
  'workbench-coupons',
  'workbench-points',
  'mall',
  'workbench-perks',
  'workbench-badges',
  'workbench-notifications',
  'workbench-account',
  'workbench-authorized-apps',
  'workbench-tickets',
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

async function render(name: string, { isDevWorkbenchMode = false, realnameApproved = true } = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push({ name })
  const wrapper = mount(WorkbenchIconRail, {
    props: { isDevWorkbenchMode, unreadCount: 3, teamInvitationCount: 2, realnameApproved },
    global: { plugins: [router] },
  })
  await flushPromises()
  return { router, wrapper }
}

describe('工作台图标栏', () => {
  /** 导航按钮的文字在 `aria-label` 上：悬浮提示已 Teleport 到 body，不在按钮 DOM 里。 */
  function itemLabels(wrapper: ReturnType<typeof mount>) {
    return wrapper.findAll('.workbench-icon-rail__item').map((b) => b.attributes('aria-label'))
  }

  it('用户模式只剩消息 / 两个分组 / 系统通知，不再平铺账户类入口', async () => {
    const { wrapper } = await render('workbench')

    // 8 个按钮 = 消息 + 订单与合同 + 资产与权益 + 系统通知 + 齿轮（齿轮也是 __item）
    expect(wrapper.findAll('.workbench-icon-rail__items .workbench-icon-rail__item')).toHaveLength(
      4,
    )
    const labels = itemLabels(wrapper)
    expect(labels).toEqual(['消息', '订单与合同', '资产与权益', '系统通知', '账户菜单'])
    expect(wrapper.find('.workbench-icon-rail__item.is-active').attributes('aria-label')).toBe(
      '消息',
    )
    expect(wrapper.find('.workbench-icon-rail__badge').text()).toBe('3')
    wrapper.unmount()
  })

  it('停在分组里的页面时，该分组图标点亮、消息不亮', async () => {
    const { wrapper } = await render('workbench-coupons')

    expect(wrapper.find('.workbench-icon-rail__item.is-active').attributes('aria-label')).toBe(
      '资产与权益',
    )
    wrapper.unmount()
  })

  it('点击分组图标进入组内第一条（组的落地页）', async () => {
    const { router, wrapper } = await render('workbench')

    const assets = wrapper
      .findAll('.workbench-icon-rail__item')
      .find((b) => b.attributes('aria-label') === '资产与权益')
    await assets!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('workbench-favorites')
    wrapper.unmount()
  })

  it('齿轮弹层只剩账户四条与模式切换', async () => {
    const { wrapper } = await render('dev-home', { isDevWorkbenchMode: true })

    expect(itemLabels(wrapper)).toContain('开发者总览')
    expect(wrapper.find('.workbench-icon-rail__item.is-active').attributes('aria-label')).toBe(
      '开发者总览',
    )

    await wrapper.find('.workbench-icon-rail__settings-trigger').trigger('click')
    const labels = wrapper
      .findAll('.workbench-icon-rail__settings-option')
      .map((item) => item.text())
    expect(labels).toEqual(['个人账户', '账户详情', '已授权应用', '工单中心', '回到用户工作台'])

    await wrapper.find('.workbench-icon-rail__settings-switch').trigger('click')
    expect(wrapper.emitted('switch-mode')).toHaveLength(1)
    wrapper.unmount()
  })

  it('账户详情从齿轮菜单进入对应路由', async () => {
    const { router, wrapper } = await render('workbench')

    await wrapper.find('.workbench-icon-rail__settings-trigger').trigger('click')
    const account = wrapper
      .findAll('.workbench-icon-rail__settings-option')
      .find((item) => item.text() === '账户详情')
    await account!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('workbench-account')
    wrapper.unmount()
  })

  it('停在账户类页面时齿轮点亮（这些页面已不在图标栏上）', async () => {
    const { wrapper } = await render('workbench-tickets')

    expect(wrapper.find('.workbench-icon-rail__settings-trigger').classes()).toContain('is-active')
    wrapper.unmount()
  })

  it('实名未通过时「订单与合同」里没有我的合同', async () => {
    // 组内条目只在侧栏/中栏渲染，图标栏这层只能验「传进去的实名状态没被吞掉」——
    // 具体条目收敛在 `workbenchRailGroups.spec.ts` 里按 buildRailGroups 验过。
    const { wrapper } = await render('workbench', { realnameApproved: false })

    expect(wrapper.findAll('.workbench-icon-rail__items .workbench-icon-rail__item')).toHaveLength(
      4,
    )
    wrapper.unmount()
  })

  /**
   * 回归：导航按钮的悬浮提示曾挂在 `.workbench-icon-rail__items` 里，
   * 而那个容器是 `overflow-y: auto` 的滚动区（横向也一起裁），气泡被切掉大半，
   * 表现为「只有齿轮有提示，上面一排一个都不亮」。修法是把气泡 Teleport 到 body。
   */
  it('导航按钮的悬浮提示渲染在滚动容器之外', async () => {
    const { wrapper } = await render('workbench')

    // 默认不渲染气泡，只有交互后才出现
    expect(document.querySelector('.workbench-icon-rail__tooltip--floating')).toBeNull()

    const item = wrapper.findAll('.workbench-icon-rail__items .workbench-icon-rail__item')[1]!
    await item.trigger('mouseenter')

    const floating = document.querySelector('.workbench-icon-rail__tooltip--floating')
    expect(floating).not.toBeNull()
    expect(floating!.textContent).toBe('订单与合同')
    expect(floating!.closest('.workbench-icon-rail__items')).toBeNull()
    expect(floating!.parentElement).toBe(document.body)

    await item.trigger('mouseleave')
    expect(document.querySelector('.workbench-icon-rail__tooltip--floating')).toBeNull()

    wrapper.unmount()
  })
})
