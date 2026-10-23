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

/** 可开票金额口径：平台服务费 + 开发者票、退款诉求与售后赔付后按净额开、乙方只看自己那一侧。 */

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
  it('需求方一次申请开出两张票：可开票金额 = 平台服务费 + 开发者收入', async () => {
    const wrapper = await renderInvoice('customer')

    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥1000.00')
    expect(wrapper.find('.invoice-panel__submit').text()).toBe('提交开票申请')
    expect(wrapper.text()).toContain(
      '本次申请一次开出两张：平台服务费票 ¥200.00 + 开发者收入票 ¥800.00',
    )
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
    const wrapper = await renderInvoice('customer')

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
    const wrapper = await renderInvoice('customer')

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
    const wrapper = await renderInvoice('developer')

    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥700.00')
    expect(wrapper.find('.invoice-panel__submit').text()).toBe('提交开发者发票申请')
    expect(wrapper.text()).toContain('开发者收入（定金 + 尾款合并开票）')
    expect(wrapper.find('.invoice-panel__head strong').text()).toBe('开发者发票')

    wrapper.unmount()
  })

  it('提交一次带需求编号与抬头，成功后关闭并通知父组件刷新', async () => {
    const wrapper = await renderInvoice('customer')

    await wrapper.find('input[type="text"]').setValue('某某科技有限公司')
    await wrapper.find('input[type="email"]').setValue('billing@example.com')
    await wrapper.find('.invoice-panel__submit').trigger('click')
    await flushPromises()

    expect(mocks.apply).toHaveBeenCalledWith('test-token', {
      requirement_id: 'REQ-1',
      invoice_title: '某某科技有限公司',
      tax_number: '',
      recipient_email: 'billing@example.com',
      // 默认普票：不带专票资料，四项一律空串。
      invoice_kind: 'ordinary',
      buyer_address: '',
      buyer_phone: '',
      buyer_bank_name: '',
      buyer_bank_account: '',
    })
    expect(wrapper.emitted('submitted')).toBeTruthy()
    expect(wrapper.emitted('update:visible')).toEqual([[false]])

    wrapper.unmount()
  })

  it('需求未结单时不给金额：闸门说明写明结单后才能开票与当前状态', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        invoiceAvailable: false,
        requirementStatus: 'in_development',
        invoiceableTotalFen: 0,
        invoiceableTotalCny: '0.00',
      }),
    )
    const wrapper = await renderInvoice('customer')

    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥0.00')
    expect(wrapper.find('.invoice-panel__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('需求结单后才能申请开票（当前：开发中）')
    // 闸门说明与旧的「暂无可开票金额」互斥，不叠着说两句。
    expect(wrapper.text()).not.toContain('本需求暂无可开票金额')

    wrapper.unmount()
  })

  it('未结单且停在 deposit_paid：弹窗拿不到支付模式，状态按「已付定金 / 待开发」两种含义写出来', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        invoiceAvailable: false,
        requirementStatus: 'deposit_paid',
        invoiceableTotalFen: 0,
        invoiceableTotalCny: '0.00',
      }),
    )
    const wrapper = await renderInvoice('customer')

    expect(wrapper.text()).toContain('需求结单后才能申请开票（当前：已付定金 / 待开发）')

    wrapper.unmount()
  })
})
