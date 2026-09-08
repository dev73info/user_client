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
  return shallowMount(DevWalletView, { global: {
    config: { warnHandler: () => {} },
    stubs: {
      ElTabs: { template: '<div><slot /></div>' },
      ElTabPane: { template: '<div><slot /></div>' },
      ElTable: { name: 'ElTable', props: ['data'], template: '<div />' },
      ElPagination: { name: 'ElPagination', props: ['currentPage', 'pageSize', 'total'], template: '<div />' },
      ElSelect: { name: 'ElSelect', props: ['modelValue'], template: '<div />' },
    },
  } })
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

  it('paginates records, resets on page size change and clamps after refresh', async () => {
    const records = Array.from({ length: 23 }, (_, index) => ({
      withdrawal_id: `withdrawal-${index}`, status: 'paid', amount_cny: 1,
    }))
    mocks.summary.mockResolvedValue({ withdrawals: records })
    const wrapper = mountWallet()
    await flushPromises()
    const table = wrapper.findAllComponents({ name: 'ElTable' })[0]!
    const pagination = wrapper.findComponent({ name: 'ElPagination' })
    expect(table.props('data')).toEqual(records.slice(0, 10))
    expect(pagination.props('total')).toBe(23)
    pagination.vm.$emit('update:current-page', 3)
    await flushPromises()
    expect(table.props('data')).toEqual(records.slice(20))
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 20)
    await flushPromises()
    expect(pagination.props('currentPage')).toBe(1)
    expect(table.props('data')).toEqual(records.slice(0, 20))
    pagination.vm.$emit('update:current-page', 2)
    await flushPromises()
    mocks.summary.mockResolvedValue({ withdrawals: records.slice(0, 2) })
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(pagination.props('currentPage')).toBe(1)
    expect(table.props('data')).toEqual(records.slice(0, 2))
    mocks.summary.mockResolvedValue({ withdrawals: [] })
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(pagination.props('currentPage')).toBe(1)
    expect(pagination.props('total')).toBe(0)
    expect(table.props('data')).toEqual([])
    wrapper.unmount()
  })
})
