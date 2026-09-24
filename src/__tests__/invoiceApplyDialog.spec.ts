import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import InvoiceApplyDialog from '@/components/InvoiceApplyDialog.vue'
import type { InvoiceableSummary, InvoiceRecord } from '@/api/invoices'

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  apply: vi.fn(),
  realname: vi.fn(),
  profile: vi.fn(),
}))

vi.mock('@/api/invoices', () => ({
  getInvoiceSummary: mocks.summary,
  applyInvoices: mocks.apply,
}))
vi.mock('@/api/realname', () => ({ getMyRealnameVerification: mocks.realname }))
vi.mock('@/api/settings', () => ({ getProfile: mocks.profile }))

/**
 * 合并申请后的汇总：一次申请按需求开出「平台服务费票 + 开发者收入票」，
 * 金额由后端按已成功分账的结算单算出；`invoiceableTotalFen` 是本次申请能开出的合计。
 */
function summary(overrides: Partial<InvoiceableSummary> = {}): InvoiceableSummary {
  return {
    requirementId: 'REQ-1',
    customer: 'alice',
    developer: 'bob',
    settledAmountFen: 100000,
    settledAmountCny: '1000.00',
    platformFeeFen: 20000,
    platformFeeCny: '200.00',
    developerGrossAmountFen: 80000,
    developerGrossAmountCny: '800.00',
    developerPayoutFen: 0,
    developerPayoutCny: '0.00',
    developerInvoiceFen: 80000,
    developerInvoiceCny: '800.00',
    invoiceableTotalFen: 100000,
    invoiceableTotalCny: '1000.00',
    pendingRefundFen: 0,
    pendingRefundCny: '0.00',
    platformInvoice: null,
    developerInvoice: null,
    ...overrides,
  }
}

function invoiceRecord(overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: 1,
    invoiceNo: 'INV-PLATFORM-1',
    paymentId: null,
    contractId: 1,
    requirementId: 'REQ-1',
    invoiceRole: 'platform',
    applicantUsername: 'alice',
    customerUsername: 'alice',
    developerUsername: 'bob',
    issuerName: '平台',
    developerType: 'personal',
    invoiceTitle: '某某科技有限公司',
    taxNumber: '',
    recipientEmail: '',
    amountFen: 20000,
    amountCny: '200.00',
    documentUrl: null,
    status: 'requested',
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: '2026-09-24 14:00:00',
    updatedAt: '2026-09-24 14:00:00',
    documentKind: 'blue',
    reversalOfId: null,
    reversalReason: null,
    reversedAt: null,
    reversedBy: null,
    currentInvoiceableFen: 20000,
    reversalSuggestionFen: 0,
    reversalRequired: false,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  localStorage.clear()
  mocks.summary.mockResolvedValue(summary())
  mocks.apply.mockResolvedValue({
    platformInvoice: invoiceRecord(),
    developerInvoice: invoiceRecord({ id: 2, invoiceRole: 'developer', amountCny: '800.00' }),
  })
  // 未完成实名：不做抬头预填，断言只看用户输入。
  mocks.realname.mockResolvedValue({ status: 'pending' })
  mocks.profile.mockResolvedValue({})
})

async function render(role: 'customer' | 'developer') {
  const wrapper = mount(InvoiceApplyDialog, {
    props: { visible: true, token: 'test-token', requirementId: 'REQ-1', role },
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  return wrapper
}

describe('InvoiceApplyDialog', () => {
  it('需求方一次申请开出两张票：可开票金额 = 平台服务费 + 开发者收入', async () => {
    const wrapper = await render('customer')

    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥1000.00')
    expect(wrapper.find('.invoice-panel__submit').text()).toBe('提交开票申请')
    expect(wrapper.text()).toContain('本次申请一次开出两张：平台服务费票 ¥200.00 + 开发者收入票 ¥800.00')
    expect(wrapper.findAll('.invoice-side-switch__btn')).toHaveLength(0)

    wrapper.unmount()
  })

  it('未结案的退款诉求只扣开发者票：可开票金额 ¥900.00', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        pendingRefundFen: 10000,
        pendingRefundCny: '100.00',
        developerInvoiceFen: 70000,
        developerInvoiceCny: '700.00',
        invoiceableTotalFen: 90000,
        invoiceableTotalCny: '900.00',
      }),
    )
    const wrapper = await render('customer')

    // 900 = 平台服务费 200 + 开发者净额 700（800 收入 − 100 未结案诉求）。
    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥900.00')
    expect(wrapper.text()).toContain('本需求有未结案的退款诉求 ¥100.00')
    expect(wrapper.text()).toContain('开发者票已按扣除这笔诉求后的净额 ¥700.00')
    expect(wrapper.text()).toContain('平台服务费不随退款减免')

    wrapper.unmount()
  })

  it('售后已赔付客户时开发者票按净额开，平台服务费不减', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        developerPayoutFen: 50000,
        developerPayoutCny: '500.00',
        developerInvoiceFen: 30000,
        developerInvoiceCny: '300.00',
        invoiceableTotalFen: 50000,
        invoiceableTotalCny: '500.00',
      }),
    )
    const wrapper = await render('customer')

    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥500.00')
    expect(wrapper.text()).toContain('其中开发者已退还 / 赔付客户 ¥500.00')
    expect(wrapper.text()).toContain('开发者票按净额 ¥300.00 开具')

    wrapper.unmount()
  })

  it('乙方只看自己那一侧：可开票金额就是开发者票面', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        developerInvoiceFen: 70000,
        developerInvoiceCny: '700.00',
        invoiceableTotalFen: 70000,
        invoiceableTotalCny: '700.00',
      }),
    )
    const wrapper = await render('developer')

    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥700.00')
    expect(wrapper.find('.invoice-panel__submit').text()).toBe('提交开发者发票申请')
    expect(wrapper.text()).toContain('开发者收入（定金 + 尾款合并开票）')
    expect(wrapper.find('.invoice-panel__head strong').text()).toBe('开发者发票')

    wrapper.unmount()
  })

  it('提交一次带需求编号与抬头，成功后关闭并通知父组件刷新', async () => {
    const wrapper = await render('customer')

    await wrapper.find('input[type="text"]').setValue('某某科技有限公司')
    await wrapper.find('input[type="email"]').setValue('billing@example.com')
    await wrapper.find('.invoice-panel__submit').trigger('click')
    await flushPromises()

    expect(mocks.apply).toHaveBeenCalledWith('test-token', {
      requirement_id: 'REQ-1',
      invoice_title: '某某科技有限公司',
      tax_number: '',
      recipient_email: 'billing@example.com',
    })
    expect(wrapper.emitted('submitted')).toBeTruthy()
    expect(wrapper.emitted('update:visible')).toEqual([[false]])

    wrapper.unmount()
  })

  it('企业实名主体申请时缺税号先被挡下：开发者票的税号由后端强制校验', async () => {
    mocks.realname.mockResolvedValue({
      status: 'approved',
      auth_type: 'ENTERPRISE',
      company_name: '某某科技有限公司',
      unified_social_credit_code: '',
    })
    const wrapper = await render('customer')

    // 抬头按实名主体预填，税号没得填就没得填。
    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('某某科技有限公司')
    await wrapper.find('.invoice-panel__submit').trigger('click')
    await flushPromises()

    expect(mocks.apply).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('已开过的一侧只展示进度，可开票金额只剩另一侧', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        platformInvoice: invoiceRecord({ status: 'under_review' }),
        invoiceableTotalFen: 70000,
        invoiceableTotalCny: '700.00',
      }),
    )
    const wrapper = await render('customer')

    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥700.00')
    expect(wrapper.text()).toContain('平台服务费发票已提交（审核中 · 票面 ¥200.00）')
    expect(wrapper.find('.invoice-panel__submit').attributes('disabled')).toBeUndefined()

    wrapper.unmount()
  })

  it('两侧都开过之后没有可开票金额，提交被挡住', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        platformInvoice: invoiceRecord({ status: 'under_review' }),
        developerInvoice: invoiceRecord({ id: 2, invoiceRole: 'developer', status: 'approved', amountCny: '700.00' }),
        invoiceableTotalFen: 0,
        invoiceableTotalCny: '0.00',
      }),
    )
    const wrapper = await render('customer')

    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥0.00')
    expect(wrapper.find('.invoice-panel__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('平台服务费发票已提交（审核中 · 票面 ¥200.00）')
    expect(wrapper.text()).toContain('开发者服务收入发票已提交（已通过 · 票面 ¥700.00）')
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
    const wrapper = await render('customer')

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
    const wrapper = await render('customer')

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
    const wrapper = await render('customer')

    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥0.00')
    expect(wrapper.find('.invoice-panel__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('本需求暂无可开票金额')

    wrapper.unmount()
  })
})
