/**
 * 发票流：可开票汇总、我的发票、申请开票与发票文件。
 *
 * 只给「已结单」的需求造票：结单才有分账、才有平台服务费票与开发者收入票两张票。
 * 金额口径与需求单自洽——平台票 = 定金口径的平台服务费，开发者票 = 尾款口径的税前收入，
 * 两张票加起来等于合同总价，页面上「可开票金额」不会与需求金额打架。
 */

import type { InvoiceRecord, InvoiceableSummary } from '@/api/invoices'

import {
  CLIENT_NICKNAME,
  CLIENT_USERNAME,
  DEV_NICKNAME,
  DEV_USERNAME,
  depositAmountOf,
  findRequirement,
  finalAmountOf,
  requirements,
} from '../db'
import { defineRouteTable, type MockRoute } from '../router'
import { jsonResponse, readString, textResponse } from '../response'

function nowText(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function fenOf(cny: number): number {
  return Math.round(cny * 100)
}

const MOCK_ISSUER = '柒参信息科技有限公司'

function buildInvoice(
  id: number,
  requirementId: string,
  role: InvoiceRecord['invoiceRole'],
  amountCny: number,
): InvoiceRecord {
  const requirement = findRequirement(requirementId)
  const contractId = 100 + (requirement?.id ?? 0)
  const applicant = role === 'platform' ? CLIENT_USERNAME : DEV_USERNAME

  return {
    id,
    invoiceNo: `INV-MOCK-${String(id).padStart(4, '0')}`,
    paymentId: null,
    contractId,
    requirementId,
    invoiceRole: role,
    applicantUsername: applicant,
    customerUsername: CLIENT_USERNAME,
    developerUsername: DEV_USERNAME,
    issuerName: role === 'platform' ? MOCK_ISSUER : MOCK_ISSUER,
    developerType: 'individual',
    invoiceTitle: `${CLIENT_NICKNAME}（演示）`,
    taxNumber: '',
    recipientEmail: 'client@example.com',
    invoiceKind: 'ordinary',
    buyerAddress: '',
    buyerPhone: '',
    buyerBankName: '',
    buyerBankAccount: '',
    amountFen: fenOf(amountCny),
    amountCny: amountCny.toFixed(2),
    documentUrl: `/uploads/mock-invoice-${id}.pdf`,
    status: 'approved',
    reviewNote: null,
    reviewedBy: 'admin_demo',
    reviewedAt: nowText(),
    createdAt: nowText(),
    updatedAt: nowText(),
    documentKind: 'blue',
    reversalOfId: null,
    reversalReason: null,
    reversedAt: null,
    reversedBy: null,
    currentInvoiceableFen: fenOf(amountCny),
    reversalSuggestionFen: 0,
    reversalRequired: false,
  }
}

/**
 * 只给已结单的担保需求造两张票；无担保模式没有分账、也没有平台服务费票，
 * 只留开发者收入票（金额就是合同总价）。
 */
const invoices: InvoiceRecord[] = requirements
  .filter((item) => item.status === 'completed')
  .flatMap((item, index) => {
    const list: InvoiceRecord[] = []

    if (item.payment_mode === 'platform_guarantee') {
      list.push(
        buildInvoice(index * 2 + 1, item.requirement_id, 'platform', depositAmountOf(item)),
      )
    }

    list.push(
      buildInvoice(
        index * 2 + 2,
        item.requirement_id,
        'developer',
        item.payment_mode === 'platform_guarantee'
          ? finalAmountOf(item)
          : (item.budget ?? 0),
      ),
    )

    return list
  })

function invoiceFor(requirementId: string, role: InvoiceRecord['invoiceRole']): InvoiceRecord | null {
  return invoices.find((item) => item.requirementId === requirementId && item.invoiceRole === role) ?? null
}

function buildSummary(requirementId: string): InvoiceableSummary | null {
  const requirement = findRequirement(requirementId)
  if (!requirement) {
    return null
  }

  const isSelfManaged = requirement.payment_mode === 'self_managed'
  const platformFee = isSelfManaged ? 0 : depositAmountOf(requirement)
  const developerGross = isSelfManaged ? (requirement.budget ?? 0) : finalAmountOf(requirement)
  const platformInvoice = invoiceFor(requirementId, 'platform')
  const developerInvoice = invoiceFor(requirementId, 'developer')
  const pendingPlatform = platformInvoice ? 0 : platformFee
  const pendingDeveloper = developerInvoice ? 0 : developerGross

  return {
    requirementId,
    customer: CLIENT_USERNAME,
    developer: DEV_USERNAME,
    buyer: {
      username: CLIENT_USERNAME,
      authType: 'IDENTITY_CARD',
      realnameStatus: 'approved',
      isOrganization: false,
      title: CLIENT_NICKNAME,
      taxNumber: '',
      email: 'client@example.com',
    },
    settledAmountFen: fenOf(platformFee + developerGross),
    settledAmountCny: (platformFee + developerGross).toFixed(2),
    platformFeeFen: fenOf(platformFee),
    platformFeeCny: platformFee.toFixed(2),
    developerGrossAmountFen: fenOf(developerGross),
    developerGrossAmountCny: developerGross.toFixed(2),
    developerPayoutFen: 0,
    developerPayoutCny: '0.00',
    developerInvoiceFen: fenOf(developerGross),
    developerInvoiceCny: developerGross.toFixed(2),
    invoiceableTotalFen: fenOf(pendingPlatform + pendingDeveloper),
    invoiceableTotalCny: (pendingPlatform + pendingDeveloper).toFixed(2),
    pendingRefundFen: 0,
    pendingRefundCny: '0.00',
    platformInvoice: platformInvoice ?? null,
    developerInvoice: developerInvoice ?? null,
  }
}

const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/invoices/mine',
    note: '我的发票列表',
    handler: () => jsonResponse(invoices),
  },
  {
    method: 'GET',
    path: '/invoices/summary',
    note: '按需求算可开票汇总',
    handler: (request) => {
      const requirementId = readString(request.query, 'requirement_id')
      const summary = buildSummary(requirementId)

      return summary ? jsonResponse(summary) : textResponse('需求不存在或不可开票', 404)
    },
  },
  {
    method: 'POST',
    path: '/invoices/apply',
    note: '提交开票申请：mock 直接生成两张已通过（或按模式只生成开发者票）的发票',
    handler: (request) => {
      const body = (request.body ?? {}) as { requirement_id?: string }
      const requirementId = body.requirement_id ?? ''
      const requirement = findRequirement(requirementId)

      if (!requirement) {
        return textResponse('需求不存在', 404)
      }

      const created: InvoiceRecord[] = []

      if (requirement.payment_mode === 'platform_guarantee' && !invoiceFor(requirementId, 'platform')) {
        const record = buildInvoice(invoices.length + 1, requirementId, 'platform', depositAmountOf(requirement))
        invoices.push(record)
        created.push(record)
      }

      if (!invoiceFor(requirementId, 'developer')) {
        const amount =
          requirement.payment_mode === 'platform_guarantee'
            ? finalAmountOf(requirement)
            : (requirement.budget ?? 0)
        const record = buildInvoice(invoices.length + 1, requirementId, 'developer', amount)
        invoices.push(record)
        created.push(record)
      }

      return jsonResponse({
        requirement_id: requirementId,
        applied: created.length,
        platform_invoice: invoiceFor(requirementId, 'platform'),
        developer_invoice: invoiceFor(requirementId, 'developer'),
      })
    },
  },
  {
    method: 'POST',
    path: '/invoices/:invoiceId/document',
    note: '上传发票文件（mock 只回显发票记录）',
    handler: (_request, params) => {
      const record = invoices.find((item) => String(item.id) === params.invoiceId)
      if (!record) {
        return textResponse('发票不存在', 404)
      }

      record.documentUrl = `/uploads/mock-invoice-${record.id}.pdf`
      record.updatedAt = nowText()

      return jsonResponse(record)
    },
  },
  {
    method: 'GET',
    path: '/invoices/:invoiceId/document',
    note: '下载发票文件：给一段占位文本，让下载链路能跑通',
    handler: () =>
      new Response('mock invoice document\n', {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="mock-invoice.pdf"',
        },
      }),
  },
]

export const invoiceRoutes = defineRouteTable('invoices', routes)
