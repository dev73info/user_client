import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listMyRequirements } from '@/api/devRequirements'
import {
  menuGroupHead,
  primeWorkbenchAuth,
  renderWorkbench,
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

describe('workbench mode switch', () => {
  it('用户端页面只渲染用户菜单', async () => {
    const { wrapper } = await renderWorkbench('workbench')
    // 切换按钮在品牌行里靠右，按钮文字固定，切换方向放在 aria-label / title
    const modeSwitch = wrapper.find('.user-workbench__brand > .user-workbench__mode-switch')
    expect(modeSwitch.exists()).toBe(true)
    expect(modeSwitch.text()).toContain('切换工作台')
    expect(modeSwitch.attributes('aria-label')).toBe('进入开发者工作台')
    // 左侧标题是文字标题（不是药丸标签），标题内容随模式变
    expect(wrapper.find('.user-workbench__brand > .user-workbench__brand-mark').exists()).toBe(true)
    expect(wrapper.find('.user-workbench__brand > .user-workbench__brand-title').text()).toBe(
      '我的工作台',
    )
    expect(sidebar(wrapper)).toContain('工作台总览')
    // 开发者条目不再挤在用户侧边栏底部
    expect(sidebar(wrapper)).not.toContain('我的资源项目')
    expect(sidebar(wrapper)).not.toContain('需求大厅')
    // 团队服务已搬进开发者工作台，用户侧边栏不再出现
    expect(sidebar(wrapper)).not.toContain('团队服务')
    expect(sidebar(wrapper)).not.toContain('我的团队')
    // 「我的定制」已并入「我的需求」：用户侧栏不再有单独的「需求协作」外壳
    expect(sidebar(wrapper)).not.toContain('我的定制')
    expect(sidebar(wrapper)).not.toContain('需求协作')
    expect(
      wrapper
        .findAll('.user-workbench__menu .user-workbench__menu-link--root')
        .map((link) => link.text()),
    ).toEqual(['工作台总览', '系统通知', '退出登录'])
    // 消息中心与三个分组（订单与合同 / 资产与权益 / 账户）都是折叠组
    expect(wrapper.findAll('.user-workbench__menu-group-head').map((head) => head.text())).toEqual([
      '消息中心',
      '订单与合同',
      '资产与权益',
      '账户',
    ])
    expect(wrapper.find('.user-workbench__submenu .user-workbench__menu-group-head').exists()).toBe(
      false,
    )

    // 先挑出「账户」那一组：桌面端账户那几条在齿轮弹层里，这里只留账户本身。
    const groups = wrapper
      .findAll('.user-workbench__menu-group')
      .filter((group) => group.find('.user-workbench__menu-group-head').exists())
    const accountLinks = groups
      .find((group) => group.find('.user-workbench__menu-group-head').text().includes('账户'))!
      .findAll('.user-workbench__submenu-link')
    expect(accountLinks.map((link) => link.text())).toEqual(['账户详情', '已授权应用', '工单中心'])

    // 订单与合同：成交全流程；资产与权益：券 / 积分 / 权益
    const ordersLinks = groups
      .find((group) =>
        group.find('.user-workbench__menu-group-head').text().includes('订单与合同'),
      )!
      .findAll('.user-workbench__submenu-link')
    expect(ordersLinks.map((link) => link.text())).toEqual([
      '我的需求',
      '我的合同',
      '我的发票',
      '我的已购',
      '过户与转移',
    ])
    const assetsLinks = groups
      .find((group) =>
        group.find('.user-workbench__menu-group-head').text().includes('资产与权益'),
      )!
      .findAll('.user-workbench__submenu-link')
    expect(assetsLinks.map((link) => link.text())).toEqual([
      '我的收藏',
      '优惠券中心',
      '积分中心',
      '我的权益',
      '勋章与邀请',
    ])
    expect(assetsLinks.find((link) => link.text() === '优惠券中心')?.attributes('href')).toBe(
      '/workbench/workbench-coupons',
    )
    wrapper.unmount()
  })

  it('开发者路由下整条侧边栏换成开发者菜单', async () => {
    const { wrapper } = await renderWorkbench('dev-resource-list')
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
    expect(devLinks.map((link) => link.text())).toEqual([
      '工作台总览',
      '资源项目',
      '接入客户端',
      'AI 需求助手',
      '需求大厅',
      '我的接单',
    ])
    // 财务中心与团队服务是折叠组（分组头自带组名），消息中心夹在分组之间
    expect(wrapper.findAll('.user-workbench__menu-group-head').map((head) => head.text())).toEqual([
      '财务中心',
      '团队服务',
      '消息中心',
    ])
    // 与钱有关的三条收进财务中心：收益钱包原是一级条目，「我的发票」原挂在用户模式的账户服务下，
    // 「打赏设置」原是一级条目，现在也移进来当子项（子项不渲染图标）。
    const finance = wrapper
      .findAll('.user-workbench__menu-group')
      .find((group) => group.find('.user-workbench__menu-group-head').text().includes('财务中心'))!
    expect(finance.findAll('.user-workbench__submenu-link').map((link) => link.text())).toEqual([
      '收益钱包',
      '我的发票',
      '打赏设置',
    ])
    expect(finance.findAll('.user-workbench__submenu-link')[0]?.attributes('href')).toBe(
      '/workbench/developer/wallet/overview',
    )
    expect(finance.findAll('.user-workbench__submenu-link')[1]?.attributes('href')).toBe(
      '/workbench/developer/invoices',
    )
    // 打赏设置移入财务中心后不再是一级条目：一级菜单里没有它，子菜单里有它
    expect(devLinks.some((link) => link.text().includes('打赏设置'))).toBe(false)
    expect(finance.findAll('.user-workbench__submenu-link')[2]?.attributes('href')).toBe(
      '/workbench/developer/tips',
    )
    // 财务中心在开发者模式下才出现，用户模式的账户服务里仍保留一条「我的发票」
    expect(text).not.toContain('账户服务')
    // 「财务中心」只出现一次：折叠组的分组头自己写着组名，上方不再顶小标题
    expect(text.match(/财务中心/g)).toHaveLength(1)
    // 「团队服务」只出现一次：折叠组的分组头自己写着组名，上方不再顶小标题
    expect(text.match(/团队服务/g)).toHaveLength(1)
    expect(text).toContain('我的团队')
    expect(text).toContain('团队资源')
    // 系统通知两种工作台都有这一条
    expect(text).toContain('系统通知')
    expect(text).not.toContain('工单中心')
    // 退出登录挂在系统通知下方，两种工作台共用
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
      { status: 'in_development' },
      { status: 'pending_final' },
      { status: 'completed' },
    ] as Awaited<ReturnType<typeof listMyRequirements>>)

    const dev = await renderWorkbench('dev-resource-list')
    const badge = dev.wrapper.find('.user-workbench__menu-link--badged .user-workbench__menu-badge')
    expect(badge.exists()).toBe(true)
    // 在途 = 未结单的两条（开发中 / 待付尾款），已结单的不算
    expect(badge.text()).toBe('2')
    dev.wrapper.unmount()

    const user = await renderWorkbench('workbench')
    expect(user.wrapper.find('.user-workbench__menu-badge').exists()).toBe(false)
    user.wrapper.unmount()
  })

  it('团队页面属于开发者工作台：进页不切回用户菜单，团队服务组自动展开', async () => {
    const { wrapper } = await renderWorkbench('workbench-teams')
    // 团队页面带 devArea，落在页面上时侧边栏仍是开发者菜单
    expect(wrapper.find('.user-workbench__brand-title').text()).toBe('开发者工作台')
    expect(sidebar(wrapper)).not.toContain('需求协作')
    // 开发者侧边栏第一个分组头是「财务中心」，团队服务排在它后面，按组名取那一个
    const head = menuGroupHead(wrapper, '团队服务')
    expect(head.text()).toContain('团队服务')
    // 当前页在该组内，进页时分组自动展开
    expect(head.attributes('aria-expanded')).toBe('true')
    expect(head.find('strong').text()).toBe('团队服务')
    wrapper.unmount()
  })
})
