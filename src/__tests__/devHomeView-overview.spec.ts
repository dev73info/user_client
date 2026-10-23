import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import {
  baseWallet,
  depositReady,
  facts,
  occurrences,
  primeDevHomeMocks,
  renderDevHome,
  requirementWithStatus,
  statCards,
  type DevHomeMocks,
} from './helpers/devHomeView'

/** 顶部读数条与两张列表：四格读数、接单状态分档、已接取需求单的排序与最近交付卡片上限。 */

const mocks = vi.hoisted(() => ({
  wallet: vi.fn(),
  withdrawalSetting: vi.fn(),
  createWithdrawal: vi.fn(),
  deposit: vi.fn(),
  requirements: vi.fn(),
  resources: vi.fn(),
  devAccess: vi.fn(),
  credit: vi.fn(),
})) satisfies DevHomeMocks

vi.mock('@/api/devWallet', () => ({
  getDevWalletOverview: mocks.wallet,
  getDevWithdrawalSetting: mocks.withdrawalSetting,
  createDevWithdrawalRequest: mocks.createWithdrawal,
  validateDevWithdrawalRequest: () => null,
}))
vi.mock('@/api/devOrderDeposit', () => ({ getDevOrderDepositStatus: mocks.deposit }))
vi.mock('@/api/devRequirements', () => ({ listMyRequirements: mocks.requirements }))
vi.mock('@/api/mcResources', () => ({ listMcResources: mocks.resources }))
// 充值弹窗会先查开发者协议与信用额度，这里只关心弹窗是否被拉起，两个接口给固定值即可
vi.mock('@/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth')>()),
  getDevAccessStatus: mocks.devAccess,
}))
vi.mock('@/api/devCredit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/devCredit')>()),
  getDevCreditSelf: mocks.credit,
}))

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
  it('把四个接口的汇总值渲染成顶部读数条与一张资金卡', async () => {
    const { wrapper } = await renderDevHome()
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

    // 资金卡：金色大数走余额口径，提现按钮就贴在它右侧，且是就地开窗的按钮（不做跳转）
    expect(wrapper.text()).toContain('可提现余额')
    expect(wrapper.text()).toContain('¥800.25')
    const withdrawAction = wrapper.find('.dev-home__money-action')
    expect(withdrawAction.element.tagName).toBe('BUTTON')
    expect(withdrawAction.text()).toContain('提现')

    // 提现口径只剩两个读数，收入口径的读数已经挪到大数位与曲线上
    expect(facts(wrapper)).toEqual(['待提现¥100.00', '已提现¥300.00'])

    // 「立即充值」仍是就地拉起弹窗的按钮，不做跳转
    expect(wrapper.find('.dev-home__deposit-action').element.tagName).toBe('BUTTON')
    wrapper.unmount()
  })

  it('读数条按接单状态分档：进行中=未结单，待交付=待付尾款，已完成=已结单', async () => {
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

  it('按更新时间倒序列出已接取需求单，只有绑定资源的需求单进最近交付', async () => {
    const { wrapper } = await renderDevHome()
    const rows = wrapper.findAll('.dev-home__project')
    // REQ-2 已完成但未终止，仍在总览列表里（终止态才从列表里剔除）
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('数据清洗插件定制')
    expect(rows[0]?.text()).toContain('REQ-1')
    expect(rows[0]?.text()).toContain('开发中')
    expect(rows[0]?.text()).toContain('¥3000.00')
    expect(rows[1]?.text()).toContain('爬虫小工具')
    expect(rows[1]?.text()).toContain('已完成')

    // 最近交付排成卡片：取资源标题与版本数，行内金额取该单的到账尾款；
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
    const { wrapper } = await renderDevHome()
    expect(wrapper.findAll('.dev-home__delivery')).toHaveLength(3)
    wrapper.unmount()
  })
})
