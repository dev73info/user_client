import { flushPromises, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DevWalletView from '@/views/DevWalletView.vue'

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  status: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
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
}))
vi.mock('@/api/devCredit', () => ({ getDevCreditSelf: vi.fn().mockResolvedValue(null) }))

function mountWallet() {
  return shallowMount(DevWalletView, { global: { config: { warnHandler: () => {} } } })
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

  it('refreshes on return to the page and removes listeners and timers on unmount', async () => {
    const wrapper = mountWallet()
    await flushPromises()
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(mocks.summary).toHaveBeenCalledTimes(2)
    wrapper.unmount()
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(10000)
    expect(mocks.summary).toHaveBeenCalledTimes(2)
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
})
