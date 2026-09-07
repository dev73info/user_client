import { apiUrl, authHeader, requestJson } from '@/api/http'

export type InvoiceRole = 'platform' | 'developer'
export type InvoiceStatus = 'requested' | 'under_review' | 'approved' | 'rejected'

export type InvoiceRecord = {
  id: number
  invoiceNo: string
  paymentId: string
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

export type InvoicePaymentOption = {
  paymentId: string
  requirementId: string
  milestone: 'deposit' | 'final'
  amountFen: number
  amountCny: string
  payer: string
  developer: string
  platformFeeFen: number
  platformFeeCny: string
  developerGrossAmountFen: number
  developerGrossAmountCny: string
}

export async function listMyInvoices(token: string): Promise<InvoiceRecord[]> {
  return requestJson<InvoiceRecord[]>('/invoices/mine', {
    headers: authHeader(token),
  }, '加载发票记录失败')
}

export async function listInvoicePaymentOptions(token: string): Promise<InvoicePaymentOption[]> {
  return requestJson<InvoicePaymentOption[]>('/invoices/payment-options', {
    headers: authHeader(token),
  }, '加载可开票支付节点失败')
}

export async function requestPlatformInvoice(
  token: string,
  payload: { payment_id: string; invoice_title: string; tax_number?: string; recipient_email?: string },
): Promise<InvoiceRecord> {
  return requestJson<InvoiceRecord>('/invoices/platform', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
    },
    body: JSON.stringify(payload),
  }, '申请平台发票失败')
}

export async function requestDeveloperInvoice(
  token: string,
  payload: { payment_id: string; invoice_title: string; tax_number?: string; recipient_email?: string },
): Promise<InvoiceRecord> {
  return requestJson<InvoiceRecord>('/invoices/developer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
    },
    body: JSON.stringify(payload),
  }, '申请开发者发票失败')
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
