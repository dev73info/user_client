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

/** 专票：只对企业主体开放，四项购买方资料必填，改回普票不提交专票资料。 */

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
  it('个人买方没有专票选项：增值税专用发票只对企业主体开具', async () => {
    const wrapper = await renderInvoice('customer')

    expect(wrapper.find('input[name="invoice-kind"][value="special"]').exists()).toBe(false)
    expect(wrapper.text()).toContain(
      '增值税专用发票只对企业主体开具，个人与个体工商户只能开普通发票。',
    )

    wrapper.unmount()
  })

  it('个体工商户买方也没有专票选项：专票只给企业主体', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        buyer: buyer({
          authType: 'SOLE_PROPRIETOR',
          isOrganization: true,
          title: '彝良柒叁信息经营部',
          taxNumber: '92530628MAKA0U1Y96',
        }),
      }),
    )
    const wrapper = await renderInvoice('customer')

    expect(wrapper.find('input[name="invoice-kind"][value="special"]').exists()).toBe(false)
    // 普票照样按企业 / 个体户的口径要税号。
    expect(wrapper.find('input[name="tax_number"]').attributes('placeholder')).toBe(
      '企业或个体工商户必填',
    )

    await wrapper.find('.invoice-panel__submit').trigger('click')
    await flushPromises()

    const payload = mocks.apply.mock.calls[0]?.[1] as Record<string, string>
    expect(payload.invoice_kind).toBe('ordinary')

    wrapper.unmount()
  })

  it('企业买方可以选专票：四项资料没填齐先被挡下，填齐后按专票提交', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        buyer: buyer({
          authType: 'ENTERPRISE',
          isOrganization: true,
          title: '某某科技有限公司',
          taxNumber: '91530628MAKA0U1Y96',
        }),
      }),
    )
    const wrapper = await renderInvoice('customer')

    // 还没选专票时，四项购买方资料不出现。
    expect(hasSpecialFields(wrapper)).toBe(false)
    await selectKind(wrapper, 'special')
    expect(hasSpecialFields(wrapper)).toBe(true)

    await wrapper.find('.invoice-panel__submit').trigger('click')
    await flushPromises()
    expect(mocks.apply).not.toHaveBeenCalled()

    await fillSpecialFields(wrapper)
    await wrapper.find('.invoice-panel__submit').trigger('click')
    await flushPromises()

    expect(mocks.apply).toHaveBeenCalledWith('test-token', {
      requirement_id: 'REQ-1',
      invoice_title: '某某科技有限公司',
      tax_number: '91530628MAKA0U1Y96',
      recipient_email: 'client@example.com',
      invoice_kind: 'special',
      buyer_address: '云南省昭通市彝良县海子镇中沟村大坪组14号',
      buyer_phone: '0870-8888888',
      buyer_bank_name: '中国工商银行彝良县支行',
      buyer_bank_account: '1234567890123456789',
    })

    wrapper.unmount()
  })

  it('专票改回普票后不把专票资料提交上去', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        buyer: buyer({
          authType: 'ENTERPRISE',
          isOrganization: true,
          title: '某某科技有限公司',
          taxNumber: '91530628MAKA0U1Y96',
        }),
      }),
    )
    const wrapper = await renderInvoice('customer')

    await selectKind(wrapper, 'special')
    await fillSpecialFields(wrapper)
    await selectKind(wrapper, 'ordinary')
    await wrapper.find('.invoice-panel__submit').trigger('click')
    await flushPromises()

    const payload = mocks.apply.mock.calls[0]?.[1] as Record<string, string>
    expect(payload.invoice_kind).toBe('ordinary')
    expect(payload.buyer_address).toBe('')
    expect(payload.buyer_bank_account).toBe('')

    wrapper.unmount()
  })

  it('已提交的专票在进度行里点名票种', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        platformInvoice: invoiceRecord({
          status: 'under_review',
          invoiceKind: 'special',
          buyerAddress: '云南省昭通市彝良县海子镇中沟村大坪组14号',
        }),
        invoiceableTotalFen: 70000,
        invoiceableTotalCny: '700.00',
      }),
    )
    const wrapper = await renderInvoice('customer')

    expect(wrapper.text()).toContain(
      '平台服务费发票已提交（增值税专用发票 · 审核中 · 票面 ¥200.00）',
    )

    wrapper.unmount()
  })
})
