import { apiUrl, authHeader, requestJson } from '@/api/http'

export type InvoiceRole = 'platform' | 'developer'
export type InvoiceStatus = 'requested' | 'under_review' | 'approved' | 'rejected'

export type InvoiceRecord = {
  id: number
  invoiceNo: string
  /** 合并开票后一张票覆盖整个需求，新票为 null；历史按支付单开具的旧票才有值。 */
  paymentId: string | null
  contractId: number
  requirementId: string
  invoiceRole: InvoiceRole
  applicantUsername: string
  customerUsername: string
  developerUsername: string
  issuerName: string
  developerType: string
  invoiceTitle: string
  taxNumber: string
  recipientEmail: string
  amountFen: number
  amountCny: string
  documentUrl?: string | null
  status: InvoiceStatus
  reviewNote?: string | null
  reviewedBy?: string | null
  reviewedAt?: string | null
  createdAt: string
  updatedAt: string
}

/**
 * 一个需求的可开票汇总。
 *
 * 合并开票后弹窗不再让用户挑支付节点：一张票覆盖整个需求，金额由后端按该需求已成功分账的
 * 结算单算出——平台票取服务费、开发者票取开发者税前收入，两张票加起来就是客户实付的总额。
 */
export type InvoiceableSummary = {
  requirementId: string
  customer: string
  developer: string
  /** 已成功分账的实付合计（平台服务费 + 开发者税前收入）。 */
  settledAmountFen: number
  settledAmountCny: string
  platformFeeFen: number
  platformFeeCny: string
  developerGrossAmountFen: number
  developerGrossAmountCny: string
  /**
   * 该需求尚未结案的退款诉求金额。
   *
   * 它**没有**从上面三个金额里扣除：尾款一旦分账出账就退不动了，这类诉求只能转平台人工处理，
   * 退款能否成立、退多少都还没定。弹窗据此提示「先结案再开票」。
   */
  pendingRefundFen: number
  pendingRefundCny: string
  /** 该需求已存在的平台票，用于显示进度并挡住重复提交。 */
  platformInvoice: InvoiceRecord | null
  /** 该需求已存在的开发者票。 */
  developerInvoice: InvoiceRecord | null
}

export async function listMyInvoices(token: string): Promise<InvoiceRecord[]> {
  return requestJson<InvoiceRecord[]>('/invoices/mine', {
    headers: authHeader(token),
  }, '加载发票记录失败')
}

export async function getInvoiceSummary(token: string, requirementId: string): Promise<InvoiceableSummary> {
  const query = new URLSearchParams({ requirement_id: requirementId })
  return requestJson<InvoiceableSummary>(`/invoices/summary?${query.toString()}`, {
    headers: authHeader(token),
  }, '加载可开票金额失败')
}

export type InvoiceRequestPayload = {
  requirement_id: string
  invoice_title: string
  tax_number?: string
  recipient_email?: string
}

export async function requestPlatformInvoice(
  token: string,
  payload: InvoiceRequestPayload,
): Promise<InvoiceRecord> {
  return requestJson<InvoiceRecord>('/invoices/platform', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
    },
    body: JSON.stringify(payload),
  }, '获取平台发票失败')
}

export async function requestDeveloperInvoice(
  token: string,
  payload: InvoiceRequestPayload,
): Promise<InvoiceRecord> {
  return requestJson<InvoiceRecord>('/invoices/developer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
    },
    body: JSON.stringify(payload),
  }, '获取开发者发票失败')
}

export async function uploadInvoiceDocument(
  token: string,
  invoiceId: number,
  file: File,
): Promise<InvoiceRecord> {
  const formData = new FormData()
  formData.append('file', file)
  return requestJson<InvoiceRecord>(`/invoices/${invoiceId}/document`, {
    method: 'POST',
    headers: authHeader(token),
    body: formData,
  }, '上传发票文件失败')
}

export async function downloadInvoiceDocument(token: string, invoiceId: number): Promise<Blob> {
  const response = await fetch(apiUrl(`/invoices/${invoiceId}/document`), {
    headers: authHeader(token),
    credentials: 'omit',
  })
  if (!response.ok) {
    const message = (await response.text()).trim()
    throw new Error(message || '下载发票文件失败')
  }
  return response.blob()
}
