import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import WorkbenchIconRail from '@/components/workbench/WorkbenchIconRail.vue'

const routes = [
  'workbench',
  'workbench-account',
  'workbench-authorized-apps',
  'workbench-tickets',
  'workbench-signatures',
  'workbench-invoices',
  'workbench-favorites',
  'workbench-coupons',
  'workbench-points',
  'mall',
  'workbench-perks',
  'workbench-badges',
  'workbench-resource-purchases',
  'workbench-purchase-transfers',
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
  /** 导航按钮的文字在 `aria-label` 上：悬浮提示已 Teleport 到 body，不在按钮 DOM 里。 */
  function itemLabels(wrapper: ReturnType<typeof mount>) {
    return wrapper.findAll('.workbench-icon-rail__item').map((b) => b.attributes('aria-label'))
  }

  it('用户模式保留消息与核心业务入口，不再显示需求大厅图标', async () => {
    const { wrapper } = await render('workbench', false)

    expect(wrapper.findAll('.workbench-icon-rail__item')).toHaveLength(8)
    const labels = itemLabels(wrapper)
    expect(labels).toContain('消息')
    expect(labels).toContain('我的需求')
    expect(labels).toContain('系统通知')
    expect(labels).not.toContain('需求大厅')
    expect(wrapper.find('.workbench-icon-rail__item.is-active').attributes('aria-label')).toBe(
      '消息',
    )
    expect(wrapper.find('.workbench-icon-rail__badge').text()).toBe('3')
    wrapper.unmount()
  })

  it('齿轮菜单提供账户入口和模式切换出口', async () => {
    const { wrapper } = await render('dev-home', true)

    expect(itemLabels(wrapper)).toContain('开发者总览')
    expect(wrapper.find('.workbench-icon-rail__item.is-active').attributes('aria-label')).toBe(
      '开发者总览',
    )

    await wrapper.find('.workbench-icon-rail__settings-trigger').trigger('click')
    const labels = wrapper
      .findAll('.workbench-icon-rail__settings-option')
      .map((item) => item.text())
    expect(labels).toEqual([
      '个人账户',
      '账户详情',
      '已授权应用',
      '工单中心',
      '我的合同',
      '我的发票',
      '我的收藏',
      '优惠券中心',
      '积分中心',
      '积分商城',
      '我的权益',
      '勋章与邀请',
      '我的已购',
      '过户与转移',
      '回到用户工作台',
    ])

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

  /**
   * 回归：导航按钮的悬浮提示曾挂在 `.workbench-icon-rail__items` 里，
   * 而那个容器是 `overflow-y: auto` 的滚动区（横向也一起裁），气泡被切掉大半，
   * 表现为「只有齿轮有提示，上面一排一个都不亮」。修法是把气泡 Teleport 到 body。
   */
  it('导航按钮的悬浮提示渲染在滚动容器之外', async () => {
    const { wrapper } = await render('workbench', false)

    // 默认不渲染气泡，只有交互后才出现
    expect(document.querySelector('.workbench-icon-rail__tooltip--floating')).toBeNull()

    const item = wrapper.findAll('.workbench-icon-rail__item')[1]!
    await item.trigger('mouseenter')

    const floating = document.querySelector('.workbench-icon-rail__tooltip--floating')
    expect(floating).not.toBeNull()
    expect(floating!.textContent).toBe('资源项目')
    expect(floating!.closest('.workbench-icon-rail__items')).toBeNull()
    expect(floating!.parentElement).toBe(document.body)

    await item.trigger('mouseleave')
    expect(document.querySelector('.workbench-icon-rail__tooltip--floating')).toBeNull()

    wrapper.unmount()
  })
})
