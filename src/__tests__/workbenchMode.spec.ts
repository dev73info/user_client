import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import { listMyRequirements } from '@/api/devRequirements'
import UserWorkbenchView from '@/views/UserWorkbenchView.vue'

vi.mock('@/api/realname', () => ({ getMyRealnameVerification: vi.fn().mockResolvedValue({ status: 'approved' }) }))
vi.mock('@/api/conversations', () => ({ listRequirementConversations: vi.fn().mockResolvedValue([]) }))
vi.mock('@/api/team', () => ({ listUserInvitations: vi.fn().mockResolvedValue([]) }))
vi.mock('@/api/devRequirements', () => ({ listMyRequirements: vi.fn().mockResolvedValue([]) }))

// 开发者页面在 router/dev.ts 里都带 devArea 标记，侧边栏据此把整条菜单换成开发者菜单。
// 团队服务已整体移入开发者工作台，这三个页面同样是 devArea 路由，不再属于用户菜单。
// 消息中心两端共用同一套页面，但各自一条路由：开发者端走 dev-messages，点进去不会切回用户工作台。
const USER_ROUTE_NAMES = ['workbench', 'workbench-requirements', 'workbench-account',
  'workbench-signatures', 'workbench-invoices', 'workbench-points', 'workbench-favorites', 'workbench-invite',
  'workbench-tickets', 'workbench-messages']
const DEV_ROUTE_NAMES = ['dev-home', 'dev-resource-list', 'dev-requirement-hall', 'dev-my-requirements', 'dev-wallet',
  'dev-wallet-releases', 'workbench-teams', 'workbench-team-detail', 'workbench-team-resources', 'dev-messages']

const routes: RouteRecordRaw[] = [
  // 侧边栏底部的品牌卡指向门户首页，测试路由里也要有这一条，否则 RouterLink 解析不到目标
  { name: 'home', path: '/', component: { template: '<div />' } },
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
  vi.mocked(listMyRequirements).mockResolvedValue([])
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
    // 团队服务已搬进开发者工作台，用户侧边栏不再出现
    expect(sidebar(wrapper)).not.toContain('团队服务')
    expect(sidebar(wrapper)).not.toContain('我的团队')
    // 「我的定制」已并入「我的需求」，需求协作只剩一个页面：整组收成一条一级条目
    expect(sidebar(wrapper)).not.toContain('我的定制')
    expect(sidebar(wrapper)).toContain('需求协作')
    expect(sidebar(wrapper)).not.toContain('我的需求')
    expect(
      wrapper.findAll('.user-workbench__menu .user-workbench__menu-link--root').map((link) => link.text()),
    ).toEqual(['工作台总览', '需求协作', '工单中心'])
    // 消息中心是一级条目：排在「需求协作」之后、「账户服务」之前，不再嵌在需求协作的子菜单里
    expect(wrapper.findAll('.user-workbench__menu-group-head').map((head) => head.text()))
      .toEqual(['消息中心', '账户服务'])
    expect(wrapper.find('.user-workbench__submenu .user-workbench__menu-group-head').exists()).toBe(false)
    wrapper.unmount()
  })

  it('开发者路由下整条侧边栏换成开发者菜单', async () => {
    const { wrapper } = await render('dev-resource-list')
    const text = sidebar(wrapper)
    // 开发者菜单按每天的动线平铺成一级条目，不再分小标题；
    // 团队服务那一段也没有小标题，靠折叠组的分组头报名字
    expect(wrapper.findAll('.user-workbench__menu > .user-workbench__menu-section')).toHaveLength(0)
    // 用户端菜单整条换掉，不再出现
    expect(text).not.toContain('需求协作')
    expect(text).not.toContain('账户服务')
    // 与用户菜单同一套一级条目版式（带图标的一级菜单），切换模式时侧边栏只有文字变化；
    // 条目按动线排：先总览与资源，再接单、钱包与交付
    const devLinks = wrapper.findAll('.user-workbench__menu > .user-workbench__menu-link--root')
    expect(devLinks[0]?.find('.user-workbench__menu-icon').exists()).toBe(true)
    expect(devLinks.map((link) => link.text()))
      .toEqual(['工作台总览', '资源项目', '需求大厅', '我的接单', '收益钱包', '交付记录'])
    // 协作与支持段：团队服务与消息中心是折叠组（分组头自带组名），工单中心是一级条目
    expect(wrapper.findAll('.user-workbench__menu-group-head').map((head) => head.text()))
      .toEqual(['团队服务', '消息中心'])
    // 「团队服务」只出现一次：折叠组的分组头自己写着组名，上方不再顶小标题
    expect(text.match(/团队服务/g)).toHaveLength(1)
    expect(text).toContain('我的团队')
    expect(text).toContain('团队资源')
    // 工单中心两种模式都保留：开发者工作台同样要能直接进工单
    expect(text).toContain('工单中心')
    expect(wrapper.find('.user-workbench__mode-switch').attributes('aria-label')).toBe('回到用户工作台')
    expect(wrapper.find('.user-workbench__brand-title').text()).toBe('开发者工作台')
    wrapper.unmount()
  })

  it('「我的接单」角标显示在途接单数，用户工作台不显示', async () => {
    vi.mocked(listMyRequirements).mockResolvedValue([
      { status: 'in_development' }, { status: 'pending_final' }, { status: 'completed' },
    ] as Awaited<ReturnType<typeof listMyRequirements>>)

    const dev = await render('dev-resource-list')
    const badge = dev.wrapper.find('.user-workbench__menu-link--badged .user-workbench__menu-badge')
    expect(badge.exists()).toBe(true)
    // 在途 = 未结单的两条（开发中 / 待付尾款），已结单的不算
    expect(badge.text()).toBe('2')
    dev.wrapper.unmount()

    const user = await render('workbench')
    expect(user.wrapper.find('.user-workbench__menu-badge').exists()).toBe(false)
    user.wrapper.unmount()
  })

  it('团队页面属于开发者工作台：进页不切回用户菜单，团队服务组自动展开', async () => {
    const { wrapper } = await render('workbench-teams')
    // 团队页面带 devArea，落在页面上时侧边栏仍是开发者菜单
    expect(wrapper.find('.user-workbench__brand-title').text()).toBe('开发者工作台')
    expect(sidebar(wrapper)).not.toContain('需求协作')
    const head = wrapper.find('.user-workbench__menu-group-head')
    expect(head.text()).toContain('团队服务')
    // 当前页在该组内，进页时分组自动展开
    expect(head.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.user-workbench__menu-group-head strong').text()).toBe('团队服务')
    wrapper.unmount()
  })

  it('开发者工作台点消息中心留在开发者工作台，用户工作台仍走用户端路由', async () => {
    const messagesHead = (w: Awaited<ReturnType<typeof render>>['wrapper']) =>
      w.findAll('.user-workbench__menu-group-head').find((head) => head.text().includes('消息中心'))!

    const dev = await render('dev-resource-list')
    await messagesHead(dev.wrapper).trigger('click')
    await flushPromises()
    expect(dev.router.currentRoute.value.name).toBe('dev-messages')
    expect(dev.wrapper.find('.user-workbench__brand-title').text()).toBe('开发者工作台')
    dev.wrapper.unmount()

    const user = await render('workbench')
    await messagesHead(user.wrapper).trigger('click')
    await flushPromises()
    expect(user.router.currentRoute.value.name).toBe('workbench-messages')
    expect(user.wrapper.find('.user-workbench__brand-title').text()).toBe('工作台')
    user.wrapper.unmount()
  })

  it('外壳不再铺页面标题栏，返回只在移动端顶部栏里给一颗', async () => {
    // 普通页面：桌面端没有外壳标题栏，移动端顶部栏里有「返回」
    const wallet = await render('dev-wallet')
    expect(wallet.wrapper.find('.user-workbench__head').exists()).toBe(false)
    const back = wallet.wrapper.find('.user-workbench__mobile-bar .user-workbench__mobile-back')
    expect(back.exists()).toBe(true)
    expect(back.text()).toContain('返回')
    wallet.wrapper.unmount()

    // 资源列表也按普通页面处理：页名由卡内「资源列表」标题出示，返回照给
    const list = await render('dev-resource-list')
    expect(list.wrapper.find('.user-workbench__head').exists()).toBe(false)
    expect(list.wrapper.find('.user-workbench__mobile-back').exists()).toBe(true)
    list.wrapper.unmount()

    // 落地页与页内自带返回的页面不给这颗按钮
    for (const name of ['workbench', 'dev-home']) {
      const { wrapper } = await render(name)
      expect(wrapper.find('.user-workbench__head').exists()).toBe(false)
      expect(wrapper.find('.user-workbench__mobile-back').exists()).toBe(false)
      wrapper.unmount()
    }
  })

  it('点切换工作台在两种模式之间来回跳转', async () => {
    const { wrapper, router } = await render('workbench')
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
