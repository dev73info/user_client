import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import WorkbenchIconRail from '@/components/workbench/WorkbenchIconRail.vue'

const routes = [
  'workbench',
  'workbench-messages',
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
    ? { devArea: true, workbenchChat: name === 'dev-messages' }
    : name === 'workbench-messages'
      ? { workbenchChat: true }
      : {},
}))

async function render(name: string, { isDevWorkbenchMode = false, realnameApproved = true } = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push({ name })
  const wrapper = mount(WorkbenchIconRail, {
    props: {
      isDevWorkbenchMode,
      unreadCount: 3,
      teamInvitationCount: 2,
      realnameApproved,
      username: 'client_flow_03562487',
    },
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

  it('底部有切换工作台入口，点击发出 switch-mode', async () => {
    const { wrapper } = await render('workbench')

    const foot = wrapper.find('.workbench-icon-rail__foot')
    const switchButton = foot.find('.workbench-icon-rail__switch')
    expect(switchButton.exists()).toBe(true)
    expect(switchButton.attributes('aria-label')).toBe('切换到开发者')

    // 菜单修正稿：切换入口从顶部移到图标栏底部（设置与头像之前）
    expect(foot.find('.workbench-icon-rail__settings').exists()).toBe(true)

    await switchButton.trigger('click')
    expect(wrapper.emitted('switch-mode')).toHaveLength(1)
    wrapper.unmount()
  })

  it('切换分组时回到该组上一次选中的页面', async () => {
    const { router, wrapper } = await render('workbench')
    const groupButton = (label: string) =>
      wrapper
        .findAll('.workbench-icon-rail__item')
        .find((button) => button.attributes('aria-label') === label)!

    await router.push({ name: 'workbench-perks' })
    await flushPromises()

    // 第一次进「订单与合同」→ 组内第一条
    await groupButton('订单与合同').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('workbench-requirements')

    await router.push({ name: 'workbench-signatures' })
    await flushPromises()

    // 回到「资产与权益」→ 上次的「我的权益」，而不是组内第一条
    await groupButton('资产与权益').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('workbench-perks')

    // 再回「订单与合同」→ 上次的「我的合同」
    await groupButton('订单与合同').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('workbench-signatures')
    wrapper.unmount()
  })

  it('切到别的分组再点回「消息」，恢复上次打开的会话', async () => {
    const { router, wrapper } = await render('workbench')
    const railButton = (label: string) =>
      wrapper
        .findAll('.workbench-icon-rail__item')
        .find((button) => button.attributes('aria-label') === label)!

    await router.push({ name: 'workbench-messages', query: { requirement_id: 'REQ-1' } })
    await flushPromises()

    await railButton('资产与权益').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('workbench-favorites')

    await railButton('消息').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('workbench-messages')
    expect(router.currentRoute.value.query.requirement_id).toBe('REQ-1')
    wrapper.unmount()
  })

  it('开发者模式的「消息」同样恢复上次会话', async () => {
    const { router, wrapper } = await render('dev-messages', { isDevWorkbenchMode: true })
    const railButton = (label: string) =>
      wrapper
        .findAll('.workbench-icon-rail__item')
        .find((button) => button.attributes('aria-label') === label)!

    await router.push({ name: 'dev-messages', query: { requirement_id: 'REQ-2' } })
    await flushPromises()

    await railButton('接单与交付').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('dev-home')

    await railButton('消息').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('dev-messages')
    expect(router.currentRoute.value.query.requirement_id).toBe('REQ-2')
    wrapper.unmount()
  })

  it('用户模式只剩总览 / 消息 / 两个分组 / 系统通知，不再平铺账户类入口', async () => {
    const { wrapper } = await render('workbench')

    // 5 个导航按钮 = 总览 + 消息 + 订单与合同 + 资产与权益 + 系统通知
    expect(wrapper.findAll('.workbench-icon-rail__items .workbench-icon-rail__item')).toHaveLength(
      5,
    )
    const labels = itemLabels(wrapper)
    expect(labels).toEqual([
      '工作台总览',
      '消息',
      '订单与合同',
      '资产与权益',
      '系统通知',
      '切换到开发者',
      '账户菜单',
    ])
    expect(wrapper.find('.workbench-icon-rail__item.is-active').attributes('aria-label')).toBe(
      '工作台总览',
    )
    expect(wrapper.find('.workbench-icon-rail__badge').text()).toBe('3')
    expect(wrapper.find('.workbench-icon-rail__settings-avatar').text()).toBe('C')
    expect(wrapper.find('.workbench-icon-rail__avatar').exists()).toBe(false)
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

  it('齿轮弹层只剩账户三条', async () => {
    const { wrapper } = await render('dev-home', { isDevWorkbenchMode: true })

    expect(itemLabels(wrapper)).toContain('接单与交付')
    expect(wrapper.find('.workbench-icon-rail__item.is-active').attributes('aria-label')).toBe(
      '工作台总览',
    )

    await wrapper.find('.workbench-icon-rail__settings-trigger').trigger('click')
    const labels = wrapper
      .findAll('.workbench-icon-rail__settings-option')
      .map((item) => item.text())
    expect(labels).toEqual(['账户详情', '已授权应用', '工单中心'])
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
      5,
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

    const item = wrapper
      .findAll('.workbench-icon-rail__items .workbench-icon-rail__item')
      .find((button) => button.attributes('aria-label') === '订单与合同')!
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
