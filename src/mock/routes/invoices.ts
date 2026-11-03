/**
 * 发票流：可开票汇总、我的发票、申请开票与发票文件。
 *
 * 只给「已结单」的需求造票：结单才有分账、才有平台服务费票与开发者收入票两张票。
 * 金额口径与需求单自洽——平台票 = 定金口径的平台服务费，开发者票 = 尾款口径的税前收入，
 * 两张票加起来等于合同总价，页面上「可开票金额」不会与需求金额打架。
 */

import type { components } from '@/api/generated/schema'

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

type InvoiceResponse = components['schemas']['InvoiceResponse']
type InvoiceableSummaryResponse = components['schemas']['InvoiceableSummaryResponse']

function nowText(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function fenOf(cny: number): number {
  return Math.round(cny * 100)
}

const MOCK_ISSUER = '柒参信息科技有限公司'

/**
 * 造一张票。**字段名必须是契约里的 snake_case**：前端 `mapInvoice` 按 `invoice_role` /
 * `developer_username` 这类名字读，早先这里回的是 camelCase，映射后全是 undefined，
 * 于是「我的发票」永远空表。
 */
function buildInvoice(
  id: number,
  requirementId: string,
  role: InvoiceResponse['invoice_role'],
  amountCny: number,
  status: InvoiceResponse['status'] = 'approved',
): InvoiceResponse {
  const requirement = findRequirement(requirementId)
  const contractId = 100 + (requirement?.id ?? 0)
  const applicant = role === 'platform' ? CLIENT_USERNAME : DEV_USERNAME

  return {
    id,
    invoice_no: `INV-MOCK-${String(id).padStart(4, '0')}`,
    contract_id: contractId,
    requirement_id: requirementId,
    invoice_role: role,
    applicant_username: applicant,
    customer_username: CLIENT_USERNAME,
    developer_username: DEV_USERNAME,
    issuer_name: MOCK_ISSUER,
    developer_type: 'individual',
    title_type: 'personal',
    invoice_title: `${role === 'developer' ? DEV_NICKNAME : CLIENT_NICKNAME}（演示）`,
    tax_number: '',
    recipient_email: 'client@example.com',
    invoice_kind: 'ordinary',
    buyer_address: '',
    buyer_phone: '',
    buyer_bank_name: '',
    buyer_bank_account: '',
    amount_fen: fenOf(amountCny),
    amount_cny: amountCny.toFixed(2),
    document_url: status === 'approved' ? `/uploads/mock-invoice-${id}.pdf` : null,
    document_name: status === 'approved' ? `invoice-${id}.pdf` : null,
    document_mime: status === 'approved' ? 'application/pdf' : null,
    status,
    review_note: null,
    reviewed_by: 'admin_demo',
    reviewed_at: nowText(),
    created_at: nowText(),
    updated_at: nowText(),
    document_kind: 'blue',
    reversal_of_id: null,
    reversal_reason: null,
    reversed_at: null,
    reversed_by: null,
  }
}

/**
 * 只给已结单的担保需求造两张票；无担保模式没有分账、也没有平台服务费票，
 * 只留开发者收入票（金额就是合同总价）。
 */
const invoices: InvoiceResponse[] = requirements
  .filter((item) => item.status === 'completed')
  .flatMap((item, index) => {
    const list: InvoiceResponse[] = []

    if (item.payment_mode === 'platform_guarantee') {
      list.push(buildInvoice(index * 2 + 1, item.requirement_id, 'platform', depositAmountOf(item)))
    }

    list.push(
      buildInvoice(
        index * 2 + 2,
        item.requirement_id,
        'developer',
        item.payment_mode === 'platform_guarantee' ? finalAmountOf(item) : (item.budget ?? 0),
        // 最新一张开发者票留成「待开具」，演示未上传文件的状态；更早的都是已开具
        index === 0 ? 'requested' : 'approved',
      ),
    )

    return list
  })

function invoiceFor(
  requirementId: string,
  role: InvoiceResponse['invoice_role'],
): InvoiceResponse | null {
  return (
    invoices.find((item) => item.requirement_id === requirementId && item.invoice_role === role) ??
    null
  )
}

function buildSummary(requirementId: string): InvoiceableSummaryResponse | null {
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

  /* 结单闸门与后端同规则：需求已结单（completed）才放行开票，未结单时后端还会把可开票合计置 0。
     这里照做，否则 mock 下会出现「可开票金额 > 0 但入口已置灰」的自相矛盾。 */
  const invoiceAvailable = requirement.status === 'completed'
  const pendingTotal = invoiceAvailable ? pendingPlatform + pendingDeveloper : 0

  return {
    requirement_id: requirementId,
    customer: CLIENT_USERNAME,
    developer: DEV_USERNAME,
    buyer: {
      username: CLIENT_USERNAME,
      auth_type: 'IDENTITY_CARD',
      realname_status: 'approved',
      is_organization: false,
      title: CLIENT_NICKNAME,
      tax_number: '',
      email: 'client@example.com',
    },
    paid_fen: fenOf(platformFee + developerGross),
    paid_cny: (platformFee + developerGross).toFixed(2),
    platform_fee_fen: fenOf(platformFee),
    platform_fee_cny: platformFee.toFixed(2),
    developer_gross_fen: fenOf(developerGross),
    developer_gross_cny: developerGross.toFixed(2),
    refunded_fen: 0,
    refunded_cny: '0.00',
    developer_invoice_fen: fenOf(developerGross),
    developer_invoice_cny: developerGross.toFixed(2),
    invoiceable_total_fen: fenOf(pendingTotal),
    invoiceable_total_cny: pendingTotal.toFixed(2),
    invoice_available: invoiceAvailable,
    requirement_status: requirement.status,
    platform_invoice: platformInvoice ?? null,
    developer_invoice: developerInvoice ?? null,
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

      // 与后端同口径的结单闸门（P13 / BUG-016）：没结单一律拒绝，免得 mock 下能造出
      // 真实环境开不出的票，让前端按错误前提调试。
      if (requirement.status !== 'completed') {
        return textResponse('需求结单后才能申请开票', 409)
      }

      const created: InvoiceResponse[] = []

      if (
        requirement.payment_mode === 'platform_guarantee' &&
        !invoiceFor(requirementId, 'platform')
      ) {
        const record = buildInvoice(
          invoices.length + 1,
          requirementId,
          'platform',
          depositAmountOf(requirement),
        )
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

      record.document_url = `/uploads/mock-invoice-${record.id}.pdf`
      record.updated_at = nowText()

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
