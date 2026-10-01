import { flushPromises, shallowMount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import IncomeRecords from '@/views/DevWithdrawalRecordsView.vue'

vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ token: 'test', hydrate: vi.fn() }) }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
vi.mock('@/api/devWallet', () => ({
  getDevWithdrawalSummary: vi.fn().mockResolvedValue({
    withdrawals: Array.from({ length: 10 }, (_, index) => ({
      withdrawal_id: `withdrawal-${index}`, amount_cny: 2, channel: 'alipay',
      account_name: 'Test', account_no_masked: '***123', status: 'pending_review',
      created_at: '2026-09-08 12:00:00',
    })),
  }),
}))

it('combines income and withdrawals in time order with a shared pager', async () => {
  const wrapper = shallowMount(IncomeRecords, {
    props: { income: [{
      payment_id: 'payment-1', requirement_id: 'requirement-1', title: 'Delivery',
      customer: 'Customer', amount_cny: 5, paid_at: '2026-09-08 13:00:00', requirement_status: 'completed',
    }] },
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        TTable: { name: 'TTable', props: ['data'], template: '<div />' },
        TPagination: { name: 'TPagination', props: ['total', 'currentPage'], template: '<div />' },
      },
    },
  })
  await flushPromises()
  const table = wrapper.findComponent({ name: 'TTable' })
  const pager = wrapper.findComponent({ name: 'TPagination' })
  expect(pager.props('total')).toBe(11)
  expect(table.props('data')).toHaveLength(10)
  expect(table.props('data')[0]).toMatchObject({ kind: 'income', id: 'payment-1', amount: 5, status: '已入账' })
  expect(table.props('data')[1]).toMatchObject({ kind: 'withdrawal', status: '待审核', account: '***123' })
  pager.vm.$emit('update:current-page', 2)
  await flushPromises()
  expect(table.props('data')).toHaveLength(1)
  await wrapper.setProps({ income: [] })
  expect(pager.props('total')).toBe(10)
  expect(pager.props('currentPage')).toBe(1)
  wrapper.unmount()
})
