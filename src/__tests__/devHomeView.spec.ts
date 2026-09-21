import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import DevHomeView from '@/views/DevHomeView.vue'

const mocks = vi.hoisted(() => ({
  wallet: vi.fn(),
  deposit: vi.fn(),
  requirements: vi.fn(),
  resources: vi.fn(),
  devAccess: vi.fn(),
  credit: vi.fn(),
}))

vi.mock('@/api/devWallet', () => ({ getDevWalletOverview: mocks.wallet }))
vi.mock('@/api/devOrderDeposit', () => ({ getDevOrderDepositStatus: mocks.deposit }))
vi.mock('@/api/devRequirements', () => ({ listMyRequirements: mocks.requirements }))
vi.mock('@/api/mcResources', () => ({ listMcResources: mocks.resources }))
// 充值弹窗会先查开发者协议与信用额度，这里只关心弹窗是否被拉起，两个接口给固定值即可
vi.mock('@/api/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/auth')>(),
  getDevAccessStatus: mocks.devAccess,
}))
vi.mock('@/api/devCredit', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/devCredit')>(),
  getDevCreditSelf: mocks.credit,
}))

const ROUTE_NAMES = ['dev-home', 'dev-wallet', 'dev-wallet-releases', 'dev-my-requirements', 'dev-requirement-hall', 'dev-resource-list']

const baseWallet = {
  total_income_cny: 1200.5,
  today_income_cny: 200,
  today_income_change_rate: 0,
  total_completed_orders: 3,
  active_requirement_count: 2,
  withdrawable_balance_cny: 800.25,
  pending_withdraw_cny: 100,
  paid_withdraw_cny: 300,
  recent_income: [{
    payment_id: 'p1',
    requirement_id: 'REQ-1',
    title: '数据清洗插件定制',
    customer: 'alice',
    amount_cny: 600,
    paid_at: '2026-09-10 12:00:00',
    requirement_status: 'completed',
  }],
}

const depositReady = {
  username: 'dev_flow',
  role: 'dev',
  has_paid_deposit: true,
  can_bind_requirement: true,
  total_paid_cny: 500,
  frozen_cny: 120,
  available_cny: 380,
  pending_refund_cny: 0,
  pending_withdraw_cny: 0,
  paid_withdraw_cny: 0,
  latest_order: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'dev_flow'
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})

  mocks.wallet.mockResolvedValue(baseWallet)
  mocks.deposit.mockResolvedValue(depositReady)
  mocks.devAccess.mockResolvedValue({ developer_agreement_signed: true })
  mocks.credit.mockResolvedValue(null)
  mocks.requirements.mockResolvedValue([
    {
      id: 1,
      requirement_id: 'REQ-1',
      bound_resource_id: 11,
      bound_resource_version_count: 2,
      created_time: '2026-09-01 09:00:00',
      creator: 'alice',
      title: '数据清洗插件定制',
      budget: 3000,
      payment_mode: 'platform_guarantee',
      status: 'in_development',
      updated_at: '2026-09-12 10:00:00',
    },
    {
      id: 2,
      requirement_id: 'REQ-2',
      bound_resource_id: null,
      bound_resource_version_count: null,
      created_time: '2026-09-02 09:00:00',
      creator: 'bob',
      title: '爬虫小工具',
      budget: 500,
      payment_mode: 'self_managed',
      status: 'completed',
      updated_at: '2026-09-11 10:00:00',
    },
  ])
  mocks.resources.mockResolvedValue([
    { id: 11, title: '数据清洗插件', visibility: 'published' },
    { id: 12, title: '无人接单的插件', visibility: 'draft' },
  ])
})

async function render(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ROUTE_NAMES.map((name) => ({ name, path: `/${name}`, component: { template: '<div />' } })),
  })
  await router.push({ name: 'dev-home', query })
  const wrapper = mount(DevHomeView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof render>>['wrapper']

/** 四格统计卡：读数是「标签 + 数字」两行，取整卡的 text 就够断言。 */
const statCards = (wrapper: Wrapper) =>
  wrapper.findAll('.dev-home__stat').map((card) => card.text())

/** 收入分析下沿的四个读数（待提现 / 已提现 / 今日收入 / 累计订单）。 */
const facts = (wrapper: Wrapper) =>
  wrapper.findAll('.dev-home__fact').map((fact) => fact.text())

/** 造一条只关心状态的最小接单，用来验证统计卡的分档口径。 */
function requirementWithStatus(id: number, status: string) {
  return {
    id,
    requirement_id: `REQ-${id}`,
    bound_resource_id: null,
    bound_resource_version_count: null,
    created_time: '2026-09-01 09:00:00',
    creator: 'alice',
    title: `接单 ${id}`,
    budget: 1000,
    payment_mode: 'platform_guarantee',
    status,
    updated_at: '2026-09-12 10:00:00',
  }
}

describe('developer workbench overview', () => {
  it('把四个接口的汇总值渲染成四格统计卡与两张资金卡', async () => {
    const { wrapper } = await render()
    expect(mocks.wallet).toHaveBeenCalledWith('test-token')
    expect(mocks.deposit).toHaveBeenCalledWith('test-token')
    expect(mocks.requirements).toHaveBeenCalledWith('test-token')
    expect(mocks.resources).toHaveBeenCalledWith('test-token')

    const cards = statCards(wrapper)
    expect(cards).toHaveLength(4)
    expect(cards[0]).toContain('进行中项目')
    // REQ-1 开发中算进行中，REQ-2 已完成不算
    expect(cards[0]).toContain('1')
    expect(cards[1]).toContain('已完成项目')
    expect(cards[1]).toContain('1')
    expect(cards[2]).toContain('待交付')
    expect(cards[2]).toContain('0')
    expect(cards[3]).toContain('累计收入')
    expect(cards[3]).toContain('¥1200.50')

    // 资金状态：金色大数走余额口径，提现按钮就贴在它右侧
    expect(wrapper.text()).toContain('可提现余额')
    expect(wrapper.text()).toContain('¥800.25')
    const withdrawAction = wrapper.find('.dev-home__money-action')
    expect(withdrawAction.attributes('href')).toBe('/dev-wallet')
    expect(withdrawAction.text()).toContain('提现')

    // 收入分析下沿四个读数：提现口径一对、收入口径一对
    expect(facts(wrapper)).toEqual([
      '待提现¥100.00',
      '已提现¥300.00',
      '今日收入¥200.00',
      '累计订单3',
    ])

    // 「立即充值」仍是就地拉起弹窗的按钮，不做跳转
    expect(wrapper.find('.dev-home__deposit-action').element.tagName).toBe('BUTTON')
    wrapper.unmount()
  })

  it('统计卡按接单状态分档：进行中=未结单，待交付=待付尾款，已完成=已结单', async () => {
    mocks.requirements.mockResolvedValue([
      requirementWithStatus(1, 'pending_deposit'),
      requirementWithStatus(2, 'deposit_paid'),
      requirementWithStatus(3, 'in_development'),
      requirementWithStatus(4, 'pending_final'),
      requirementWithStatus(5, 'pending_settlement'),
      requirementWithStatus(6, 'completed'),
      requirementWithStatus(7, 'cancelled'),
    ])
    const { wrapper } = await render()
    const cards = statCards(wrapper)

    // 进行中项目 = 未结单的五档（待付定金 / 待开发 / 开发中 / 待付尾款 / 待分账）
    expect(cards[0]).toContain('进行中项目')
    expect(cards[0]).toContain('5')
    expect(cards[1]).toContain('已完成项目')
    expect(cards[1]).toContain('1')
    expect(cards[2]).toContain('待交付')
    expect(cards[2]).toContain('1')
    expect(cards[3]).toContain('累计收入')
    expect(cards[3]).toContain('¥1200.50')
    wrapper.unmount()
  })

  it('按更新时间倒序列出已接取需求单，只有绑定资源的需求单进交付记录', async () => {
    const { wrapper } = await render()
    const rows = wrapper.findAll('.dev-home__project')
    // REQ-2 已完成但未终止，仍在总览列表里（终止态才从列表里剔除）
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('数据清洗插件定制')
    expect(rows[0]?.text()).toContain('REQ-1')
    expect(rows[0]?.text()).toContain('开发中')
    expect(rows[0]?.text()).toContain('¥3000.00')
    expect(rows[1]?.text()).toContain('爬虫小工具')
    expect(rows[1]?.text()).toContain('已完成')

    // 交付记录排成卡片：取资源标题与版本数，行内金额取该单的到账尾款；
    // 未绑定资源的需求单不出现
    const deliveries = wrapper.findAll('.dev-home__delivery')
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]?.text()).toContain('数据清洗插件')
    expect(deliveries[0]?.text()).toContain('REQ-1')
    expect(deliveries[0]?.text()).toContain('2 个版本')
    expect(deliveries[0]?.text()).toContain('¥600.00')
    expect(deliveries[0]?.find('.dev-home__delivery-check').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('无人接单的插件')
    wrapper.unmount()
  })

  it('交付卡片最多三张，多了交给「查看全部」', async () => {
    mocks.requirements.mockResolvedValue(
      [1, 2, 3, 4, 5].map((id) => ({
        ...requirementWithStatus(id, 'in_development'),
        bound_resource_id: 100 + id,
        bound_resource_version_count: id,
      })),
    )
    mocks.resources.mockResolvedValue(
      [1, 2, 3, 4, 5].map((id) => ({ id: 100 + id, title: `资源 ${id}`, visibility: 'published' })),
    )
    const { wrapper } = await render()
    expect(wrapper.findAll('.dev-home__delivery')).toHaveLength(3)
    wrapper.unmount()
  })

  it('资金状态给出可提现与待提现的占比，保证金单独一块', async () => {
    const { wrapper } = await render()
    // 可提现占比 800.25 / 900.25 ≈ 89%，剩下 11% 是待提现
    const track = wrapper.find('.dev-home__track')
    expect(track.attributes('aria-valuenow')).toBe('89')
    expect(wrapper.find('.dev-home__money-legend').text()).toContain('可提现')
    expect(wrapper.find('.dev-home__money-legend').text()).toContain('89%')
    expect(wrapper.find('.dev-home__money-legend').text()).toContain('待提现')
    expect(wrapper.find('.dev-home__money-legend').text()).toContain('11%')

    expect(wrapper.text()).toContain('可用保证金')
    expect(wrapper.text()).toContain('¥380.00')
    expect(wrapper.text()).toContain('冻结 ¥120.00')
    expect(wrapper.text()).toContain('累计充值 ¥500.00')
    wrapper.unmount()
  })

  it('保证金不足时给出提示，够用时不出提示', async () => {
    const ok = await render()
    expect(ok.wrapper.find('.dev-home__alert').exists()).toBe(false)
    ok.wrapper.unmount()

    mocks.deposit.mockResolvedValue({ ...depositReady, has_paid_deposit: false, can_bind_requirement: false })
    const blocked = await render()
    const alert = blocked.wrapper.find('.dev-home__alert')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('保证金不足，暂不可接单')
    expect(alert.attributes('role')).toBe('alert')
    // 接单资格异常时提示里的可用余额仍按接口返回值展示
    expect(alert.text()).toContain('¥380.00')
    blocked.wrapper.unmount()
  })

  it('充值按钮就地拉起充值弹窗，不再跳转收益钱包', async () => {
    mocks.deposit.mockResolvedValue({ ...depositReady, has_paid_deposit: false, can_bind_requirement: false })
    const { wrapper } = await render()
    const action = wrapper.find('.dev-home__alert-action')
    expect(action.element.tagName).toBe('BUTTON')
    expect(wrapper.find('.dev-recharge-dialog').exists()).toBe(false)

    await action.trigger('click')
    await flushPromises()
    expect(mocks.devAccess).toHaveBeenCalledWith('test-token')
    expect(wrapper.find('.dev-recharge-dialog').exists()).toBe(true)
    wrapper.unmount()
  })

  it('没有需求单与收入时给出空态', async () => {
    mocks.requirements.mockResolvedValue([])
    mocks.wallet.mockResolvedValue({ ...baseWallet, recent_income: [] })
    const { wrapper } = await render()
    expect(wrapper.find('.dev-home__projects').exists()).toBe(false)
    expect(wrapper.find('.dev-home__deliveries').exists()).toBe(false)
    expect(wrapper.text()).toContain('近 7 天没有到账记录')
    expect(wrapper.findAll('.dev-home__project')).toHaveLength(0)
    expect(wrapper.findAll('.dev-home__delivery')).toHaveLength(0)
    wrapper.unmount()
  })

  it('空态只留主标题，不再补引导说明', async () => {
    mocks.requirements.mockResolvedValue([])
    mocks.wallet.mockResolvedValue({ ...baseWallet, recent_income: [] })
    const { wrapper } = await render()

    // 两个主面板的空态各自只剩一行主标题，没有额外的 <span> 说明
    const empties = wrapper.findAll('.dev-home__main .dev-home__empty')
    expect(empties).toHaveLength(2)
    for (const empty of empties) {
      expect(empty.findAll('span')).toHaveLength(0)
      expect(empty.findAll('strong')).toHaveLength(1)
    }
    expect(wrapper.text()).not.toContain('去需求大厅接单后会显示在这里')
    expect(wrapper.text()).not.toContain('绑定资源项目并发布版本后会显示在这里')
    wrapper.unmount()
  })
})

describe('开发总览的演示数据开关', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('非 dev 模式即使开关打开也走真实接口', async () => {
    vi.stubEnv('MODE', 'production')
    vi.stubEnv('VITE_DEV_HOME_MOCK', 'true')

    const { wrapper } = await render({ mock: '1' })
    expect(mocks.requirements).toHaveBeenCalledWith('test-token')
    expect(wrapper.find('.dev-home__mock-hint').exists()).toBe(false)
    wrapper.unmount()
  })

  it('dev 模式带 ?mock=1 时铺演示数据且不请求任何接口', async () => {
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('VITE_DEV_HOME_MOCK', 'false')

    const { wrapper } = await render({ mock: '1' })
    expect(mocks.wallet).not.toHaveBeenCalled()
    expect(mocks.deposit).not.toHaveBeenCalled()
    expect(mocks.requirements).not.toHaveBeenCalled()
    expect(mocks.resources).not.toHaveBeenCalled()

    expect(wrapper.find('.dev-home__mock-hint').text()).toContain('演示数据')
    // 演示数据里的 5 条接单：3 条未结单、2 条已完成、1 条待付尾款
    const cards = statCards(wrapper)
    expect(cards[0]).toContain('3')
    expect(cards[1]).toContain('2')
    expect(cards[2]).toContain('1')
    expect(cards[3]).toContain('¥38600.00')

    // 5 条已接取需求单 + 3 条绑定了资源的交付卡（三张铺满一行），两个空态都不再出现
    expect(wrapper.findAll('.dev-home__project')).toHaveLength(5)
    expect(wrapper.findAll('.dev-home__delivery')).toHaveLength(3)
    expect(wrapper.text()).toContain('跨境电商订单同步插件定制')
    expect(wrapper.text()).toContain('企业微信审批流连接器')
    expect(wrapper.text()).not.toContain('当前筛选下没有项目')
    expect(wrapper.text()).not.toContain('当前筛选下没有交付记录')
    // 演示保证金是足的，不该出现阻断接单的警示条
    expect(wrapper.find('.dev-home__alert').exists()).toBe(false)
    wrapper.unmount()
  })
})
