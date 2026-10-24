import type { components } from '@/api/generated/schema'
import { authHeader, requestBlob, requestJson } from '@/api/http'

type Schemas = components['schemas']
type InvoiceResponse = Schemas['InvoiceResponse']
type SummaryResponse = Schemas['InvoiceableSummaryResponse']

export type InvoiceRole = 'platform' | 'developer'
export type InvoiceStatus = 'requested' | 'under_review' | 'approved' | 'rejected' | 'reversed'
export type InvoiceDocumentKind = 'blue' | 'red'
export type InvoiceKind = 'ordinary' | 'special'

/**
 * 发票视图模型：契约只给 snake_case，界面与组件按 camelCase 读写。
 *
 * 每个字段都必须能对上 `InvoiceResponse` 的某个属性——这个仓里有十几处按名字读它，
 * 凭空造的字段（恒为 null、永远 undefined 的标记）只会让「有提示但后端从没给过」的假分支留在页面上。
 */
export type InvoiceRecord = {
  id: number
  invoiceNo: string
  contractId: number | null
  requirementId: string
  invoiceRole: InvoiceRole
  applicantUsername: string
  customerUsername: string
  developerUsername: string
  issuerName: string
  developerType: string
  titleType: string
  invoiceTitle: string
  taxNumber: string
  recipientEmail: string
  invoiceKind: InvoiceKind
  buyerAddress: string
  buyerPhone: string
  buyerBankName: string
  buyerBankAccount: string
  amountFen: number
  amountCny: string
  documentUrl?: string | null
  documentName?: string | null
  documentMime?: string | null
  status: InvoiceStatus
  reviewNote?: string | null
  reviewedBy?: string | null
  reviewedAt?: string | null
  createdAt: string
  updatedAt: string
  documentKind: InvoiceDocumentKind
  reversalOfId?: number | null
  reversalReason?: string | null
  reversedAt?: string | null
  reversedBy?: string | null
}

function mapInvoice(invoice: InvoiceResponse): InvoiceRecord {
  return {
    id: invoice.id,
    invoiceNo: invoice.invoice_no,
    contractId: invoice.contract_id ?? null,
    requirementId: invoice.requirement_id,
    invoiceRole: invoice.invoice_role as InvoiceRole,
    applicantUsername: invoice.applicant_username,
    customerUsername: invoice.customer_username,
    developerUsername: invoice.developer_username,
    issuerName: invoice.issuer_name,
    developerType: invoice.developer_type,
    titleType: invoice.title_type,
    invoiceTitle: invoice.invoice_title,
    taxNumber: invoice.tax_number,
    recipientEmail: invoice.recipient_email,
    invoiceKind: invoice.invoice_kind as InvoiceKind,
    buyerAddress: invoice.buyer_address,
    buyerPhone: invoice.buyer_phone,
    buyerBankName: invoice.buyer_bank_name,
    buyerBankAccount: invoice.buyer_bank_account,
    amountFen: invoice.amount_fen,
    amountCny: invoice.amount_cny,
    documentUrl: invoice.document_url,
    documentName: invoice.document_name,
    documentMime: invoice.document_mime,
    status: invoice.status as InvoiceStatus,
    reviewNote: invoice.review_note,
    reviewedBy: invoice.reviewed_by,
    reviewedAt: invoice.reviewed_at,
    createdAt: invoice.created_at,
    updatedAt: invoice.updated_at,
    documentKind: invoice.document_kind as InvoiceDocumentKind,
    reversalOfId: invoice.reversal_of_id,
    reversalReason: invoice.reversal_reason,
    reversedAt: invoice.reversed_at,
    reversedBy: invoice.reversed_by,
  }
}

export type InvoiceBuyerSubject = {
  username: string
  authType: string
  realnameStatus: string
  isOrganization: boolean
  title: string
  taxNumber: string
  email: string
}

export type InvoiceableSummary = {
  requirementId: string
  customer: string
  developer: string
  buyer: InvoiceBuyerSubject
  settledAmountFen: number
  settledAmountCny: string
  platformFeeFen: number
  platformFeeCny: string
  developerGrossAmountFen: number
  developerGrossAmountCny: string
  /** 已成功退款合计（不是「开发者已赔付」，也不是「未结案的退款诉求」）。 */
  refundedFen: number
  refundedCny: string
  developerInvoiceFen: number
  developerInvoiceCny: string
  invoiceableTotalFen: number
  invoiceableTotalCny: string
  invoiceAvailable: boolean
  requirementStatus: string
  platformInvoice: InvoiceRecord | null
  developerInvoice: InvoiceRecord | null
}

function mapSummary(summary: SummaryResponse): InvoiceableSummary {
  return {
    requirementId: summary.requirement_id,
    customer: summary.customer,
    developer: summary.developer ?? '',
    buyer: {
      username: summary.buyer.username,
      authType: summary.buyer.auth_type,
      realnameStatus: summary.buyer.realname_status,
      isOrganization: summary.buyer.is_organization,
      title: summary.buyer.title,
      taxNumber: summary.buyer.tax_number,
      email: summary.buyer.email,
    },
    settledAmountFen: summary.paid_fen,
    settledAmountCny: summary.paid_cny,
    platformFeeFen: summary.platform_fee_fen,
    platformFeeCny: summary.platform_fee_cny,
    developerGrossAmountFen: summary.developer_gross_fen,
    developerGrossAmountCny: summary.developer_gross_cny,
    /** 语义是「已成功退款合计」，不是「开发者已赔付出款」——老名字叫 developerPayout 是错的。 */
    refundedFen: summary.refunded_fen,
    refundedCny: summary.refunded_cny,
    developerInvoiceFen: summary.developer_invoice_fen,
    developerInvoiceCny: summary.developer_invoice_cny,
    invoiceableTotalFen: summary.invoiceable_total_fen,
    invoiceableTotalCny: summary.invoiceable_total_cny,
    invoiceAvailable: summary.invoice_available,
    requirementStatus: summary.requirement_status,
    platformInvoice: summary.platform_invoice ? mapInvoice(summary.platform_invoice) : null,
    developerInvoice: summary.developer_invoice ? mapInvoice(summary.developer_invoice) : null,
  }
}

export async function listMyInvoices(token: string): Promise<InvoiceRecord[]> {
  const invoices = await requestJson<InvoiceResponse[]>(
    '/invoices/mine',
    { headers: authHeader(token) },
    '加载发票记录失败',
  )
  return invoices.map(mapInvoice)
}

export async function getInvoiceSummary(
  token: string,
  requirementId: string,
): Promise<InvoiceableSummary> {
  const query = new URLSearchParams({ requirement_id: requirementId })
  const summary = await requestJson<SummaryResponse>(
    `/invoices/summary?${query.toString()}`,
    { headers: authHeader(token) },
    '加载可开票金额失败',
  )
  return mapSummary(summary)
}

export type InvoiceRequestPayload = Schemas['ApplyInvoiceRequest']

export type AppliedInvoices = {
  platformInvoice: InvoiceRecord | null
  developerInvoice: InvoiceRecord | null
}

export async function applyInvoices(
  token: string,
  payload: InvoiceRequestPayload,
): Promise<AppliedInvoices> {
  const applied = await requestJson<Schemas['AppliedInvoicesResponse']>(
    '/invoices/apply',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '提交开票申请失败',
  )
  return {
    platformInvoice: applied.platform_invoice ? mapInvoice(applied.platform_invoice) : null,
    developerInvoice: applied.developer_invoice ? mapInvoice(applied.developer_invoice) : null,
  }
}

export async function uploadInvoiceDocument(
  token: string,
  invoiceId: number,
  file: File,
): Promise<InvoiceRecord> {
  const formData = new FormData()
  formData.append('file', file)
  const invoice = await requestJson<InvoiceResponse>(
    `/invoices/${invoiceId}/document`,
    {
      method: 'POST',
      headers: authHeader(token),
      body: formData,
    },
    '上传发票文件失败',
  )
  return mapInvoice(invoice)
}

/**
 * 下载发票文件。
 *
 * 走统一请求层（`requestBlob`）：401 分流、错误体解析与「未登录」事件都在那一层，裸 `fetch` 会把
 * 401 变成一条看不懂的文本错误，也不会派发重新登录。
 */
export async function downloadInvoiceDocument(token: string, invoiceId: number): Promise<Blob> {
  return requestBlob(
    `/invoices/${invoiceId}/document`,
    { headers: authHeader(token) },
    '下载发票文件失败',
  )
}
