import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buyer,
  fillSpecialFields,
  hasSpecialFields,
  invoiceRecord,
  primeInvoiceMocks,
  renderInvoice,
  selectKind,
  summary,
  taxInput,
  titleInput,
} from './helpers/invoiceApplyDialog'
import type { InvoiceMocks } from './helpers/invoiceApplyDialog'

/** 已开票进度与红冲：一侧开过只显示进度、两侧都开过挡住提交、净额变小要红冲重开。 */

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  apply: vi.fn(),
})) satisfies InvoiceMocks

vi.mock('@/api/invoices', () => ({
  getInvoiceSummary: mocks.summary,
  applyInvoices: mocks.apply,
}))

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  localStorage.clear()
  primeInvoiceMocks(mocks)
})

describe('InvoiceApplyDialog', () => {
  it('已开过的一侧只展示进度，可开票金额只剩另一侧', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        platformInvoice: invoiceRecord({ status: 'under_review' }),
        invoiceableTotalFen: 70000,
        invoiceableTotalCny: '700.00',
      }),
    )
    const wrapper = await renderInvoice('customer')

    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥700.00')
    expect(wrapper.text()).toContain('平台服务费发票已提交（审核中 · 票面 ¥200.00）')
    expect(wrapper.find('.invoice-panel__submit').attributes('disabled')).toBeUndefined()

    wrapper.unmount()
  })

  it('两侧都开过之后没有可开票金额，提交被挡住', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        platformInvoice: invoiceRecord({ status: 'under_review' }),
        developerInvoice: invoiceRecord({
          id: 2,
          invoiceRole: 'developer',
          status: 'approved',
          amountCny: '700.00',
        }),
        invoiceableTotalFen: 0,
        invoiceableTotalCny: '0.00',
      }),
    )
    const wrapper = await renderInvoice('customer')

    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥0.00')
    expect(wrapper.find('.invoice-panel__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('平台服务费发票已提交（审核中 · 票面 ¥200.00）')
    expect(wrapper.text()).toContain('开发者服务收入发票已提交（已开具 · 票面 ¥700.00）')
    expect(wrapper.text()).toContain('本需求暂无可开票金额')

    wrapper.unmount()
  })

  it('原票开具后净额又变小，提示需红冲后按新净额重开', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        developerPayoutFen: 50000,
        developerPayoutCny: '500.00',
        developerInvoiceFen: 30000,
        developerInvoiceCny: '300.00',
        invoiceableTotalFen: 50000,
        invoiceableTotalCny: '500.00',
        developerInvoice: invoiceRecord({
          id: 2,
          invoiceRole: 'developer',
          amountFen: 80000,
          amountCny: '800.00',
          status: 'approved',
          reversalRequired: true,
          reversalSuggestionFen: 50000,
        }),
      }),
    )
    const wrapper = await renderInvoice('customer')

    expect(wrapper.text()).toContain('原票开具后本需求实际发生的净额变了（售后退款 / 赔付已成立）')
    expect(wrapper.text()).toContain('需要红冲后重开')

    wrapper.unmount()
  })

  it('未结案的退款诉求不触发红冲：钱没退出去就不动已开的票', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        pendingRefundFen: 50000,
        pendingRefundCny: '500.00',
        developerInvoiceFen: 30000,
        developerInvoiceCny: '300.00',
        invoiceableTotalFen: 50000,
        invoiceableTotalCny: '500.00',
        developerInvoice: invoiceRecord({
          id: 2,
          invoiceRole: 'developer',
          amountFen: 80000,
          amountCny: '800.00',
          status: 'approved',
          reversalRequired: false,
          reversalSuggestionFen: 0,
        }),
      }),
    )
    const wrapper = await renderInvoice('customer')

    expect(wrapper.text()).toContain('本需求有未结案的退款诉求 ¥500.00')
    expect(wrapper.text()).not.toContain('需要红冲后重开')

    wrapper.unmount()
  })

  it('没有已结算金额时既不给金额也不给提交', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        settledAmountFen: 0,
        settledAmountCny: '0.00',
        platformFeeFen: 0,
        platformFeeCny: '0.00',
        developerGrossAmountFen: 0,
        developerGrossAmountCny: '0.00',
        developerInvoiceFen: 0,
        developerInvoiceCny: '0.00',
        invoiceableTotalFen: 0,
        invoiceableTotalCny: '0.00',
      }),
    )
    const wrapper = await renderInvoice('customer')

    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥0.00')
    expect(wrapper.find('.invoice-panel__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('本需求暂无可开票金额')

    wrapper.unmount()
  })

  it('乙方看不到需求方的平台服务费票进度，只看自己那张收入票', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        platformInvoice: invoiceRecord({ status: 'under_review' }),
        developerInvoice: invoiceRecord({
          id: 2,
          invoiceRole: 'developer',
          status: 'requested',
          amountCny: '800.00',
        }),
        invoiceableTotalFen: 0,
        invoiceableTotalCny: '0.00',
      }),
    )
    const wrapper = await renderInvoice('developer')

    // 平台服务费是需求方付给平台的，那张票与乙方无关：进度行里只留乙方自己的收入票
    expect(wrapper.text()).not.toContain('平台服务费发票已提交')
    expect(wrapper.text()).toContain('开发者服务收入发票已提交（待处理 · 票面 ¥800.00）')

    wrapper.unmount()
  })
})
