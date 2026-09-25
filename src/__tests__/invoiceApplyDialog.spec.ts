import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import InvoiceApplyDialog from '@/components/InvoiceApplyDialog.vue'
import type { InvoiceableSummary, InvoiceBuyerSubject, InvoiceRecord } from '@/api/invoices'

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  apply: vi.fn(),
}))

vi.mock('@/api/invoices', () => ({
  getInvoiceSummary: mocks.summary,
  applyInvoices: mocks.apply,
}))

/**
 * 买方（需求方）的开票主体：抬头 / 税号 / 邮箱都由后端按实名主体折算好随汇总返回。
 * 默认给个人主体（樊波），企业主体在需要的用例里覆盖。
 */
function buyer(overrides: Partial<InvoiceBuyerSubject> = {}): InvoiceBuyerSubject {
  return {
    username: 'alice',
    authType: 'IDENTITY_CARD',
    realnameStatus: 'approved',
    isOrganization: false,
    title: '樊波',
    taxNumber: '',
    email: 'client@example.com',
    ...overrides,
  }
}

/**
 * 合并申请后的汇总：一次申请按需求开出「平台服务费票 + 开发者收入票」，
 * 金额由后端按已成功分账的结算单算出；`invoiceableTotalFen` 是本次申请能开出的合计。
 */
function summary(overrides: Partial<InvoiceableSummary> = {}): InvoiceableSummary {
  return {
    requirementId: 'REQ-1',
    customer: 'alice',
    developer: 'bob',
    buyer: buyer(),
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
    invoiceKind: 'ordinary',
    buyerAddress: '',
    buyerPhone: '',
    buyerBankName: '',
    buyerBankAccount: '',
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
})

async function render(role: 'customer' | 'developer') {
  const wrapper = mount(InvoiceApplyDialog, {
    props: { visible: true, token: 'test-token', requirementId: 'REQ-1', role },
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  return wrapper
}

type DialogWrapper = Awaited<ReturnType<typeof render>>

function inputValue(wrapper: DialogWrapper, name: string): string {
  return (wrapper.find(`input[name="${name}"]`).element as HTMLInputElement).value
}

/** 三个主字段与四个专票资料字段都按 name 定位，不靠 maxlength（专票地址的 200 与抬头重了）。 */
function titleInput(wrapper: DialogWrapper): string {
  return inputValue(wrapper, 'invoice_title')
}

function taxInput(wrapper: DialogWrapper): string {
  return inputValue(wrapper, 'tax_number')
}

function emailInput(wrapper: DialogWrapper): string {
  return inputValue(wrapper, 'recipient_email')
}

/** 专票资料是否展示在弹窗里（四个输入框齐全才算）。 */
function hasSpecialFields(wrapper: DialogWrapper): boolean {
  return ['buyer_address', 'buyer_phone', 'buyer_bank_name', 'buyer_bank_account'].every(
    (name) => wrapper.find(`input[name="${name}"]`).exists(),
  )
}

/** 勾选票种：`ordinary` / `special`。 */
async function selectKind(wrapper: DialogWrapper, kind: 'ordinary' | 'special') {
  const option = wrapper.find<HTMLInputElement>(`input[name="invoice-kind"][value="${kind}"]`)
  await option.setValue(true)
}

/** 填满专票需要的四项购买方资料。 */
async function fillSpecialFields(wrapper: DialogWrapper) {
  await wrapper.find('input[name="buyer_address"]').setValue('云南省昭通市彝良县海子镇中沟村大坪组14号')
  await wrapper.find('input[name="buyer_phone"]').setValue('0870-8888888')
  await wrapper.find('input[name="buyer_bank_name"]').setValue('中国工商银行彝良县支行')
  await wrapper.find('input[name="buyer_bank_account"]').setValue('1234567890123456789')
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

  it('企业买方申请时缺税号先被挡下：开发者票的税号由后端强制校验', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        // 企业买方：抬头按公司全称带出，税号没得带就留给用户手填。
        buyer: buyer({
          authType: 'ENTERPRISE',
          isOrganization: true,
          title: '某某科技有限公司',
          taxNumber: '',
        }),
      }),
    )
    const wrapper = await render('customer')

    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('某某科技有限公司')
    await wrapper.find('.invoice-panel__submit').trigger('click')
    await flushPromises()

    expect(mocks.apply).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('需求方视角按本人实名主体预填抬头 / 税号 / 邮箱', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        buyer: buyer({
          authType: 'SOLE_PROPRIETOR',
          isOrganization: true,
          title: '彝良柒叁信息经营部',
          taxNumber: '92530628MAKA0U1Y96',
          email: 'client@example.com',
        }),
      }),
    )
    const wrapper = await render('customer')

    // 个体工商户：抬头取主体名称、税号取统一社会信用代码、邮箱取账户主邮箱。
    expect(titleInput(wrapper)).toBe('彝良柒叁信息经营部')
    expect(taxInput(wrapper)).toBe('92530628MAKA0U1Y96')
    expect(emailInput(wrapper)).toBe('client@example.com')
    expect(wrapper.text()).toContain('抬头与税号已按本人实名主体自动填写')
    // 个体户是企业组织形式，但专票只给企业主体，这里不该出现专票选项。
    expect(wrapper.find('input[name="invoice-kind"][value="special"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('乙方视角按需求方（客户）主体预填：带出的是买方，不是开发者自己', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        developerInvoiceFen: 70000,
        developerInvoiceCny: '700.00',
        invoiceableTotalFen: 70000,
        invoiceableTotalCny: '700.00',
        // 开发者自己是企业（彝良柒叁信息有限责任公司），但发票的买方是需求方樊波。
        buyer: buyer({ username: 'alice', title: '樊波', taxNumber: '', email: 'client@example.com' }),
      }),
    )
    const wrapper = await render('developer')

    expect(titleInput(wrapper)).toBe('樊波')
    expect(taxInput(wrapper)).toBe('')
    expect(emailInput(wrapper)).toBe('client@example.com')
    expect(wrapper.text()).toContain('抬头与税号已按需求方（客户）实名主体自动填写')
    // 个人买方不需要税号，占位文案也跟着账户类型走。
    expect(wrapper.find('input[maxlength="64"]').attributes('placeholder')).toBe('个人开票可不填')

    wrapper.unmount()
  })

  it('需求方未完成实名认证时不给预填，提示手动填写', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        buyer: buyer({
          authType: 'ENTERPRISE',
          realnameStatus: 'pending',
          isOrganization: true,
          title: '',
          taxNumber: '',
          email: '',
        }),
      }),
    )
    const wrapper = await render('developer')

    expect(titleInput(wrapper)).toBe('')
    expect(wrapper.text()).toContain('需求方实名认证审核中，抬头与税号需手动填写。')

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

  it('个人买方没有专票选项：增值税专用发票只对企业主体开具', async () => {
    const wrapper = await render('customer')

    expect(wrapper.find('input[name="invoice-kind"][value="special"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('增值税专用发票只对企业主体开具，个人与个体工商户只能开普通发票。')

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
    const wrapper = await render('customer')

    expect(wrapper.find('input[name="invoice-kind"][value="special"]').exists()).toBe(false)
    // 普票照样按企业 / 个体户的口径要税号。
    expect(wrapper.find('input[name="tax_number"]').attributes('placeholder')).toBe('企业或个体工商户必填')

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
    const wrapper = await render('customer')

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
    const wrapper = await render('customer')

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
    const wrapper = await render('customer')

    expect(wrapper.text()).toContain('平台服务费发票已提交（增值税专用发票 · 审核中 · 票面 ¥200.00）')

    wrapper.unmount()
  })

  it('乙方看不到需求方的平台服务费票进度，只看自己那张收入票', async () => {
    mocks.summary.mockResolvedValue(
      summary({
        platformInvoice: invoiceRecord({ status: 'under_review' }),
        developerInvoice: invoiceRecord({ id: 2, invoiceRole: 'developer', status: 'requested', amountCny: '800.00' }),
        invoiceableTotalFen: 0,
        invoiceableTotalCny: '0.00',
      }),
    )
    const wrapper = await render('developer')

    // 平台服务费是需求方付给平台的，那张票与乙方无关：进度行里只留乙方自己的收入票
    expect(wrapper.text()).not.toContain('平台服务费发票已提交')
    expect(wrapper.text()).toContain('开发者服务收入发票已提交（待处理 · 票面 ¥800.00）')

    wrapper.unmount()
  })
})
