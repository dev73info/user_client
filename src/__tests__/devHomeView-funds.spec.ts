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

/** 右栏那张资金卡：合并后的收入 / 提现 / 保证金口径、保证金不足提示、两个就地弹窗。 */

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

describe('developer workbench funds card', () => {
  it('收入、提现与保证金合并成一张资金卡，同一笔钱不再重复报数', async () => {
    const { wrapper } = await renderDevHome()
    // 合并前是「收入分析」+「资金状态」两张卡，现在右栏只有一张
    const card = wrapper.find('.dev-home__aside .dev-home__panel')
    expect(wrapper.findAll('.dev-home__aside .dev-home__panel')).toHaveLength(1)

    // 收入段：今日收入占大数位，环比跟在旁边，曲线单独挂在「近 7 天到账」标签下
    const incomeHead = wrapper.find('.dev-home__income-head')
    expect(incomeHead.text()).toContain('今日收入')
    expect(incomeHead.text()).toContain('¥200.00')
    expect(wrapper.find('.dev-home__group-label').text()).toContain('近 7 天到账')

    // 每个口径在整张卡里只出现一次：累计收入归顶部四格统计卡，
    // 「可提现 / 待提现」的比例条与图例说的还是这两个数，已删
    const cardText = card.text()
    expect(occurrences(cardText, '今日收入')).toBe(1)
    expect(occurrences(cardText, '可提现')).toBe(1)
    expect(occurrences(cardText, '待提现')).toBe(1)
    expect(cardText).not.toContain('总收入')
    expect(cardText).not.toContain('累计订单')
    expect(wrapper.find('.dev-home__track').exists()).toBe(false)
    expect(wrapper.find('.dev-home__money-legend').exists()).toBe(false)

    // 保证金仍是同一张卡的下沿一段
    expect(cardText).toContain('可用保证金')
    expect(cardText).toContain('¥380.00')
    expect(cardText).toContain('冻结 ¥120.00')
    expect(cardText).toContain('累计充值 ¥500.00')
    wrapper.unmount()
  })

  it('保证金不足时给出提示，够用时不出提示', async () => {
    const ok = await renderDevHome()
    expect(ok.wrapper.find('.dev-notice').exists()).toBe(false)
    // 够用时卡片里给一个正向状态，不必靠「没有警示条」反推
    expect(ok.wrapper.find('.dev-home__deposit-head .dev-chip').text()).toBe('可接单')
    ok.wrapper.unmount()

    mocks.deposit.mockResolvedValue({
      ...depositReady,
      has_paid_deposit: false,
      can_bind_requirement: false,
    })
    const blocked = await renderDevHome()
    const alert = blocked.wrapper.find('.dev-notice')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('保证金不足，暂不可接单')
    expect(alert.attributes('role')).toBe('alert')
    // 接单资格异常时提示里的可用余额仍按接口返回值展示，保证金块里的状态胶囊同步变金
    expect(alert.text()).toContain('¥380.00')
    expect(blocked.wrapper.find('.dev-home__deposit-head .dev-chip').text()).toBe('保证金不足')
    blocked.wrapper.unmount()
  })

  it('充值按钮就地拉起充值弹窗，不再跳转收益钱包', async () => {
    mocks.deposit.mockResolvedValue({
      ...depositReady,
      has_paid_deposit: false,
      can_bind_requirement: false,
    })
    const { wrapper } = await renderDevHome()
    const action = wrapper.find('.dev-notice__action .dev-btn')
    expect(action.element.tagName).toBe('BUTTON')
    expect(wrapper.find('.dev-recharge-dialog').exists()).toBe(false)

    await action.trigger('click')
    await flushPromises()
    expect(mocks.devAccess).toHaveBeenCalledWith('test-token')
    expect(wrapper.find('.dev-recharge-dialog').exists()).toBe(true)
    wrapper.unmount()
  })

  it('提现按钮就地拉起提现弹窗，不再跳转收益钱包', async () => {
    mocks.withdrawalSetting.mockResolvedValue({
      auto_withdraw_enabled: false,
      payout_channel_ready: true,
      payout_schedule_note: 'T+1 到账，免手续费',
    })
    const { wrapper } = await renderDevHome()
    const action = wrapper.find('.dev-home__money-action')
    expect(action.element.tagName).toBe('BUTTON')
    expect(wrapper.find('.dev-dialog').exists()).toBe(false)

    await action.trigger('click')
    await flushPromises()
    // 弹窗自己拉一次余额与通道状态：用此刻的服务端数据做前置校验
    expect(mocks.wallet).toHaveBeenCalledTimes(2)
    expect(mocks.withdrawalSetting).toHaveBeenCalledWith('test-token')
    expect(wrapper.find('.dev-dialog.t73-dialog').exists()).toBe(true)
    expect(wrapper.text()).toContain('申请提现')
    wrapper.unmount()
  })
})
