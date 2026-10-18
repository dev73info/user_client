import { flushPromises, shallowMount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import FundRecords from '@/views/DevFundRecordsView.vue'

vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ token: 'test', hydrate: vi.fn() }) }))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  }
})
vi.mock('@/api/devWallet', () => ({
  getDevWithdrawalSummary: vi.fn().mockResolvedValue({
    withdrawals: Array.from({ length: 10 }, (_, index) => ({
      withdrawal_id: `withdrawal-${index}`, amount_cny: 2, channel: 'alipay',
      account_name: 'Test', account_no_masked: '***123', status: 'pending_review',
      created_at: '2026-09-08 12:00:00',
    })),
  }),
}))
vi.mock('@/api/devOrderDeposit', () => ({
  getDevOrderDepositWithdrawalSummary: vi.fn().mockResolvedValue({
    withdrawals: [{
      withdrawal_id: 'deposit-withdrawal-1', amount_cny: 100, channel: 'adapay',
      account_name: 'Test', account_no_masked: '***456', status: 'paid',
      review_note: '已退回', created_at: '2026-09-08 11:00:00',
    }],
  }),
  getDevOrderDepositOrders: vi.fn().mockResolvedValue([
    { payment_id: 'deposit-order-1', channel: 'adapay', amount_cny: 100, status: 'paid', created_at: '2026-09-08 10:00:00' },
  ]),
}))

/** 四类资金动作合成一段：保证金充值 / 保证金提现 / 收入 / 收入提现。 */
it('merges deposit recharge, deposit withdrawal, income and income withdrawal in time order', async () => {
  const wrapper = shallowMount(FundRecords, {
    props: { income: [{
      payment_id: 'payment-1', requirement_id: 'requirement-1', title: 'Delivery',
      customer: 'Customer', gross_amount_cny: 5, refund_developer_cny: 0, amount_cny: 5,
      paid_at: '2026-09-08 13:00:00', requirement_status: 'completed', refunded_at: null,
      requirement_refund_cny: 0,
    }] },
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        TTable: { name: 'TTable', props: ['data'], template: '<div />' },
        TPagination: { name: 'TPagination', props: ['total', 'currentPage'], template: '<div />' },
        TSelect: { name: 'TSelect', props: ['modelValue'], template: '<div />' },
      },
    },
  })
  await flushPromises()
  const table = wrapper.findComponent({ name: 'TTable' })
  const pager = wrapper.findComponent({ name: 'TPagination' })
  // 1 收入 + 10 收入提现 + 1 保证金充值 + 1 保证金提现
  expect(pager.props('total')).toBe(13)
  expect(table.props('data')).toHaveLength(10)
  const rows = table.props('data')
  expect(rows[0]).toMatchObject({ kind: 'income', id: 'payment-1', amount: 5, status: '已入账' })
  expect(rows[1]).toMatchObject({ kind: 'income_withdrawal', status: '待审核', account: '***123' })
  pager.vm.$emit('update:current-page', 2)
  await flushPromises()
  const secondPage = table.props('data')
  expect(secondPage).toHaveLength(3)
  // 第 2 页剩下的三条：最后一条收入提现（12:00）→ 保证金提现（11:00）→ 保证金充值（10:00），仍按时间倒序。
  expect(secondPage[0]).toMatchObject({ kind: 'income_withdrawal', status: '待审核' })
  expect(secondPage[1]).toMatchObject({ kind: 'deposit_withdrawal', status: '已退回', account: '***456' })
  expect(secondPage[2]).toMatchObject({ kind: 'deposit_recharge', id: 'deposit-order-1', amount: 100, status: '已到账' })

  // 每页条数调大后页码越界要回退到第 1 页（useClientPagination 的兜底）。
  const sizeSelect = wrapper.findComponent({ name: 'TSelect' })
  sizeSelect.vm.$emit('update:modelValue', 50)
  await flushPromises()
  expect(pager.props('currentPage')).toBe(1)
  expect(table.props('data')).toHaveLength(13)

  // 记录变少（父级轮询刷新后到账凭据减少）时，停在越界页要夹回首页，并把新数据摆出来。
  pager.vm.$emit('update:current-page', 2)
  await flushPromises()
  expect(table.props('data')).toHaveLength(0)
  await wrapper.setProps({ income: [] })
  await flushPromises()
  expect(pager.props('total')).toBe(12)
  expect(pager.props('currentPage')).toBe(1)
  expect(table.props('data')).toHaveLength(12)
  wrapper.unmount()
})
