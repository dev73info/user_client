import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import InvoiceApplyDialog from '@/components/InvoiceApplyDialog.vue'
import { useAuthStore } from '@/stores/auth'
import type { InvoiceableSummary, InvoiceRecord } from '@/api/invoices'

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  platform: vi.fn(),
  developer: vi.fn(),
  realname: vi.fn(),
  profile: vi.fn(),
}))

vi.mock('@/api/invoices', () => ({
  getInvoiceSummary: mocks.summary,
  requestPlatformInvoice: mocks.platform,
  requestDeveloperInvoice: mocks.developer,
}))
vi.mock('@/api/realname', () => ({ getMyRealnameVerification: mocks.realname }))
vi.mock('@/api/settings', () => ({ getProfile: mocks.profile }))

/** 合并开票后的汇总：一张票覆盖整个需求，两侧金额由后端按已成功分账的结算单算出。 */
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
  // 未完成实名：不做抬头预填，断言只看用户输入。
  mocks.realname.mockResolvedValue({ status: 'pending' })
  mocks.profile.mockResolvedValue({})
})

async function render(role: 'customer' | 'developer', username: string) {
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = username
  const wrapper = mount(InvoiceApplyDialog, {
    props: { visible: true, token: 'test-token', requirementId: 'REQ-1', role },
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  return wrapper
}

describe('InvoiceApplyDialog', () => {
  it('需求方默认获取平台发票，两侧都能切：平台票 ¥200、开发者票 ¥800', async () => {
    const wrapper = await render('customer', 'alice')

    expect(wrapper.findAll('.invoice-side-switch__btn')[0]!.attributes('aria-checked')).toBe('true')
    expect(wrapper.findAll('.invoice-side-switch__btn')[1]!.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥200.00')
    expect(wrapper.find('.invoice-panel__submit').text()).toBe('提交平台发票申请')

    await wrapper.findAll('.invoice-side-switch__btn')[1]!.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.invoice-side-switch__btn')[1]!.attributes('aria-checked')).toBe('true')
    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥800.00')
    expect(wrapper.find('.invoice-panel__submit').text()).toBe('提交开发者发票申请')

    wrapper.unmount()
  })

  it('开发者进入时默认开发者一侧，平台一侧置灰', async () => {
    const wrapper = await render('developer', 'bob')
    const tabs = wrapper.findAll('.invoice-side-switch__btn')
    const platformTab = tabs[0]!
    const developerTab = tabs[1]!

    expect(platformTab.attributes('disabled')).toBeDefined()
    expect(platformTab.attributes('title')).toContain('平台发票由付款方获取')
    expect(developerTab.attributes('aria-checked')).toBe('true')
    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥800.00')
    expect(wrapper.find('.invoice-panel__notice').text()).toContain('平台发票由付款方获取')

    wrapper.unmount()
  })

  it('未结案的退款诉求从开发者票面里扣掉，平台票不受影响', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        pendingRefundFen: 50000,
        pendingRefundCny: '500.00',
        developerInvoiceFen: 30000,
        developerInvoiceCny: '300.00',
      }),
    )
    const wrapper = await render('customer', 'alice')

    expect(wrapper.text()).toContain('本需求有未结案的退款诉求 ¥500.00')
    expect(wrapper.text()).toContain('平台服务费不随退款减免')
    // 平台服务费没有退。
    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥200.00')

    await wrapper.findAll('.invoice-side-switch__btn')[1]!.trigger('click')
    await flushPromises()

    // 钱还没退出去，但退还 / 分账没走完，不能算进已经发生的销售额。
    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥300.00')

    wrapper.unmount()
  })

  it('售后已赔付客户时开发者票按净额开，平台票不受影响', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        developerPayoutFen: 50000,
        developerPayoutCny: '500.00',
        developerInvoiceFen: 30000,
        developerInvoiceCny: '300.00',
      }),
    )
    const wrapper = await render('customer', 'alice')

    // 钱是从开发者侧退的，平台服务费没退。
    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥200.00')

    await wrapper.findAll('.invoice-side-switch__btn')[1]!.trigger('click')
    await flushPromises()

    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥300.00')
    expect(wrapper.text()).toContain('其中开发者已退还 / 赔付客户 ¥500.00')

    wrapper.unmount()
  })

  it('原票开具后净额又变小，提示需红冲后按新净额重开', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        developerPayoutFen: 50000,
        developerPayoutCny: '500.00',
        developerInvoiceFen: 30000,
        developerInvoiceCny: '300.00',
        developerInvoice: invoiceRecord({
          invoiceRole: 'developer',
          amountFen: 80000,
          amountCny: '800.00',
          status: 'approved',
          reversalRequired: true,
          reversalSuggestionFen: 50000,
        }),
      }),
    )
    const wrapper = await render('customer', 'alice')

    await wrapper.findAll('.invoice-side-switch__btn')[1]!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('这张票需要红冲后重开')
    expect(wrapper.find('.invoice-panel__submit').attributes('disabled')).toBeDefined()

    wrapper.unmount()
  })

  it('未结案的退款诉求不触发红冲：钱没退出去就不动已开的票', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        pendingRefundFen: 50000,
        pendingRefundCny: '500.00',
        developerInvoiceFen: 30000,
        developerInvoiceCny: '300.00',
        developerInvoice: invoiceRecord({
          invoiceRole: 'developer',
          amountFen: 80000,
          amountCny: '800.00',
          status: 'approved',
          reversalRequired: false,
          reversalSuggestionFen: 0,
        }),
      }),
    )
    const wrapper = await render('customer', 'alice')

    await wrapper.findAll('.invoice-side-switch__btn')[1]!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('本需求有未结案的退款诉求 ¥500.00')
    expect(wrapper.text()).not.toContain('这张票需要红冲后重开')

    wrapper.unmount()
  })

  it('提交平台发票申请只带需求编号与抬头', async () => {
    mocks.platform.mockResolvedValue(invoiceRecord())
    const wrapper = await render('customer', 'alice')

    await wrapper.find('input[type="text"]').setValue('某某科技有限公司')
    await wrapper.find('.invoice-panel__submit').trigger('click')
    await flushPromises()

    expect(mocks.platform).toHaveBeenCalledWith('test-token', {
      requirement_id: 'REQ-1',
      invoice_title: '某某科技有限公司',
      tax_number: '',
      recipient_email: '',
    })
    expect(wrapper.emitted('submitted')).toBeTruthy()
    expect(wrapper.emitted('update:visible')).toEqual([[false]])

    wrapper.unmount()
  })

  it('需求方索取开发者发票走开发者接口', async () => {
    mocks.developer.mockResolvedValue(invoiceRecord({ invoiceRole: 'developer' }))
    const wrapper = await render('customer', 'alice')

    await wrapper.findAll('.invoice-side-switch__btn')[1]!.trigger('click')
    await wrapper.find('input[type="text"]').setValue('某某科技有限公司')
    await wrapper.find('.invoice-panel__submit').trigger('click')
    await flushPromises()

    expect(mocks.developer).toHaveBeenCalledWith('test-token', {
      requirement_id: 'REQ-1',
      invoice_title: '某某科技有限公司',
      tax_number: '',
      recipient_email: '',
    })
    expect(mocks.platform).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('已开过发票时挡住重复提交', async () => {
    mocks.summary.mockResolvedValue(
      summary({ platformInvoice: invoiceRecord({ status: 'under_review' }) }),
    )
    const wrapper = await render('customer', 'alice')

    expect(wrapper.find('.invoice-panel__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('该发票已提交（审核中 · 票面 ¥200.00）')

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
      }),
    )
    const wrapper = await render('customer', 'alice')

    expect(wrapper.find('.invoice-amount__value').text()).toBe('¥0.00')
    expect(wrapper.find('.invoice-panel__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('本需求暂无可开票金额')

    wrapper.unmount()
  })
})
