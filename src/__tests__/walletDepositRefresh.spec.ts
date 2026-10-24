import { flushPromises, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DevWalletIncomeCard from '@/components/dev/DevWalletIncomeCard.vue'
import DevWalletView from '@/views/DevWalletView.vue'

/**
 * 收益钱包页：自动提现开关必须由服务端确认后才动。
 *
 * 这个文件名保留着历史原因（原先还覆盖「保证金台账 5 秒轮询 / 回到页面节流」那一套）。
 * 预付保证金那套端点（`developer-order-deposit*`）在当前契约里不存在，整块功能已删除，
 * 相关用例随功能一起删；剩下这两条钉的是 `useDevWalletOverview` 的开关口径。
 */
const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  setting: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ fullPath: '/workbench/developer/wallet/overview' }),
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: 'test-token', hydrate: vi.fn() }),
}))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast =
    (type: 'success' | 'error' | 'warning' | 'info') =>
    (message: string): void =>
      mocks.toast(message, type)
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: toast('success'),
      error: toast('error'),
      warning: toast('warning'),
      info: toast('info'),
    },
  }
})
vi.mock('@/api/devWallet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/devWallet')>()),
  getDevWalletOverview: mocks.overview,
  getDevWithdrawalBalance: vi.fn().mockResolvedValue({
    income_fen: 0,
    withdrawn_fen: 0,
    withdrawable_fen: 0,
  }),
  updateDevWithdrawalSetting: mocks.setting,
}))

function mountWallet() {
  return shallowMount(DevWalletView, {
    global: {
      config: { warnHandler: () => {} },
      // 开关在 TCard 里：桩默认不渲染默认插槽，不打开就找不到页面里的元素
      renderStubDefaultSlot: true,
      stubs: {
        TTable: { name: 'TTable', props: ['data'], template: '<div />' },
        TPagination: {
          name: 'TPagination',
          props: ['currentPage', 'pageSize', 'total'],
          template: '<div />',
        },
        TSelect: { name: 'TSelect', props: ['modelValue'], template: '<div />' },
        // 自动提现开关在「接单收入」卡里，这一张卡按真实组件渲染，
        // 否则桩里的开关根本不存在，两条关于开关的用例就点不到东西
        DevWalletIncomeCard: false,
        // 开关按真实用法点击触发，缺了 @update:model-value 绑定时点不动，这条用例就红
        TSwitch: {
          name: 'TSwitch',
          props: ['modelValue', 'loading', 'disabled'],
          emits: ['update:modelValue'],
          template: `<button class="auto-withdraw-switch" @click="$emit('update:modelValue', !modelValue)" />`,
        },
      },
    },
  })
}

function walletState(wrapper: ReturnType<typeof mountWallet>): Record<string, unknown> {
  return (wrapper.vm.$ as unknown as { setupState: Record<string, unknown> }).setupState
}

/** 「接单收入」卡上渲染出来的自动提现开关值（卡是子组件，状态经 props 下去） */
function autoWithdrawSwitchValue(wrapper: ReturnType<typeof mountWallet>): boolean {
  return wrapper.getComponent(DevWalletIncomeCard).props('autoWithdrawEnabled') as boolean
}

describe('wallet auto-withdraw switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.overview.mockResolvedValue({ recent_income: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('toggles auto-withdraw through the server instead of flipping the switch locally', async () => {
    let confirmSetting: (setting: unknown) => void = () => {}
    mocks.setting.mockReturnValue(
      new Promise((resolve) => {
        confirmSetting = resolve
      }),
    )
    const wrapper = mountWallet()
    await flushPromises()

    await wrapper.get('.auto-withdraw-switch').trigger('click')
    await flushPromises()
    expect(mocks.setting).toHaveBeenCalledExactlyOnceWith('test-token', true)
    // 等后端确认期间开关只进 loading，状态不动，避免连点
    expect(walletState(wrapper).autoWithdrawSaving).toBe(true)

    confirmSetting({ auto_withdraw_enabled: true, payout_channel_ready: true })
    await flushPromises()
    expect(walletState(wrapper).autoWithdrawSaving).toBe(false)
    // 开关值只由服务端返回的 withdrawalSetting 推导，所以这里直接看卡片上渲染出来的那一格
    expect(autoWithdrawSwitchValue(wrapper)).toBe(true)
    wrapper.unmount()
  })

  it('keeps the switch in place and reports the reason when the server refuses', async () => {
    mocks.setting.mockRejectedValue(new Error('出款通道未就绪'))
    const wrapper = mountWallet()
    await flushPromises()

    await wrapper.get('.auto-withdraw-switch').trigger('click')
    await flushPromises()

    expect(mocks.toast).toHaveBeenCalledWith('出款通道未就绪', 'error')
    expect(walletState(wrapper).autoWithdrawSaving).toBe(false)
    // 服务端拒绝时开关不翻转：开关值只由 withdrawalSetting 推导，请求失败就停在原位
    expect(autoWithdrawSwitchValue(wrapper)).toBe(false)
    wrapper.unmount()
  })
})
