import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import {
  menuGroupHead,
  primeWorkbenchAuth,
  renderWorkbench,
  rootLink,
  sidebar,
} from './helpers/workbenchMode'

vi.mock('@/api/realname', () => ({
  getMyRealnameVerification: vi.fn().mockResolvedValue({ status: 'approved' }),
}))
vi.mock('@/api/conversations', () => ({
  listRequirementConversations: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/api/team', () => ({ listUserInvitations: vi.fn().mockResolvedValue([]) }))
vi.mock('@/api/devRequirements', () => ({ listMyRequirements: vi.fn().mockResolvedValue([]) }))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessageBox: {
      ...actual.TMessageBox,
      confirm: vi.fn().mockResolvedValue(true),
    },
  }
})

beforeEach(() => {
  primeWorkbenchAuth()
})

describe('workbench route switching', () => {
  it('开发者工作台点消息中心留在开发者工作台，用户工作台仍走用户端路由', async () => {
    const dev = await renderWorkbench('dev-resource-list')
    await menuGroupHead(dev.wrapper, '消息中心').trigger('click')
    await flushPromises()
    expect(dev.router.currentRoute.value.name).toBe('dev-messages')
    expect(dev.wrapper.find('.user-workbench__brand-title').text()).toBe('开发者工作台')
    dev.wrapper.unmount()

    const user = await renderWorkbench('workbench')
    await menuGroupHead(user.wrapper, '消息中心').trigger('click')
    await flushPromises()
    expect(user.router.currentRoute.value.name).toBe('workbench-messages')
    expect(user.wrapper.find('.user-workbench__brand-title').text()).toBe('我的工作台')
    user.wrapper.unmount()
  })

  it('工单中心在两种工作台各走各的路由：开发者端不切回用户菜单', async () => {
    const dev = await renderWorkbench('dev-resource-list')
    await rootLink(dev.wrapper, '工单中心').trigger('click')
    await flushPromises()
    expect(dev.router.currentRoute.value.name).toBe('dev-tickets')
    expect(dev.wrapper.find('.user-workbench__brand-title').text()).toBe('开发者工作台')
    dev.wrapper.unmount()

    const user = await renderWorkbench('workbench')
    await rootLink(user.wrapper, '工单中心').trigger('click')
    await flushPromises()
    expect(user.router.currentRoute.value.name).toBe('workbench-tickets')
    expect(user.wrapper.find('.user-workbench__brand-title').text()).toBe('我的工作台')
    user.wrapper.unmount()
  })

  it('侧栏「退出登录」确认后清会话并回到首页', async () => {
    const { TMessageBox } = await import('ui_73info')
    vi.mocked(TMessageBox.confirm).mockResolvedValue(true)

    const { wrapper, router } = await renderWorkbench('workbench')
    const auth = useAuthStore()
    const logoutSpy = vi.spyOn(auth, 'logout')
    const logoutBtn = wrapper.find('.user-workbench__menu-link--logout')
    expect(logoutBtn.exists()).toBe(true)
    expect(logoutBtn.text()).toContain('退出登录')
    await logoutBtn.trigger('click')
    await flushPromises()
    expect(TMessageBox.confirm).toHaveBeenCalled()
    expect(logoutSpy).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.name).toBe('home')
    wrapper.unmount()
  })

  it('侧栏「退出登录」取消确认时不退出', async () => {
    const { TMessageBox } = await import('ui_73info')
    vi.mocked(TMessageBox.confirm).mockResolvedValue(false)

    const { wrapper, router } = await renderWorkbench('workbench')
    const auth = useAuthStore()
    const logoutSpy = vi.spyOn(auth, 'logout')
    await wrapper.find('.user-workbench__menu-link--logout').trigger('click')
    await flushPromises()
    expect(logoutSpy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('workbench')
    wrapper.unmount()
  })

  it('系统通知在两种工作台各走各的路由：开发者端不切回用户菜单', async () => {
    const dev = await renderWorkbench('dev-resource-list')
    await rootLink(dev.wrapper, '系统通知').trigger('click')
    await flushPromises()
    expect(dev.router.currentRoute.value.name).toBe('dev-notifications')
    expect(dev.wrapper.find('.user-workbench__brand-title').text()).toBe('开发者工作台')
    dev.wrapper.unmount()

    const user = await renderWorkbench('workbench')
    await rootLink(user.wrapper, '系统通知').trigger('click')
    await flushPromises()
    expect(user.router.currentRoute.value.name).toBe('workbench-notifications')
    expect(user.wrapper.find('.user-workbench__brand-title').text()).toBe('我的工作台')
    user.wrapper.unmount()
  })

  it('外壳不铺页面标题栏，移动端顶部栏也不给「返回」', async () => {
    for (const name of ['workbench', 'dev-home', 'dev-wallet', 'dev-resource-list']) {
      const { wrapper } = await renderWorkbench(name)
      expect(wrapper.find('.user-workbench__head').exists()).toBe(false)
      expect(wrapper.find('.user-workbench__mobile-back').exists()).toBe(false)
      wrapper.unmount()
    }
  })

  it('点切换工作台在两种模式之间来回跳转', async () => {
    const { wrapper, router } = await renderWorkbench('workbench')
    await wrapper.find('.user-workbench__mode-switch').trigger('click')
    await flushPromises()
    // 落地页是开发者工作台总览，不再直接跳资源列表
    expect(router.currentRoute.value.name).toBe('dev-home')
    expect(sidebar(wrapper)).toContain('工作台总览')

    await wrapper.find('.user-workbench__mode-switch').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('workbench')
    expect(sidebar(wrapper)).toContain('工作台总览')
    wrapper.unmount()
  })
})
