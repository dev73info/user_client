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

// 开发者页面在 router/dev.ts 里都带 devArea 标记，侧边栏据此把整条菜单换成开发者菜单。
// 团队服务已整体移入开发者工作台，这三个页面同样是 devArea 路由，不再属于用户菜单。
// 消息中心与工单中心两端共用同一套页面，但各自一条路由：开发者端走 dev-messages / dev-tickets，
// 点进去不会切回用户工作台，页面也据此走开发者体系的外观。系统通知与两者同一办法。
const USER_ROUTE_NAMES = ['workbench', 'workbench-requirements', 'workbench-account',
  'workbench-signatures', 'workbench-invoices', 'workbench-points', 'workbench-perks',
  'workbench-coupons', 'workbench-badges', 'workbench-favorites', 'workbench-resource-purchases',
  'workbench-invite', 'workbench-tickets', 'workbench-messages', 'workbench-notifications']
const DEV_ROUTE_NAMES = ['dev-home', 'dev-resource-list', 'dev-resource-sold-purchases', 'dev-tip-settings',
  'dev-requirement-hall', 'dev-my-requirements', 'dev-wallet',
  'workbench-teams', 'workbench-team-detail', 'workbench-team-resources', 'dev-messages',
  'dev-tickets', 'dev-invoices', 'dev-notifications']

// 开发者路由的路径不都是 /workbench/developer/<name>：钱包按业务词分了分段路径，「我的发票」也是。
// 侧边栏链接断言看的是真实 href，所以这里按生产路径（router/dev.ts）登记，其余沿用默认规则。
const DEV_ROUTE_PATHS: Record<string, string> = {
  'dev-wallet': '/workbench/developer/wallet/overview',
  'dev-invoices': '/workbench/developer/invoices',
  'dev-resource-list': '/workbench/developer/resources/list',
  'dev-resource-sold-purchases': '/workbench/developer/resources/sold',
  'dev-tip-settings': '/workbench/developer/tips',
}

const routes: RouteRecordRaw[] = [
  // 侧边栏底部的品牌卡指向门户首页，测试路由里也要有这一条，否则 RouterLink 解析不到目标
  { name: 'home', path: '/', component: { template: '<div />' } },
  ...USER_ROUTE_NAMES.map((name): RouteRecordRaw => ({
    name, path: `/workbench/${name}`, component: { template: '<div />' },
  })),
  ...DEV_ROUTE_NAMES.map((name): RouteRecordRaw => ({
    name,
    path: DEV_ROUTE_PATHS[name] ?? `/workbench/developer/${name}`,
    component: { template: '<div />' },
    meta: { devArea: true },
  })),
]

async function render(name: string) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push({ name })
  const wrapper = mount(UserWorkbenchView, {
    global: { plugins: [router], stubs: { RouterView: true } },
  })
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
    expect(wrapper.find('.user-workbench__brand > .user-workbench__brand-mark').exists()).toBe(true)
    expect(wrapper.find('.user-workbench__brand > .user-workbench__brand-title').text()).toBe('我的工作台')
    expect(sidebar(wrapper)).toContain('工作台总览')
    // 开发者条目不再挤在用户侧边栏底部
    expect(sidebar(wrapper)).not.toContain('我的资源项目')
    expect(sidebar(wrapper)).not.toContain('需求大厅')
    // 团队服务已搬进开发者工作台，用户侧边栏不再出现
    expect(sidebar(wrapper)).not.toContain('团队服务')
    expect(sidebar(wrapper)).not.toContain('我的团队')
    // 「我的定制」已并入「我的需求」，该组只剩一个页面：整组收成一条一级条目「我的需求」
    expect(sidebar(wrapper)).not.toContain('我的定制')
    expect(sidebar(wrapper)).toContain('我的需求')
    expect(sidebar(wrapper)).not.toContain('需求协作')
    expect(
      wrapper.findAll('.user-workbench__menu .user-workbench__menu-link--root').map((link) => link.text()),
    ).toEqual(['工作台总览', '我的需求', '系统通知', '工单中心', '退出登录'])
    // 消息中心是一级条目：排在「我的需求」之后、「账户服务」之前，不再嵌在需求分组的子菜单里。
    // 「我的背包」从「账户服务」里提出来，自己一个分组排在它后面。
    expect(wrapper.findAll('.user-workbench__menu-group-head').map((head) => head.text()))
      .toEqual(['消息中心', '账户服务', '我的背包'])
    expect(wrapper.find('.user-workbench__submenu .user-workbench__menu-group-head').exists()).toBe(false)

    // 「我的背包」是独立分组：组内四页都在，账户服务里不再留这一条。
    // 只剩一个页面的分组（「我的需求」）没有分组头，先挑出有分组头的那些。
    const groups = wrapper.findAll('.user-workbench__menu-group')
      .filter((group) => group.find('.user-workbench__menu-group-head').exists())
    const accountGroup = groups.find((group) => group.find('.user-workbench__menu-group-head').text().includes('账户服务'))!
    const inventoryGroup = groups.find((group) => group.find('.user-workbench__menu-group-head').text().includes('我的背包'))!
    // 「我的邀请」已并入「勋章与邀请」（原「我的徽章墙」那条），不再单列。
    expect(accountGroup.findAll('.user-workbench__submenu-link').map((link) => link.text()))
      .toEqual(['账户详情', '我的合同', '我的发票', '我的收藏', '我的已购'])
    expect(inventoryGroup.findAll('.user-workbench__submenu-link').map((link) => link.text()))
      .toEqual(['积分中心', '权益中心', '优惠券中心', '勋章与邀请'])
    expect(inventoryGroup.findAll('.user-workbench__submenu-link')[0]?.attributes('href'))
      .toBe('/workbench/workbench-points')
    expect(inventoryGroup.findAll('.user-workbench__submenu-link')[3]?.attributes('href'))
      .toBe('/workbench/workbench-badges')
    wrapper.unmount()
  })

  it('开发者路由下整条侧边栏换成开发者菜单', async () => {
    const { wrapper } = await render('dev-resource-list')
    const text = sidebar(wrapper)
    // 开发者菜单按每天的动线平铺成一级条目，不再分小标题；
    // 团队服务那一段也没有小标题，靠折叠组的分组头报名字
    expect(wrapper.findAll('.user-workbench__menu > .user-workbench__menu-section')).toHaveLength(0)
    // 用户端菜单整条换掉，不再出现
    expect(text).not.toContain('账户服务')
    // 与用户菜单同一套一级条目版式（带图标的一级菜单），切换模式时侧边栏只有文字变化；
    // 条目按动线排：先总览与资源，再接单（交付与到账并进了这一页，菜单不再单列一条）
    const devLinks = wrapper.findAll('.user-workbench__menu > .user-workbench__menu-link--root')
    expect(devLinks[0]?.find('.user-workbench__menu-icon').exists()).toBe(true)
    expect(devLinks.map((link) => link.text()))
      .toEqual(['工作台总览', '资源项目', '需求大厅', '我的接单'])
    // 财务中心与团队服务是折叠组（分组头自带组名），消息中心夹在分组之间
    expect(wrapper.findAll('.user-workbench__menu-group-head').map((head) => head.text()))
      .toEqual(['财务中心', '团队服务', '消息中心'])
    // 与钱有关的三条收进财务中心：收益钱包原是一级条目，「我的发票」原挂在用户模式的账户服务下，
    // 「打赏设置」原是一级条目，现在也移进来当子项（子项不渲染图标）。
    const finance = wrapper.findAll('.user-workbench__menu-group')
      .find((group) => group.find('.user-workbench__menu-group-head').text().includes('财务中心'))!
    expect(finance.findAll('.user-workbench__submenu-link').map((link) => link.text()))
      .toEqual(['收益钱包', '我的发票', '打赏设置'])
    expect(finance.findAll('.user-workbench__submenu-link')[0]?.attributes('href'))
      .toBe('/workbench/developer/wallet/overview')
    expect(finance.findAll('.user-workbench__submenu-link')[1]?.attributes('href'))
      .toBe('/workbench/developer/invoices')
    // 打赏设置移入财务中心后不再是一级条目：一级菜单里没有它，子菜单里有它
    expect(devLinks.some((link) => link.text().includes('打赏设置'))).toBe(false)
    expect(finance.findAll('.user-workbench__submenu-link')[2]?.attributes('href'))
      .toBe('/workbench/developer/tips')
    // 财务中心在开发者模式下才出现，用户模式的账户服务里仍保留一条「我的发票」
    expect(text).not.toContain('账户服务')
    // 「财务中心」只出现一次：折叠组的分组头自己写着组名，上方不再顶小标题
    expect(text.match(/财务中心/g)).toHaveLength(1)
    // 「团队服务」只出现一次：折叠组的分组头自己写着组名，上方不再顶小标题
    expect(text.match(/团队服务/g)).toHaveLength(1)
    expect(text).toContain('我的团队')
    expect(text).toContain('团队资源')
    // 工单中心两种模式都保留：开发者工作台同样要能直接进工单
    expect(text).toContain('工单中心')
    // 系统通知与工单中心同一档，两种工作台都有这一条
    expect(text).toContain('系统通知')
    // 退出登录挂在工单中心下方，两种工作台共用
    expect(text).toContain('退出登录')
    const modeSwitch = wrapper.find('.user-workbench__mode-switch')
    expect(modeSwitch.attributes('aria-label')).toBe('回到用户工作台')
    expect(modeSwitch.text()).toContain('切换工作台')
    expect(modeSwitch.classes()).not.toContain('user-workbench__mode-switch--icon')
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
    // 开发者侧边栏第一个分组头是「财务中心」，团队服务排在它后面，按组名取那一个
    const head = wrapper.findAll('.user-workbench__menu-group-head')
      .find((item) => item.text().includes('团队服务'))!
    expect(head.text()).toContain('团队服务')
    // 当前页在该组内，进页时分组自动展开
    expect(head.attributes('aria-expanded')).toBe('true')
    expect(head.find('strong').text()).toBe('团队服务')
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
    expect(user.wrapper.find('.user-workbench__brand-title').text()).toBe('我的工作台')
    user.wrapper.unmount()
  })

  it('工单中心在两种工作台各走各的路由：开发者端不切回用户菜单', async () => {
    const ticketsLink = (w: Awaited<ReturnType<typeof render>>['wrapper']) =>
      w.findAll('.user-workbench__menu-link--root').find((link) => link.text().includes('工单中心'))!

    const dev = await render('dev-resource-list')
    await ticketsLink(dev.wrapper).trigger('click')
    await flushPromises()
    expect(dev.router.currentRoute.value.name).toBe('dev-tickets')
    expect(dev.wrapper.find('.user-workbench__brand-title').text()).toBe('开发者工作台')
    dev.wrapper.unmount()

    const user = await render('workbench')
    await ticketsLink(user.wrapper).trigger('click')
    await flushPromises()
    expect(user.router.currentRoute.value.name).toBe('workbench-tickets')
    expect(user.wrapper.find('.user-workbench__brand-title').text()).toBe('我的工作台')
    user.wrapper.unmount()
  })

  it('侧栏「退出登录」确认后清会话并回到首页', async () => {
    const { TMessageBox } = await import('ui_73info')
    vi.mocked(TMessageBox.confirm).mockResolvedValue(true)

    const { wrapper, router } = await render('workbench')
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

    const { wrapper, router } = await render('workbench')
    const auth = useAuthStore()
    const logoutSpy = vi.spyOn(auth, 'logout')
    await wrapper.find('.user-workbench__menu-link--logout').trigger('click')
    await flushPromises()
    expect(logoutSpy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('workbench')
    wrapper.unmount()
  })

  it('系统通知在两种工作台各走各的路由：开发者端不切回用户菜单', async () => {
    const notificationsLink = (w: Awaited<ReturnType<typeof render>>['wrapper']) =>
      w.findAll('.user-workbench__menu-link--root').find((link) => link.text().includes('系统通知'))!

    const dev = await render('dev-resource-list')
    await notificationsLink(dev.wrapper).trigger('click')
    await flushPromises()
    expect(dev.router.currentRoute.value.name).toBe('dev-notifications')
    expect(dev.wrapper.find('.user-workbench__brand-title').text()).toBe('开发者工作台')
    dev.wrapper.unmount()

    const user = await render('workbench')
    await notificationsLink(user.wrapper).trigger('click')
    await flushPromises()
    expect(user.router.currentRoute.value.name).toBe('workbench-notifications')
    expect(user.wrapper.find('.user-workbench__brand-title').text()).toBe('我的工作台')
    user.wrapper.unmount()
  })

  it('外壳不铺页面标题栏，移动端顶部栏也不给「返回」', async () => {
    for (const name of ['workbench', 'dev-home', 'dev-wallet', 'dev-resource-list']) {
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
