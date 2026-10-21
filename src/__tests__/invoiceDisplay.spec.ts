import { describe, expect, it } from 'vitest'

import type { InvoiceRecord } from '@/api/invoices'
import type { InvoiceGroup } from '@/shared/invoiceGroups'
import {
  INVOICE_STATUS_FILTERS,
  invoiceDeveloperTypeLabel,
  invoiceDisplayAmount,
  invoiceDocumentFileName,
  invoiceGroupAmountLabel,
  invoiceRoleLabel,
  invoiceStatusBadgeClass,
  invoiceStatusLabel,
} from '@/shared/invoiceDisplay'

/** 只填展示层用得到的字段；其余字段与这些函数无关。 */
function invoiceOf(overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: 1,
    invoiceNo: 'INV-2026-0001',
    invoiceTitle: '彝良柒叁信息技术有限公司',
    amountCny: '1200.00',
    amountFen: 120_000,
    status: 'approved',
    invoiceKind: 'ordinary',
    invoiceRole: 'platform',
    developerType: 'personal',
    documentKind: 'blue',
    ...overrides,
  } as InvoiceRecord
}

function groupOf(invoices: InvoiceRecord[]): InvoiceGroup<InvoiceRecord> {
  return {
    requirementId: 'REQ-1',
    invoiceTitle: '彝良柒叁信息技术有限公司',
    invoices,
  } as InvoiceGroup<InvoiceRecord>
}

describe('发票展示层', () => {
  it('状态文案与徽标修饰类一一对应，已红冲走默认灰底', () => {
    expect(invoiceStatusLabel('requested')).toBe('待处理')
    expect(invoiceStatusLabel('reversed')).toBe('已红冲')
    expect(invoiceStatusBadgeClass('approved')).toBe('wb-badge--success')
    expect(invoiceStatusBadgeClass('reversed')).toBe('')
  })

  it('筛选档与状态文案用同一套词汇', () => {
    expect(INVOICE_STATUS_FILTERS.map((item) => item.key)).toContain('all')
    for (const item of INVOICE_STATUS_FILTERS) {
      if (item.key === 'all') continue
      expect(item.label).toBe(invoiceStatusLabel(item.key))
    }
  })

  it('红字发票按负数列示', () => {
    expect(invoiceDisplayAmount(invoiceOf())).toBe('¥1200.00')
    expect(invoiceDisplayAmount(invoiceOf({ documentKind: 'red', amountCny: '40.00' }))).toBe(
      '-¥40.00',
    )
  })

  it('卡头合计把红票抵掉：100 − 40 = 60', () => {
    const group = groupOf([
      invoiceOf({ id: 1, amountFen: 10_000 }),
      invoiceOf({ id: 2, amountFen: 4_000, documentKind: 'red' }),
    ])
    expect(invoiceGroupAmountLabel(group)).toBe('¥60.00')
  })

  it('票种与开票主体文案', () => {
    expect(invoiceRoleLabel('platform')).toBe('平台服务费发票')
    expect(invoiceRoleLabel('developer')).toBe('开发者服务收入发票')
    expect(invoiceDeveloperTypeLabel('sole_proprietor')).toBe('个体工商户')
    expect(invoiceDeveloperTypeLabel('unknown-value')).toBe('待识别')
  })

  it('落盘文件名带票号与抬头，抬头里的路径字符被换掉', () => {
    const invoice = invoiceOf({ invoiceTitle: 'A/B:C*D?' })
    expect(invoiceDocumentFileName(invoice, 'application/pdf')).toBe('INV-2026-0001-A-B-C-D-.pdf')
    expect(invoiceDocumentFileName(invoiceOf(), 'image/webp')).toMatch(/\.webp$/)
    expect(invoiceDocumentFileName(invoiceOf(), 'application/octet-stream')).toMatch(/\.bin$/)
  })
})
