import type { InvoiceableSummary } from '@/api/invoices'
import type { RequirementPaymentMode } from '@/api/requirements'

/**
 * 判定「获取发票」入口能不能点，只看这两个数：
 * - `invoiceableTotalFen`：后端按**已成功分账**的结算单算出的本次可开票合计，0 就是一张都开不出；
 * - `settledAmountFen`：该需求已成功分账的实付合计，用来区分「还没分账」与「都已开过票」。
 *
 * 收窄成结构类型，调用方与测试都不必造一份完整汇总。
 */
export type InvoiceAvailabilityFacts = Pick<InvoiceableSummary, 'invoiceableTotalFen' | 'settledAmountFen'>

/** 按需求 id 缓存的可开票汇总；还没请求到或那次请求失败时留空（不写 `null` 之外的值）。 */
export type InvoiceSummaryMap = Record<string, InvoiceAvailabilityFacts | null | undefined>

export type InvoiceEntryState = {
  /** 「获取发票」能不能点。 */
  enabled: boolean
  /** 置灰的原因（给用户看的文案）；能点时为占位之外的空串。 */
  reason: string
}

/**
 * 「获取发票」入口的可点性。
 *
 * 不按需求状态猜：分账不止一次——定金支付后就有一笔定金分账（平台服务费 + 开发者收入），
 * 结单后还有尾款分账，两笔都算进可开票金额。所以「能不能开」只能看后端算出的合计。
 *
 * 拿不到汇总（还在请求中 / 那次请求失败 / 后端认为不是本人需求）时不拦：用户点开弹窗会拿到
 * 准确原因，入口不该因为一次预取失败就看起来像丢了。
 */
export function invoiceEntryState(
  paymentMode: RequirementPaymentMode,
  summary: InvoiceAvailabilityFacts | null | undefined,
): InvoiceEntryState {
  // 无担保模式没有合同与资金流，不存在发票，不必等汇总
  if (paymentMode === 'self_managed') {
    return { enabled: false, reason: '无担保模式不涉及付款与开票' }
  }
  if (!summary) {
    return { enabled: true, reason: '' }
  }
  if (summary.invoiceableTotalFen > 0) {
    return { enabled: true, reason: '' }
  }
  if (summary.settledAmountFen <= 0) {
    return { enabled: false, reason: '本需求还没有成功分账的结算，分账完成后才能开票' }
  }

  return { enabled: false, reason: '本需求能开的发票都已申请过，到「我的发票」可查看进度' }
}
