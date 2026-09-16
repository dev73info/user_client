import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import UserWorkbenchView from '@/views/UserWorkbenchView.vue'

vi.mock('@/api/realname', () => ({ getMyRealnameVerification: vi.fn().mockResolvedValue({ status: 'approved' }) }))
vi.mock('@/api/conversations', () => ({ listRequirementConversations: vi.fn().mockResolvedValue([]) }))
vi.mock('@/api/team', () => ({ listUserInvitations: vi.fn().mockResolvedValue([]) }))

// 开发者页面在 router/dev.ts 里都带 devArea 标记，侧边栏据此把整条菜单换成开发者菜单。
const USER_ROUTE_NAMES = ['workbench', 'workbench-requirements', 'workbench-resources', 'workbench-account',
  'workbench-signatures', 'workbench-invoices', 'workbench-points', 'workbench-favorites', 'workbench-invite',
  'workbench-teams', 'workbench-team-resources', 'workbench-tickets']
const DEV_ROUTE_NAMES = ['dev-resource-list', 'dev-requirement-hall', 'dev-my-requirements', 'dev-wallet',
  'dev-wallet-releases']

const routes: RouteRecordRaw[] = [
  ...USER_ROUTE_NAMES.map((name): RouteRecordRaw => ({
    name, path: `/workbench/${name}`, component: { template: '<div />' },
  })),
  ...DEV_ROUTE_NAMES.map((name): RouteRecordRaw => ({
    name, path: `/workbench/developer/${name}`, component: { template: '<div />' }, meta: { devArea: true },
  })),
]

async function render(name: string) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push({ name })
  const wrapper = mount(UserWorkbenchView, { global: { plugins: [router], stubs: {
    ElIcon: { template: '<i><slot /></i>' },
    ElScrollbar: { template: '<div><slot /></div>' },
    RouterView: true,
  } } })
  await flushPromises()
  return { wrapper, router }
}

const sidebar = (wrapper: Awaited<ReturnType<typeof render>>['wrapper']) =>
  wrapper.find('.user-workbench__menu').text()

beforeEach(() => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'alice'
  auth.profileLoaded = true
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  vi.spyOn(auth, 'initializeSession').mockResolvedValue({ username: 'alice', role: 'user' })
})

describe('workbench mode switch', () => {
  it('用户端页面只渲染用户菜单', async () => {
    const { wrapper } = await render('workbench')
    // 切换按钮在品牌行里靠右，按钮文字固定，切换方向放在 aria-label / title
    const modeSwitch = wrapper.find('.user-workbench__brand > .user-workbench__mode-switch')
    expect(modeSwitch.exists()).toBe(true)
    expect(modeSwitch.text()).toContain('切换工作台')
    expect(modeSwitch.attributes('aria-label')).toBe('进入开发者工作台')
    // 左侧标题是文字标题（不是药丸标签），标题内容随模式变
    expect(wrapper.find('.user-workbench__brand > .user-workbench__brand-title').text()).toBe('工作台')
    expect(sidebar(wrapper)).toContain('工作台总览')
    // 开发者条目不再挤在用户侧边栏底部
    expect(sidebar(wrapper)).not.toContain('我的资源项目')
    expect(sidebar(wrapper)).not.toContain('需求大厅')
    wrapper.unmount()
  })

  it('开发者路由下整条侧边栏换成开发者菜单', async () => {
    const { wrapper } = await render('dev-resource-list')
    const text = sidebar(wrapper)
    expect(text).toContain('开发者事项')
    expect(text).toContain('我的资源项目')
    expect(text).toContain('交付记录')
    expect(text).not.toContain('工作台总览')
    expect(text).not.toContain('我的团队')
    expect(text).not.toContain('工单中心')
    expect(wrapper.find('.user-workbench__mode-switch').attributes('aria-label')).toBe('回到用户工作台')
    expect(wrapper.find('.user-workbench__brand-title').text()).toBe('开发者工作台')
    // 与用户菜单同一套一级条目版式（带图标的一级菜单），切换模式时侧边栏只有文字变化
    const devLinks = wrapper.findAll('.user-workbench__menu > .user-workbench__menu-link--root')
    expect(devLinks).toHaveLength(5)
    expect(devLinks[0]?.find('.user-workbench__menu-icon').exists()).toBe(true)
    expect(devLinks.map((link) => link.text())).toEqual(['我的资源项目', '需求大厅', '我的接单', '收益钱包', '交付记录'])
    wrapper.unmount()
  })

  it('返回按钮放在移动端顶部标题栏内，总览页不显示', async () => {
    const dev = await render('dev-resource-list')
    const back = dev.wrapper.find('.user-workbench__mobile-bar .user-workbench__mobile-back')
    expect(back.exists()).toBe(true)
    expect(back.text()).toContain('返回')
    // 内容区不再重复渲染标题头（由 CSS 在移动端隐藏，此处确认返回按钮不在其中）
    expect(dev.wrapper.find('.user-workbench__head .user-workbench__mobile-back').exists()).toBe(false)
    dev.wrapper.unmount()

    const overview = await render('workbench')
    expect(overview.wrapper.find('.user-workbench__mobile-bar .user-workbench__mobile-back').exists()).toBe(false)
    overview.wrapper.unmount()
  })

  it('点切换工作台在两种模式之间来回跳转', async () => {
    const { wrapper, router } = await render('workbench')
    await wrapper.find('.user-workbench__mode-switch').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('dev-resource-list')
    expect(sidebar(wrapper)).toContain('我的资源项目')

    await wrapper.find('.user-workbench__mode-switch').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('workbench')
    expect(sidebar(wrapper)).toContain('工作台总览')
    wrapper.unmount()
  })
})
