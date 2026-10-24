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
  listDevWithdrawals: vi.fn().mockResolvedValue(
    Array.from({ length: 10 }, (_, index) => ({
      withdrawal_id: `withdrawal-${index}`,
      amount_fen: 200,
      account_name: 'Test',
      account_no_tail: '1234',
      creator: 'Test',
      status: 'pending_review',
      status_label: '待审核',
      note: '',
      review_note: '',
      payout_failure_reason: null,
      payout_attempts: 0,
      created_time: '2026-09-08 12:00:00',
    })),
  ),
}))

/** 两类资金动作合成一段：收入 / 退款冲减 / 收入提现。 */
it('merges income, refund reversal and income withdrawal in time order', async () => {
  const wrapper = shallowMount(FundRecords, {
    props: {
      income: [
        {
          payment_id: 'payment-1',
          requirement_id: 'requirement-1',
          title: 'Delivery',
          customer: 'Customer',
          gross_amount_cny: 5,
          refund_developer_cny: 0,
          amount_cny: 5,
          paid_at: '2026-09-08 13:00:00',
          requirement_status: 'completed',
          refunded_at: null,
          requirement_refund_cny: 0,
        },
      ],
    },
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
  // 1 收入 + 10 收入提现
  expect(pager.props('total')).toBe(11)
  expect(table.props('data')).toHaveLength(10)
  const rows = table.props('data')
  expect(rows[0]).toMatchObject({ kind: 'income', id: 'payment-1', amount: 5, status: '已入账' })
  expect(rows[1]).toMatchObject({ kind: 'income_withdrawal', status: '待审核', account: '1234' })

  pager.vm.$emit('update:current-page', 2)
  await flushPromises()
  const secondPage = table.props('data')
  // 第 2 页只剩最后一条提现（12:00），仍按时间倒序
  expect(secondPage).toHaveLength(1)
  expect(secondPage[0]).toMatchObject({ kind: 'income_withdrawal', status: '待审核' })

  // 每页条数调大后页码越界要回退到第 1 页（useClientPagination 的兜底）。
  const sizeSelect = wrapper.findComponent({ name: 'TSelect' })
  sizeSelect.vm.$emit('update:modelValue', 50)
  await flushPromises()
  expect(pager.props('currentPage')).toBe(1)
  expect(table.props('data')).toHaveLength(11)

  // 记录变少（父级轮询刷新后到账凭据减少）时，停在越界页要夹回首页，并把新数据摆出来。
  pager.vm.$emit('update:current-page', 2)
  await flushPromises()
  expect(table.props('data')).toHaveLength(0)
  await wrapper.setProps({ income: [] })
  await flushPromises()
  expect(pager.props('total')).toBe(10)
  expect(pager.props('currentPage')).toBe(1)
  expect(table.props('data')).toHaveLength(10)
  wrapper.unmount()
})
