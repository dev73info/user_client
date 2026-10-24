import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import {
  primeDevHomeMocks,
  renderDevHome,
  statCards,
  type DevHomeMocks,
} from './helpers/devHomeView'

/**
 * 加载失败时的样子：说清楚失败原因 + 给重试，读数是「—」，绝不把失败画成
 * 「暂无数据」或一串 0（那等于替后端回答「你什么都没有」）。
 */

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
vi.mock('ui_73info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ui_73info')>()),
  TMessage: { error: vi.fn(), success: vi.fn() },
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

describe('developer workbench load failure', () => {
  it('三接口任意一个失败都给出后端文案与重试，读数是「—」', async () => {
    mocks.requirements.mockRejectedValue(new Error('需求服务暂时不可用'))

    const { wrapper } = await renderDevHome()

    const alert = wrapper.find('.dev-home__error')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toContain('需求服务暂时不可用')

    // 读数是「—」：不能把「没读到」写成 0
    const cards = statCards(wrapper)
    expect(cards[0]).toContain('—')
    expect(cards[2]).toContain('—')
    // 曲线与到账明细整块不出现，避免「近 7 天没有到账记录」冒充结论
    expect(wrapper.find('.dev-home__chart').exists()).toBe(false)
    expect(wrapper.find('.dev-home__incomes').exists()).toBe(false)
    wrapper.unmount()
  })

  it('重试按钮再拉一次，成功后错误条消失', async () => {
    mocks.wallet.mockRejectedValueOnce(new Error('网关超时'))

    const { wrapper } = await renderDevHome()
    expect(wrapper.find('.dev-home__error').exists()).toBe(true)

    // 第二次起恢复正常
    primeDevHomeMocks(mocks)
    await wrapper.find('.dev-home__error .dev-btn').trigger('click')
    await flushPromises()

    expect(wrapper.find('.dev-home__error').exists()).toBe(false)
    expect(statCards(wrapper)[0]).toContain('1')
    wrapper.unmount()
  })
})
