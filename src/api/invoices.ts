import { apiUrl, authHeader, requestJson } from '@/api/http'

export type InvoiceRole = 'platform' | 'developer'
export type InvoiceStatus = 'requested' | 'under_review' | 'approved' | 'rejected' | 'reversed'
/** `blue` 蓝票（正常开具）/ `red` 红票（红冲生成，金额存正数，负数语义由本字段表达）。 */
export type InvoiceDocumentKind = 'blue' | 'red'

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
  documentKind: InvoiceDocumentKind
  /** 红票指向被它冲销的原蓝票 id；蓝票恒为 null。 */
  reversalOfId?: number | null
  /** 红冲原因：红票上必填，原蓝票上回写同一份便于按原票查因。 */
  reversalReason?: string | null
  /** 原蓝票被红冲的时间与操作人；红票恒为 null。 */
  reversedAt?: string | null
  reversedBy?: string | null
  /**
   * 该需求、该开票主体的**当前应开票金额**（分），即下一张票该开多少钱。
   * 退款 / 合同作废 / 售后赔付 / 未结案的退款诉求都会让它变小。
   */
  currentInvoiceableFen: number
  /**
   * 建议冲减额度（分）= 票面金额 − **已实际发生的净额**，可为负（表示少开、需补开而非红冲）。
   * 基准不含未结案的诉求：钱还没退出去就不动已经开出去的票，所以这一项可能小于
   * 「票面金额 − 当前应开票金额」。
   */
  reversalSuggestionFen: number
  /** 需要红冲：蓝票、已审核通过，且票面金额与已实际发生的净额不一致。 */
  reversalRequired: boolean
}

/**
 * 一个需求的可开票汇总。
 *
 * 合并开票后弹窗不再让用户挑支付节点：一张票覆盖整个需求，金额由后端按该需求已成功分账的
 * 结算单算出——平台票取服务费、开发者票取开发者税前收入扣掉售后退还/赔付客户、以及尚未结案
 * 的退款诉求之后的净额，两张票加起来就是客户为这个需求实际支付的净额。
 */
export type InvoiceableSummary = {
  requirementId: string
  customer: string
  developer: string
  /** 已成功分账的实付合计（平台服务费 + 开发者税前收入，未扣售后赔付）。 */
  settledAmountFen: number
  settledAmountCny: string
  platformFeeFen: number
  platformFeeCny: string
  developerGrossAmountFen: number
  developerGrossAmountCny: string
  /** 开发者从接单保证金里已退还 / 赔付给客户、并从开发者票面扣除的金额。 */
  developerPayoutFen: number
  developerPayoutCny: string
  /** 开发者票面 = 开发者税前收入 − 已退还 / 赔付客户的金额 − 未结案的退款诉求。 */
  developerInvoiceFen: number
  developerInvoiceCny: string
  /**
   * 该需求尚未结案的退款诉求金额。
   *
   * 这笔钱**已经**从上面的 `developerInvoiceFen` 里扣掉：退还 / 分账还没走完，钱还在平台兜着，
   * 不能算进已经发生的销售额；诉求判不成立或撤回时，差额再补开。
   *
   * 它不参与红冲判定：钱还没退出去，不动已经开出去的票，等退还真正成立再红冲。
   */
  pendingRefundFen: number
  pendingRefundCny: string
  /** 该需求当前有效的平台票（蓝票且未红冲），用于显示进度并挡住重复提交；已红冲后为 null。 */
  platformInvoice: InvoiceRecord | null
  /** 该需求当前有效的开发者票（蓝票且未红冲）；已红冲后为 null，此时可重新申请。 */
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
