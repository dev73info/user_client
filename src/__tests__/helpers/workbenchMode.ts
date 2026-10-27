import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import { listMyRequirements } from '@/api/devRequirements'
import UserWorkbenchView from '@/views/UserWorkbenchView.vue'

// 开发者页面在 router/dev.ts 里都带 devArea 标记，侧边栏据此把整条菜单换成开发者菜单。
// 团队服务已整体移入开发者工作台，这三个页面同样是 devArea 路由，不再属于用户菜单。
// 消息中心两端共用同一套页面，但各自一条路由：开发者端走 dev-messages / 用户端走 workbench-messages，
// 点进去不会切回用户工作台，页面也据此走开发者体系的外观。系统通知与两者同一办法。
export const USER_ROUTE_NAMES = [
  'workbench',
  'workbench-requirements',
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
  'workbench-messages',
  'workbench-notifications',
]

export const DEV_ROUTE_NAMES = [
  'dev-home',
  'dev-oauth-clients',
  'dev-assistant',
  'dev-resource-list',
  'dev-resource-sold-purchases',
  'dev-tip-settings',
  'dev-requirement-hall',
  'dev-my-requirements',
  'dev-wallet',
  'workbench-teams',
  'workbench-team-detail',
  'workbench-team-resources',
  'dev-messages',
  'dev-invoices',
  'dev-notifications',
]

// 开发者路由的路径不都是 /workbench/developer/<name>：钱包按业务词分了分段路径，「我的发票」也是。
// 侧边栏链接断言看的是真实 href，所以这里按生产路径（router/dev.ts）登记，其余沿用默认规则。
export const DEV_ROUTE_PATHS: Record<string, string> = {
  'dev-wallet': '/workbench/developer/wallet/overview',
  'dev-invoices': '/workbench/developer/invoices',
  'dev-resource-list': '/workbench/developer/resources/list',
  'dev-resource-sold-purchases': '/workbench/developer/resources/sold',
  'dev-tip-settings': '/workbench/developer/tips',
}

export const workbenchRoutes: RouteRecordRaw[] = [
  // 侧边栏底部的品牌卡指向门户首页，测试路由里也要有这一条，否则 RouterLink 解析不到目标
  { name: 'home', path: '/', component: { template: '<div />' } },
  ...USER_ROUTE_NAMES.map(
    (name): RouteRecordRaw => ({
      name,
      path: `/workbench/${name}`,
      component: { template: '<div />' },
    }),
  ),
  ...DEV_ROUTE_NAMES.map(
    (name): RouteRecordRaw => ({
      name,
      path: DEV_ROUTE_PATHS[name] ?? `/workbench/developer/${name}`,
      component: { template: '<div />' },
      meta: { devArea: true },
    }),
  ),
]

export async function renderWorkbench(name: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: workbenchRoutes })
  await router.push({ name })
  const wrapper = mount(UserWorkbenchView, {
    global: { plugins: [router], stubs: { RouterView: true } },
  })
  await flushPromises()
  return { wrapper, router }
}

export type WorkbenchWrapper = Awaited<ReturnType<typeof renderWorkbench>>['wrapper']

export const sidebar = (wrapper: WorkbenchWrapper) => wrapper.find('.user-workbench__menu').text()

/** 每个用例开头都要一个登录态与干净 pinia：两个拆分文件共用这一份。 */
export function primeWorkbenchAuth() {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'alice'
  auth.profileLoaded = true
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  vi.spyOn(auth, 'initializeSession').mockResolvedValue({ username: 'alice', role: 'user' })
  vi.mocked(listMyRequirements).mockResolvedValue([])
}

/** 按组名找折叠组的分组头（两种工作台共用这一套选择器）。 */
export const menuGroupHead = (wrapper: WorkbenchWrapper, text: string) =>
  wrapper.findAll('.user-workbench__menu-group-head').find((head) => head.text().includes(text))!

/** 按文字找一级菜单条目。 */
export const rootLink = (wrapper: WorkbenchWrapper, text: string) =>
  wrapper.findAll('.user-workbench__menu-link--root').find((link) => link.text().includes(text))!
