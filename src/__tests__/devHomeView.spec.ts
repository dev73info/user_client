import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import DevHomeView from '@/views/DevHomeView.vue'

const mocks = vi.hoisted(() => ({
  wallet: vi.fn(),
  deposit: vi.fn(),
  requirements: vi.fn(),
  resources: vi.fn(),
}))

vi.mock('@/api/devWallet', () => ({ getDevWalletOverview: mocks.wallet }))
vi.mock('@/api/devOrderDeposit', () => ({ getDevOrderDepositStatus: mocks.deposit }))
vi.mock('@/api/devRequirements', () => ({ listMyRequirements: mocks.requirements }))
vi.mock('@/api/mcResources', () => ({ listMcResources: mocks.resources }))

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

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ROUTE_NAMES.map((name) => ({ name, path: `/${name}`, component: { template: '<div />' } })),
  })
  await router.push({ name: 'dev-home' })
  const wrapper = mount(DevHomeView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

const statCards = (wrapper: Awaited<ReturnType<typeof render>>['wrapper']) =>
  wrapper.findAll('.dev-home__stat').map((card) => card.text())

describe('developer workbench overview', () => {
  it('把四个接口的汇总值渲染成可跳转的统计卡', async () => {
    const { wrapper } = await render()
    expect(mocks.wallet).toHaveBeenCalledWith('test-token')
    expect(mocks.deposit).toHaveBeenCalledWith('test-token')
    expect(mocks.requirements).toHaveBeenCalledWith('test-token')
    expect(mocks.resources).toHaveBeenCalledWith('test-token')

    const cards = statCards(wrapper)
    expect(cards).toHaveLength(4)
    expect(cards[0]).toContain('接单收入')
    expect(cards[0]).toContain('¥1200.50')
    expect(cards[0]).toContain('今日 ¥200.00')
    expect(cards[1]).toContain('可提现余额')
    expect(cards[1]).toContain('¥800.25')
    expect(cards[1]).toContain('待提现 ¥100.00')
    expect(cards[2]).toContain('进行中接单')
    expect(cards[2]).toContain('2')
    expect(cards[2]).toContain('已完成 3 单')
    expect(cards[3]).toContain('已接取需求')
    expect(cards[3]).toContain('累计交付 2 个版本')

    expect(wrapper.findAll('.dev-home__stat').map((card) => card.attributes('href')))
      .toEqual(['/dev-wallet', '/dev-wallet', '/dev-my-requirements', '/dev-wallet-releases'])
    wrapper.unmount()
  })

  it('按更新时间倒序列出已接取需求单，只有绑定资源的需求单进交付记录', async () => {
    const { wrapper } = await render()
    const rows = wrapper.findAll('.dev-home__row')
    // 需求单 2 行 + 交付记录 1 行（只有 REQ-1 绑定了资源）
    expect(rows).toHaveLength(3)
    expect(rows[0]?.text()).toContain('数据清洗插件定制')
    expect(rows[0]?.text()).toContain('REQ-1')
    expect(rows[0]?.text()).toContain('开发中')
    expect(rows[0]?.text()).toContain('¥3000.00')
    expect(rows[1]?.text()).toContain('爬虫小工具')
    expect(rows[1]?.text()).toContain('已完成')

    // 交付记录取资源标题与版本数，未绑定资源的需求单不出现
    expect(rows[2]?.text()).toContain('数据清洗插件')
    expect(rows[2]?.text()).toContain('2 个版本')
    expect(wrapper.text()).not.toContain('无人接单的插件')
    wrapper.unmount()
  })

  it('渲染保证金面板与最近收入', async () => {
    const { wrapper } = await render()
    expect(wrapper.text()).toContain('接单保证金')
    expect(wrapper.text()).toContain('¥380.00')
    expect(wrapper.text()).toContain('¥120.00')
    expect(wrapper.text()).toContain('¥500.00')
    expect(wrapper.text()).toContain('最近收入')
    expect(wrapper.text()).toContain('数据清洗插件定制')
    expect(wrapper.text()).toContain('alice')
    expect(wrapper.text()).toContain('¥600.00')
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
    expect(alert.find('a').attributes('href')).toBe('/dev-wallet')
    blocked.wrapper.unmount()
  })

  it('没有需求单与收入时给出空态', async () => {
    mocks.requirements.mockResolvedValue([])
    mocks.wallet.mockResolvedValue({ ...baseWallet, recent_income: [] })
    const { wrapper } = await render()
    expect(wrapper.text()).toContain('暂无已接取需求')
    expect(wrapper.text()).toContain('暂无交付记录')
    expect(wrapper.text()).toContain('暂无收入记录')
    expect(wrapper.findAll('.dev-home__row')).toHaveLength(0)
    wrapper.unmount()
  })
})
