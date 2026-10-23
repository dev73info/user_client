import { computed, type Ref } from 'vue'

import type { InvoiceableSummary, InvoiceRecord } from '@/api/invoices'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { COPY, type InvoiceSide } from '@/shared/invoiceApplyDisplay'

export type InvoiceApplyViewOptions = {
  summary: Ref<InvoiceableSummary | null>
  role: 'customer' | 'developer'
}

/**
 * 开票弹窗的展示派生（R047 从 `components/InvoiceApplyDialog.vue` 拆分）。
 *
 * 只读汇总，不改状态：两侧文案、可开票金额、结单闸门说明、已存在的发票与本次会开出哪几张票。
 * 三个判定与后端一致，改之前先看注释：已开过（含审核中 / 已通过）的一侧不计入可开票金额，
 * 被红冲的一侧会重新计入；平台服务费票只有需求方能申请。
 */
export function useInvoiceApplyView(options: InvoiceApplyViewOptions) {
  const copy = computed(() => COPY[options.role])

  /**
   * 可开票金额：本次申请能开出的合计票面。
   *
   * 需求方是「平台服务费票 + 开发者收入票」，乙方只有自己那一侧；已经开过（含审核中、已通过）的
   * 一侧不计入，被红冲的一侧会重新计入——所以两票都提交完之后这里会变成 0，也就提交不了第二次。
   */
  const amountFen = computed(() => options.summary.value?.invoiceableTotalFen ?? 0)
  const amountCny = computed(() => options.summary.value?.invoiceableTotalCny ?? '0.00')

  /**
   * 结单闸门说明：需求未结单时后端不放行开票（可开票金额也已置 0），这里把原因说清楚。
   *
   * 弹窗拿不到该需求的支付模式，状态文案按统一口径的「未知模式回退」处理（`deposit_paid` 会写成
   * 「已付定金 / 待开发」）。响应里没带 `invoiceAvailable`（旧后端）时返回空串，不凭空拦人。
   */
  const invoiceGateNotice = computed(() => {
    const item = options.summary.value
    if (!item || item.invoiceAvailable !== false) {
      return ''
    }
    const statusLabel = item.requirementStatus
      ? requirementStatusLabel(item.requirementStatus)
      : '状态未知'
    return `需求结单后才能申请开票（当前：${statusLabel}）——尾款分账在结单时才会走完，结单后这里会显示可开票金额。`
  })

  /**
   * 已经存在的发票记录：已提交过的一侧只展示进度，不重复申请。
   *
   * 平台服务费票只对需求方展示：票是平台开给他的（买方与接收人都是他），乙方那份汇总里后端
   * 也不会回这张票（见 `invoiceable_summary`），这里再按角色挡一道，避免哪个入口漏了过滤。
   */
  const existingInvoices = computed<{ side: InvoiceSide; invoice: InvoiceRecord }[]>(() => {
    const records: { side: InvoiceSide; invoice: InvoiceRecord }[] = []
    if (options.role === 'customer' && options.summary.value?.platformInvoice) {
      records.push({ side: 'platform', invoice: options.summary.value.platformInvoice })
    }
    if (options.summary.value?.developerInvoice) {
      records.push({ side: 'developer', invoice: options.summary.value.developerInvoice })
    }
    return records
  })

  /** 需要红冲的记录：票面与已实际发生的净额不一致（售后退款 / 赔付已成立）。 */
  const staleInvoices = computed(() =>
    existingInvoices.value.filter((item) => item.invoice.reversalRequired),
  )

  /**
   * 本次申请会开出哪几张票。判定与后端一致（见 `apply_invoices`）：某一侧已经开过、或没有可开
   * 金额，就不在这次申请里；平台服务费票只有需求方能申请。
   */
  const openSides = computed<InvoiceSide[]>(() => {
    const sides: InvoiceSide[] = []
    if (
      options.role === 'customer' &&
      !options.summary.value?.platformInvoice &&
      (options.summary.value?.platformFeeFen ?? 0) > 0
    ) {
      sides.push('platform')
    }
    if (
      !options.summary.value?.developerInvoice &&
      (options.summary.value?.developerInvoiceFen ?? 0) > 0
    ) {
      sides.push('developer')
    }
    return sides
  })

  return {
    copy,
    amountFen,
    amountCny,
    invoiceGateNotice,
    existingInvoices,
    staleInvoices,
    openSides,
  }
}
