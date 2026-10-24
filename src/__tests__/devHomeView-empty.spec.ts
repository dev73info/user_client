import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import {
  baseWallet,
  primeDevHomeMocks,
  renderDevHome,
  statCards,
  type DevHomeMocks,
} from './helpers/devHomeView'

/** 真实空态：后端确实没有数据时才显示空态；`?mock=1` 不再铺任何演示数据。 */

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

describe('developer workbench empty states', () => {
  it('没有需求、资源与到账记录时给出空态', async () => {
    mocks.requirements.mockResolvedValue([])
    mocks.resources.mockResolvedValue([])
    mocks.wallet.mockResolvedValue({ ...baseWallet, recent_income: [] })

    const { wrapper } = await renderDevHome()

    expect(wrapper.find('.dev-home__projects').exists()).toBe(false)
    expect(wrapper.findAll('.dev-home__project')).toHaveLength(0)
    expect(wrapper.findAll('.dev-home__resource')).toHaveLength(0)
    expect(wrapper.text()).toContain('还没有资源')
    expect(wrapper.text()).toContain('还没有到账记录')
    // 读数是真实的 0，不是「没读到」的「—」
    const cards = statCards(wrapper)
    expect(cards[0]).toContain('0')
    wrapper.unmount()
  })

  it('空态文案只有主标题，不再补引导说明', async () => {
    mocks.requirements.mockResolvedValue([])
    mocks.resources.mockResolvedValue([])
    mocks.wallet.mockResolvedValue({ ...baseWallet, recent_income: [] })

    const { wrapper } = await renderDevHome()

    const empties = wrapper.findAll('.dev-home__main .dev-home__empty')
    expect(empties).toHaveLength(2)
    for (const empty of empties) {
      expect(empty.findAll('span')).toHaveLength(0)
      expect(empty.findAll('strong')).toHaveLength(1)
    }
    expect(wrapper.text()).not.toContain('去需求大厅接单后会显示在这里')
    wrapper.unmount()
  })

  it('地址上带 ?mock=1 也照旧读真实接口：演示数据已整体删除', async () => {
    const { wrapper } = await renderDevHome({ mock: '1' })

    expect(mocks.wallet).toHaveBeenCalledWith('test-token')
    expect(mocks.requirements).toHaveBeenCalledWith('test-token')
    expect(mocks.resources).toHaveBeenCalledWith('test-token')
    expect(wrapper.find('.dev-home__mock-hint').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('演示数据')
    wrapper.unmount()
  })
})
