import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import {
  baseWallet,
  facts,
  occurrences,
  primeDevHomeMocks,
  renderDevHome,
  type DevHomeMocks,
} from './helpers/devHomeView'

/** 右栏那张资金卡：收入 / 提现口径 / 近期到账，以及就地拉起的提现弹窗。 */

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

describe('developer workbench funds card', () => {
  it('收入、提现与近期到账在同一张卡里，同一笔钱不重复报数', async () => {
    const { wrapper } = await renderDevHome()
    const card = wrapper.find('.dev-home__aside .dev-home__panel')
    expect(wrapper.findAll('.dev-home__aside .dev-home__panel')).toHaveLength(1)

    // 收入段：今日收入占大数位，环比跟在旁边，曲线单独挂在「近 7 天到账」标签下
    const incomeHead = wrapper.find('.dev-home__income-head')
    expect(incomeHead.text()).toContain('今日收入')
    expect(incomeHead.text()).toContain('¥200.00')
    expect(wrapper.find('.dev-home__group-label').text()).toContain('近 7 天到账')

    // 「可提现 / 待提现 / 今日收入」各只报一次
    const cardText = card.text()
    expect(occurrences(cardText, '今日收入')).toBe(1)
    expect(occurrences(cardText, '可提现余额')).toBe(1)
    expect(occurrences(cardText, '待提现')).toBe(1)

    expect(facts(wrapper)).toEqual(['待提现¥100.00', '已提现¥300.00'])
    wrapper.unmount()
  })

  it('近期到账列出实收金额与需求编号，不显示保证金那一套', async () => {
    const { wrapper } = await renderDevHome()

    const rows = wrapper.findAll('.dev-home__income')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text()).toContain('数据清洗插件定制')
    expect(rows[0]?.text()).toContain('¥600.00')
    expect(rows[0]?.text()).toContain('REQ-1')
    expect(rows[0]?.text()).toContain('alice')

    // 预付保证金没有契约，整块已删除
    expect(wrapper.text()).not.toContain('可用保证金')
    expect(wrapper.find('.dev-home__deposit').exists()).toBe(false)
    wrapper.unmount()
  })

  it('提现按钮就地拉起提现弹窗，不再跳转收益钱包', async () => {
    const { wrapper } = await renderDevHome()
    const action = wrapper.find('.dev-home__money-action')
    expect(action.element.tagName).toBe('BUTTON')
    expect(wrapper.find('.dev-dialog').exists()).toBe(false)

    await action.trigger('click')
    await flushPromises()
    // 弹窗自己拉一次额度、门禁与单笔限额：用此刻的服务端数据做前置校验
    expect(mocks.withdrawalBalance).toHaveBeenCalledWith('test-token')
    expect(mocks.withdrawalSetting).toHaveBeenCalledWith('test-token')
    expect(mocks.withdrawalConfig).toHaveBeenCalledWith('test-token')
    expect(wrapper.find('.dev-dialog.t73-dialog').exists()).toBe(true)
    expect(wrapper.text()).toContain('申请提现')
    wrapper.unmount()
  })

  it('钱包读数没读到时显示「—」而不是 ¥0.00', async () => {
    mocks.wallet.mockResolvedValue({
      ...baseWallet,
      withdrawable_balance_cny: null,
      today_income_cny: null,
    })
    const { wrapper } = await renderDevHome()

    expect(wrapper.find('.dev-home__income-head').text()).toContain('—')
    expect(wrapper.find('.dev-home__money-figure').text()).toContain('—')
    wrapper.unmount()
  })
})
