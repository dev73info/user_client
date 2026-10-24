import { flushPromises, mount } from '@vue/test-utils'
import { type Mock, vi } from 'vitest'
import InvoiceApplyDialog from '@/components/InvoiceApplyDialog.vue'
import type { InvoiceableSummary, InvoiceBuyerSubject, InvoiceRecord } from '@/api/invoices'

/**
 * 开票弹窗（InvoiceApplyDialog）的共享夹具。
 *
 * `vi.mock` 是文件级注册，拆分后的每份 spec 各自 `vi.hoisted` 建一份 mocks 再登记；
 * 这里只放与 mock 实例无关的夹具与操作。
 */
export type InvoiceMocks = {
  summary: Mock
  apply: Mock
}

/**
 * 买方（需求方）的开票主体：抬头 / 税号 / 邮箱都由后端按实名主体折算好随汇总返回。
 * 默认给个人主体（樊波），企业主体在需要的用例里覆盖。
 */
export function buyer(overrides: Partial<InvoiceBuyerSubject> = {}): InvoiceBuyerSubject {
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
 *
 * 默认给「已结单、闸门放行」（`invoiceAvailable: true`），既有用例的金额口径不变；
 * 未结单的闸门用例自己覆盖这两个字段。
 */
export function summary(overrides: Partial<InvoiceableSummary> = {}): InvoiceableSummary {
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
    refundedFen: 0,
    refundedCny: '0.00',
    developerInvoiceFen: 80000,
    developerInvoiceCny: '800.00',
    invoiceableTotalFen: 100000,
    invoiceableTotalCny: '1000.00',
    invoiceAvailable: true,
    requirementStatus: 'completed',
    platformInvoice: null,
    developerInvoice: null,
    ...overrides,
  }
}

export function invoiceRecord(overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: 1,
    invoiceNo: 'INV-PLATFORM-1',
    contractId: 1,
    requirementId: 'REQ-1',
    invoiceRole: 'platform',
    applicantUsername: 'alice',
    customerUsername: 'alice',
    developerUsername: 'bob',
    issuerName: '平台',
    developerType: 'personal',
    titleType: 'enterprise',
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
    ...overrides,
  }
}

/** beforeEach 里铺默认返回值的那一段；`vi.clearAllMocks()`、pinia 与 localStorage 由各 spec 自己开头。 */
export function primeInvoiceMocks(mocks: InvoiceMocks) {
  mocks.summary.mockResolvedValue(summary())
  mocks.apply.mockResolvedValue({
    platformInvoice: invoiceRecord(),
    developerInvoice: invoiceRecord({ id: 2, invoiceRole: 'developer', amountCny: '800.00' }),
  })
}

export async function renderInvoice(role: 'customer' | 'developer') {
  const wrapper = mount(InvoiceApplyDialog, {
    props: { visible: true, token: 'test-token', requirementId: 'REQ-1', role },
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  return wrapper
}

export type DialogWrapper = Awaited<ReturnType<typeof renderInvoice>>

export function inputValue(wrapper: DialogWrapper, name: string): string {
  return (wrapper.find(`input[name="${name}"]`).element as HTMLInputElement).value
}

/** 三个主字段与四个专票资料字段都按 name 定位，不靠 maxlength（专票地址的 200 与抬头重了）。 */
export function titleInput(wrapper: DialogWrapper): string {
  return inputValue(wrapper, 'invoice_title')
}

export function taxInput(wrapper: DialogWrapper): string {
  return inputValue(wrapper, 'tax_number')
}

export function emailInput(wrapper: DialogWrapper): string {
  return inputValue(wrapper, 'recipient_email')
}

/** 专票资料是否展示在弹窗里（四个输入框齐全才算）。 */
export function hasSpecialFields(wrapper: DialogWrapper): boolean {
  return ['buyer_address', 'buyer_phone', 'buyer_bank_name', 'buyer_bank_account'].every((name) =>
    wrapper.find(`input[name="${name}"]`).exists(),
  )
}

/** 勾选票种：`ordinary` / `special`。 */
export async function selectKind(wrapper: DialogWrapper, kind: 'ordinary' | 'special') {
  const option = wrapper.find<HTMLInputElement>(`input[name="invoice-kind"][value="${kind}"]`)
  await option.setValue(true)
}

/** 填满专票需要的四项购买方资料。 */
export async function fillSpecialFields(wrapper: DialogWrapper) {
  await wrapper
    .find('input[name="buyer_address"]')
    .setValue('云南省昭通市彝良县海子镇中沟村大坪组14号')
  await wrapper.find('input[name="buyer_phone"]').setValue('0870-8888888')
  await wrapper.find('input[name="buyer_bank_name"]').setValue('中国工商银行彝良县支行')
  await wrapper.find('input[name="buyer_bank_account"]').setValue('1234567890123456789')
}
