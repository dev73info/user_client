import { flushPromises, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DevWalletView from '@/views/DevWalletView.vue'

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  status: vi.fn(),
  toast: vi.fn(),
  setting: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ fullPath: '/workbench/developer/wallet/overview' }),
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ token: 'test-token', hydrate: vi.fn() }) }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ showToast: mocks.toast }) }))
vi.mock('@/api/devOrderDeposit', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/devOrderDeposit')>(),
  getDevOrderDepositStatus: mocks.status,
  getDevOrderDepositWithdrawalSummary: mocks.summary,
}))
vi.mock('@/api/devWallet', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/devWallet')>(),
  getDevWalletOverview: vi.fn().mockResolvedValue({ recent_income: [] }),
  updateDevWithdrawalSetting: mocks.setting,
}))
vi.mock('@/api/devCredit', () => ({ getDevCreditSelf: vi.fn().mockResolvedValue(null) }))

function mountWallet() {
  return shallowMount(DevWalletView, { global: {
    config: { warnHandler: () => {} },
    // 开关在 TCard 里：桩默认不渲染默认插槽，不打开就找不到页面里的元素
    renderStubDefaultSlot: true,
    stubs: {
      TTable: { name: 'TTable', props: ['data'], template: '<div />' },
      TPagination: { name: 'TPagination', props: ['currentPage', 'pageSize', 'total'], template: '<div />' },
      TSelect: { name: 'TSelect', props: ['modelValue'], template: '<div />' },
      // 开关按真实用法点击触发，缺了 @update:model-value 绑定时点不动，这条用例就红
      TSwitch: {
        name: 'TSwitch',
        props: ['modelValue', 'loading', 'disabled'],
        emits: ['update:modelValue'],
        template: `<button class="auto-withdraw-switch" @click="$emit('update:modelValue', !modelValue)" />`,
      },
    },
  } })
}

function walletState(wrapper: ReturnType<typeof mountWallet>): Record<string, unknown> {
  return (wrapper.vm.$ as unknown as { setupState: Record<string, unknown> }).setupState
}

describe('wallet deposit status refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.status.mockResolvedValue({ total_paid_cny: 2 })
    mocks.summary.mockResolvedValue({ withdrawals: [{ status: 'payout_processing' }] })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('refreshes pending records and balances until the backend reports paid', async () => {
    const wrapper = mountWallet()
    await flushPromises()
    mocks.summary.mockResolvedValue({ withdrawals: [{ status: 'paid' }] })
    await vi.advanceTimersByTimeAsync(5000)
    await flushPromises()
    expect(mocks.summary).toHaveBeenCalledTimes(2)
    expect(mocks.status).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(5000)
    expect(mocks.summary).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('keeps the table loading state untouched for background refreshes', async () => {
    mocks.summary.mockResolvedValue({ withdrawals: [{ status: 'payout_processing' }] })
    const wrapper = mountWallet()
    await flushPromises()
    expect(walletState(wrapper).depositLoading).toBe(false)

    await vi.advanceTimersByTimeAsync(5000)
    await flushPromises()
    expect(mocks.summary).toHaveBeenCalledTimes(2)
    // 后台轮询不得点亮表格 loading 遮罩，否则会持续闪烁
    expect(walletState(wrapper).depositLoading).toBe(false)
    wrapper.unmount()
  })

  it('slows polling when the only pending record needs manual handling', async () => {
    mocks.summary.mockResolvedValue({ withdrawals: [{ status: 'payout_failed' }] })
    const wrapper = mountWallet()
    await flushPromises()
    expect(mocks.summary).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10000)
    await flushPromises()
    expect(mocks.summary).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(20000)
    await flushPromises()
    expect(mocks.summary).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('refreshes on return to the page, throttles repeat events and removes listeners on unmount', async () => {
    const wrapper = mountWallet()
    await flushPromises()
    expect(mocks.summary).toHaveBeenCalledTimes(1)

    // 刚加载完就触发的 focus / visibilitychange 应被节流，避免重复请求
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(mocks.summary).toHaveBeenCalledTimes(1)

    // 超过节流窗口后回到页面才真正刷新
    await vi.advanceTimersByTimeAsync(3000)
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(mocks.summary).toHaveBeenCalledTimes(2)

    // 轮询心跳同样遵守节流：t=5000 的心跳距上次刷新（t=3000）不足 5s 会被跳过，
    // t=10000 的心跳才真正发起请求，因此不会与回到页面的刷新叠加
    await vi.advanceTimersByTimeAsync(7000)
    await flushPromises()
    expect(mocks.summary).toHaveBeenCalledTimes(3)

    wrapper.unmount()
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(10000)
    expect(mocks.summary).toHaveBeenCalledTimes(3)
  })

  it('does not poll while hidden or display repeated background errors', async () => {
    const wrapper = mountWallet()
    await flushPromises()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await vi.advanceTimersByTimeAsync(5000)
    expect(mocks.summary).toHaveBeenCalledTimes(1)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    mocks.summary.mockRejectedValueOnce(new Error('offline'))
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(mocks.toast).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('paginates records, resets on page size change and clamps after refresh', async () => {
    const records = Array.from({ length: 23 }, (_, index) => ({
      withdrawal_id: `withdrawal-${index}`, status: 'paid', amount_cny: 1,
    }))
    mocks.summary.mockResolvedValue({ withdrawals: records })
    const wrapper = mountWallet()
    await flushPromises()
    const table = wrapper.findAllComponents({ name: 'TTable' })[0]!
    const pagination = wrapper.findComponent({ name: 'TPagination' })
    expect(table.props('data')).toEqual(records.slice(0, 10))
    expect(pagination.props('total')).toBe(23)
    pagination.vm.$emit('update:current-page', 3)
    await flushPromises()
    expect(table.props('data')).toEqual(records.slice(20))
    wrapper.findComponent({ name: 'TSelect' }).vm.$emit('update:modelValue', 20)
    await flushPromises()
    expect(pagination.props('currentPage')).toBe(1)
    expect(table.props('data')).toEqual(records.slice(0, 20))
    pagination.vm.$emit('update:current-page', 2)
    await flushPromises()
    mocks.summary.mockResolvedValue({ withdrawals: records.slice(0, 2) })
    await vi.advanceTimersByTimeAsync(3000)
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(pagination.props('currentPage')).toBe(1)
    expect(table.props('data')).toEqual(records.slice(0, 2))
    mocks.summary.mockResolvedValue({ withdrawals: [] })
    await vi.advanceTimersByTimeAsync(3000)
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(pagination.props('currentPage')).toBe(1)
    expect(pagination.props('total')).toBe(0)
    expect(table.props('data')).toEqual([])
    wrapper.unmount()
  })

  it('toggles auto-withdraw through the server instead of flipping the switch locally', async () => {
    let confirmSetting: (setting: unknown) => void = () => {}
    mocks.setting.mockReturnValue(new Promise((resolve) => { confirmSetting = resolve }))
    mocks.summary.mockResolvedValue({ withdrawals: [] })
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
    expect((walletState(wrapper).withdrawalSetting as { auto_withdraw_enabled: boolean })
      .auto_withdraw_enabled).toBe(true)
    wrapper.unmount()
  })

  it('keeps the switch in place and reports the reason when the server refuses', async () => {
    mocks.setting.mockRejectedValue(new Error('出款通道未就绪'))
    mocks.summary.mockResolvedValue({ withdrawals: [] })
    const wrapper = mountWallet()
    await flushPromises()

    await wrapper.get('.auto-withdraw-switch').trigger('click')
    await flushPromises()

    expect(mocks.toast).toHaveBeenCalledWith('出款通道未就绪', 'error')
    expect(walletState(wrapper).autoWithdrawSaving).toBe(false)
    // 服务端拒绝时开关不翻转：状态只由 withdrawalSetting 推导
    expect(walletState(wrapper).withdrawalSetting).toBeNull()
    wrapper.unmount()
  })
})
