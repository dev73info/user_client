import { apiUrl, authHeader, requestJson } from '@/api/http'

export type InvoiceRole = 'platform' | 'developer'
export type InvoiceStatus = 'requested' | 'under_review' | 'approved' | 'rejected' | 'reversed'
/** `blue` 蓝票（正常开具）/ `red` 红票（红冲生成，金额存正数，负数语义由本字段表达）。 */
export type InvoiceDocumentKind = 'blue' | 'red'
/**
 * 票种：`ordinary` 增值税普通发票（默认，个人 / 个体户 / 企业都适用）、
 * `special` 增值税专用发票（只对能抵扣的企业、个体工商户客户开具，且开票资料必须齐全）。
 */
export type InvoiceKind = 'ordinary' | 'special'

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
  /** 票种：`ordinary` 增值税普通发票 / `special` 增值税专用发票。 */
  invoiceKind: InvoiceKind
  /** 专票的购买方开票资料（普票为空串）：地址、电话、开户行、银行账号。 */
  buyerAddress: string
  buyerPhone: string
  buyerBankName: string
  buyerBankAccount: string
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
 * 发票**买方**（需求方 / 甲方）的开票主体资料，由后端按实名主体折算好。
 *
 * 两张票（平台服务费票、开发者收入票）都是开给同一个需求方的，所以乙方申请时拿到的也是这份
 * 需求方资料——「发票开给谁」不因为谁来申请而改变。弹窗据此自动带出抬头 / 税号 / 接收邮箱。
 */
export type InvoiceBuyerSubject = {
  /** 买方用户名（需求方 / 甲方）。 */
  username: string
  /** 实名类型：`IDENTITY_CARD` / `ENTERPRISE` / `SOLE_PROPRIETOR` / `RESIDENCE_HK_MC` / `RESIDENCE_TAIWAN`；未实名时为空串。 */
  authType: string
  /** 实名状态：`approved` / `pending` / `rejected`；未提交过实名时为空串。 */
  realnameStatus: string
  /** 是否企业 / 个体工商户：决定抬头取公司全称还是实名姓名、以及税号是否必填。 */
  isOrganization: boolean
  /** 可按主体自动填的抬头；实名未通过时为空串，留给用户手填。 */
  title: string
  /** 企业 / 个体户的统一社会信用代码；个人为空串。 */
  taxNumber: string
  /** 买方的账户主邮箱，作为「接收邮箱」的默认值。 */
  email: string
}

/**
 * 一个需求的可开票汇总。
 *
 * 开票按需求合并：一张票覆盖整个需求，金额由后端按该需求已成功分账的结算单算出——平台票取
 * 服务费、开发者票取开发者税前收入扣掉售后退还/赔付客户、以及尚未结案的退款诉求之后的净额，
 * 两张票加起来就是客户为这个需求实际支付的净额。申请也合并成一次动作（`applyInvoices`）。
 */
export type InvoiceableSummary = {
  requirementId: string
  customer: string
  developer: string
  /** 买方的开票主体资料：抬头 / 税号 / 接收邮箱按它自动带出，两个视角共用一份。 */
  buyer: InvoiceBuyerSubject
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
   * 本次申请能开出的**合计**票面：尚未申请的各开票主体应开票金额之和。
   *
   * 需求方（付款方）两侧都拿得到，所以是「平台服务费票 + 开发者收入票」之和；乙方只有自己那一
   * 侧，合计就是开发者票面。已申请（含审核中、已通过）的一侧不计入——那一侧已经开过了；被红冲
   * 的一侧会重新计入，因为它可以重开。这就是弹窗上「可开票金额」显示的那个数。
   */
  invoiceableTotalFen: number
  invoiceableTotalCny: string
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
  /** 票种；不传按普票处理。 */
  invoice_kind?: InvoiceKind
  /** 专票的购买方开票资料；普票留空即可。 */
  buyer_address?: string
  buyer_phone?: string
  buyer_bank_name?: string
  buyer_bank_account?: string
}

/** 一次开票申请的结果：两侧各自的发票记录，某一侧不可开或无需再开时为 `null`。 */
export type AppliedInvoices = {
  /** 平台服务费票。乙方申请时恒为 `null`——这张票只有付款方（需求方）能申请。 */
  platformInvoice: InvoiceRecord | null
  /** 开发者收入票。需求方索取、乙方自行开具都在这一次申请里落地。 */
  developerInvoice: InvoiceRecord | null
}

/**
 * 提交开票申请：一次动作把该需求能开的票都开出来。
 *
 * 需求方拿「平台服务费票 + 开发者收入票」两张，乙方只拿自己那张开发者收入票；两张共用同一份
 * 抬头 / 税号 / 邮箱。某一侧没有可开金额或已经开过时后端会跳过它（已开过的原票照样回放），
 * 两侧都没有可开的记录才报错。
 */
export async function applyInvoices(
  token: string,
  payload: InvoiceRequestPayload,
): Promise<AppliedInvoices> {
  return requestJson<AppliedInvoices>('/invoices/apply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
    },
    body: JSON.stringify(payload),
  }, '提交开票申请失败')
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
