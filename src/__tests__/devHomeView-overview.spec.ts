import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import {
  primeDevHomeMocks,
  renderDevHome,
  requirementWithStatus,
  statCards,
  type DevHomeMocks,
} from './helpers/devHomeView'

/** 顶部三档读数、四个跳转入口、我的需求与我的资源两张卡。 */

const mocks = vi.hoisted(() => ({
  wallet: vi.fn(),
  withdrawalBalance: vi.fn(),
  withdrawalSetting: vi.fn(),
  withdrawalConfig: vi.fn(),
  createWithdrawal: vi.fn(),
  requirements: vi.fn(),
  resources: vi.fn(),
})) satisfies DevHomeMocks

// 只替掉取数，其余常量与纯函数沿用真实现（提现弹窗要读 WITHDRAW_NOTE_MAX_LEN 之类的导出）
vi.mock('@/api/devWallet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/devWallet')>()),
  getDevWalletOverview: mocks.wallet,
  getDevWithdrawalBalance: mocks.withdrawalBalance,
  getDevWithdrawalSetting: mocks.withdrawalSetting,
  getDevWithdrawalConfig: mocks.withdrawalConfig,
  createDevWithdrawalRequest: mocks.createWithdrawal,
}))
vi.mock('@/api/devRequirements', () => ({ listMyRequirements: mocks.requirements }))
vi.mock('@/api/mcResources', () => ({ listTeamResources: mocks.resources }))

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'dev_flow'
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  primeDevHomeMocks(mocks)
})

describe('developer workbench overview', () => {
  it('三档读数来自「我的需求」这份契约列表，三个端点各读一次', async () => {
    const { wrapper } = await renderDevHome()
    expect(mocks.wallet).toHaveBeenCalledWith('test-token')
    expect(mocks.requirements).toHaveBeenCalledWith('test-token')
    expect(mocks.resources).toHaveBeenCalledWith('test-token')

    const cards = statCards(wrapper)
    expect(cards).toHaveLength(3)
    // REQ-1 开发中算进行中与待交付，REQ-2 已完成只算已结单
    expect(cards[0]).toContain('进行中项目')
    expect(cards[0]).toContain('1')
    expect(cards[1]).toContain('待交付')
    expect(cards[1]).toContain('1')
    expect(cards[2]).toContain('已完成项目')
    expect(cards[2]).toContain('1')
    wrapper.unmount()
  })

  it('读数口径按 status 分档：进行中=在途五档，待交付=开发中，已完成=已结单', async () => {
    mocks.requirements.mockResolvedValue([
      requirementWithStatus(1, 'pending_deposit'),
      requirementWithStatus(2, 'deposit_paid'),
      requirementWithStatus(3, 'in_development'),
      requirementWithStatus(4, 'pending_final'),
      requirementWithStatus(5, 'pending_settlement'),
      requirementWithStatus(6, 'completed'),
      requirementWithStatus(7, 'cancelled'),
    ])
    const { wrapper } = await renderDevHome()
    const cards = statCards(wrapper)

    expect(cards[0]).toContain('5')
    expect(cards[1]).toContain('1')
    expect(cards[2]).toContain('1')
    wrapper.unmount()
  })

  it('四个跳转入口指向契约对应页面，不靠角色判断显隐', async () => {
    const { wrapper } = await renderDevHome()
    const entries = wrapper.findAll('.dev-home__entry')

    expect(entries.map((entry) => entry.text())).toEqual(['需求大厅', '我的需求', '钱包', '资源'])
    expect(entries.map((entry) => entry.attributes('href'))).toEqual([
      '/dev-requirement-hall',
      '/dev-my-requirements',
      '/dev-wallet',
      '/dev-resource-list',
    ])
    wrapper.unmount()
  })

  it('按接单时间倒序列出我的需求，终止态不进总览', async () => {
    mocks.requirements.mockResolvedValue([
      requirementWithStatus(1, 'in_development', { budget: 3000 }),
      requirementWithStatus(2, 'completed', {
        payment_mode: 'self_managed',
        developer_bound_at: '2026-09-20 10:00:00',
      }),
      requirementWithStatus(3, 'cancelled'),
    ])
    const { wrapper } = await renderDevHome()
    const rows = wrapper.findAll('.dev-home__project')

    expect(rows).toHaveLength(2)
    // REQ-2 的接单时间更晚，排在最前
    expect(rows[0]?.text()).toContain('接单 2')
    expect(rows[0]?.text()).toContain('已完成')
    expect(rows[1]?.text()).toContain('REQ-1')
    expect(rows[1]?.text()).toContain('开发中')
    expect(rows[1]?.text()).toContain('¥3000.00')
    // 时间列取契约里的接单时间，不读契约没有的 updated_at
    expect(rows[1]?.text()).toContain('接单于')
    wrapper.unmount()
  })

  it('我的资源列出标题、平台与可见性，草稿不画成已发布', async () => {
    const { wrapper } = await renderDevHome()
    const rows = wrapper.findAll('.dev-home__resource')

    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('数据清洗插件')
    expect(rows[0]?.text()).toContain('已发布')
    expect(rows[0]?.text()).toContain('python')
    expect(rows[1]?.text()).toContain('未发布')
    wrapper.unmount()
  })
})
