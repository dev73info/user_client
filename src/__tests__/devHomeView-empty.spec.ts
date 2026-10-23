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

/** 空态（只剩主标题）与演示数据开关（?mock=1 只在 dev 模式生效）。 */

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

describe('developer workbench empty states', () => {
  it('没有需求单与收入时给出空态', async () => {
    mocks.requirements.mockResolvedValue([])
    mocks.wallet.mockResolvedValue({ ...baseWallet, recent_income: [] })
    const { wrapper } = await renderDevHome()
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
    const { wrapper } = await renderDevHome()

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

  describe('开发总览的演示数据开关', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('非 dev 模式即使开关打开也走真实接口', async () => {
      vi.stubEnv('MODE', 'production')
      vi.stubEnv('VITE_DEV_HOME_MOCK', 'true')

      const { wrapper } = await renderDevHome({ mock: '1' })
      expect(mocks.requirements).toHaveBeenCalledWith('test-token')
      expect(wrapper.find('.dev-home__mock-hint').exists()).toBe(false)
      wrapper.unmount()
    })

    it('dev 模式带 ?mock=1 时铺演示数据且不请求任何接口', async () => {
      vi.stubEnv('MODE', 'development')
      vi.stubEnv('VITE_DEV_HOME_MOCK', 'false')

      const { wrapper } = await renderDevHome({ mock: '1' })
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
      expect(wrapper.find('.dev-notice').exists()).toBe(false)
      wrapper.unmount()
    })
  })
})
