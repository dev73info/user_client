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
    expect(wrapper.find('.user-workbench__mode-switch').text()).toContain('进入开发者工作台')
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
    expect(wrapper.find('.user-workbench__mode-switch').text()).toContain('回到用户工作台')
    wrapper.unmount()
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
