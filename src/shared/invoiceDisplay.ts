import type { InvoiceRecord } from '@/api/invoices'
import type { InvoiceGroup } from '@/shared/invoiceGroups'
import { invoiceGroupTotalFen } from '@/shared/invoiceGroups'
import { formatFenAsCny } from '@/shared/money'

/**
 * 发票展示层的纯函数：状态文案、徽标修饰类、金额格式、文件名。
 *
 * 从 `views/InvoiceCenterView.vue` 抽出来，供发票列表页与后续拆分出的卡片组件共用；
 * 只做「值 → 显示串」的映射，不读 store、不发请求，便于单测。
 */

/** 状态筛选档（顺序即下拉顺序）：按**显示状态**分档，不是照读接口状态列。 */
export const INVOICE_STATUS_FILTERS: Array<{
  key: 'all' | InvoiceRecord['status']
  label: string
}> = [
  { key: 'all', label: '全部' },
  { key: 'requested', label: '待处理' },
  { key: 'under_review', label: '审核中' },
  { key: 'approved', label: '已开具' },
  { key: 'rejected', label: '需补充材料' },
  { key: 'reversed', label: '已红冲' },
]

const STATUS_LABELS: Record<InvoiceRecord['status'], string> = {
  requested: '待处理',
  under_review: '审核中',
  approved: '已开具',
  rejected: '需补充材料',
  reversed: '已红冲',
}

/** 状态徽标沿用统一层的「浅底 + 深字」，不要再各写一套饱和色。 */
const STATUS_BADGE_CLASSES: Record<InvoiceRecord['status'], string> = {
  requested: 'wb-badge--warning',
  under_review: 'wb-badge--accent',
  approved: 'wb-badge--success',
  rejected: 'wb-badge--danger',
  // 已红冲是终态、不再需要动作，用 .wb-badge 的默认灰底（不加修饰类）。
  reversed: '',
}

export function invoiceStatusLabel(status: InvoiceRecord['status']): string {
  return STATUS_LABELS[status]
}

export function invoiceStatusBadgeClass(status: InvoiceRecord['status']): string {
  return STATUS_BADGE_CLASSES[status]
}

/** 红字发票按负数列示：它是一条冲销凭证，和原蓝票加总才是净开票额。 */
export function invoiceDisplayAmount(invoice: InvoiceRecord): string {
  return `${invoice.documentKind === 'red' ? '-' : ''}¥${invoice.amountCny}`
}

/**
 * 卡头金额合计：同组里蓝票为正、红票为负，红冲后这一组会净减到实际开出去的净额。
 *
 * 分转元一律走 `formatFenAsCny`（不做 `fen / 100` 的浮点除法）：负号提到 `¥` 前面，
 * 与逐票「-¥40.00」的写法保持一致。
 */
export function invoiceGroupAmountLabel(group: InvoiceGroup<InvoiceRecord>): string {
  const fen = invoiceGroupTotalFen(group)
  return fen < 0 ? `-¥${formatFenAsCny(-fen)}` : `¥${formatFenAsCny(fen)}`
}

export function invoiceRoleLabel(role: InvoiceRecord['invoiceRole']): string {
  return role === 'platform' ? '平台服务费发票' : '开发者服务收入发票'
}

export function invoiceDeveloperTypeLabel(value: string): string {
  return (
    {
      personal: '个人',
      sole_proprietor: '个体工商户',
      enterprise: '企业',
    }[value] ?? '待识别'
  )
}

export const INVOICE_DOCUMENT_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/** 落盘文件名：票号 + 抬头，便于财务与需求方按台账对号；抬头里的路径字符换掉。 */
export function invoiceDocumentFileName(invoice: InvoiceRecord, mimeType: string): string {
  const extension = INVOICE_DOCUMENT_EXTENSIONS[mimeType] ?? 'bin'
  const title = invoice.invoiceTitle.replace(/[\\/:*?"<>|]/g, '-').slice(0, 60)
  return `${invoice.invoiceNo}-${title || '发票'}.${extension}`
}
