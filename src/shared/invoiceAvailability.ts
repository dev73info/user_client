import type { InvoiceableSummary } from '@/api/invoices'
import type { RequirementPaymentMode } from '@/api/requirements'
import { requirementStatusLabel } from '@/shared/requirementStatus'

/**
 * 判定「获取发票」入口能不能点，看这几项：
 * - `invoiceAvailable`：后端的**结单闸门**——需求已结单（`completed`）才为 true，未结单时后端还会把
 *   可开票金额一并置 0；
 * - `requirementStatus`：该需求当前状态码，只用来把「当前：<状态文案>」拼进闸门提示；
 * - `invoiceableTotalFen`：后端按**已成功分账**的结算单算出的本次可开票合计，0 就是一张都开不出；
 * - `settledAmountFen`：该需求已成功分账的实付合计，用来区分「还没分账」与「都已开过票」。
 *
 * 收窄成结构类型，调用方与测试都不必造一份完整汇总。后两项声明为可选：mock 与旧版后端不会返回它们，
 * 那时**不做闸门判断**（`undefined` 只代表后端没给这个信息，不代表闸门关闭），否则旧数据会被全部拦死。
 */
export type InvoiceAvailabilityFacts =
  Pick<InvoiceableSummary, 'invoiceableTotalFen' | 'settledAmountFen'>
  & {
    invoiceAvailable?: InvoiceableSummary['invoiceAvailable']
    requirementStatus?: InvoiceableSummary['requirementStatus']
  }

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
 * 第一道闸门是后端新增的 `invoiceAvailable`（需求已结单才放行）：未结单时分账还没走完，后端也会把
 * 可开票金额置 0，这里提前把入口置灰并把当前状态写进提示，免得用户点开弹窗只看到「¥0.00」猜原因。
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
  // 结单闸门：只有已结单（completed）的需求才能开票。`undefined` 是旧后端 / mock，见上面的说明，不拦。
  if (summary.invoiceAvailable === false) {
    const statusLabel = summary.requirementStatus
      ? requirementStatusLabel(summary.requirementStatus, paymentMode)
      : '状态未知'
    return { enabled: false, reason: `需求结单后才能申请开票（当前：${statusLabel}）` }
  }
  if (summary.invoiceableTotalFen > 0) {
    return { enabled: true, reason: '' }
  }
  if (summary.settledAmountFen <= 0) {
    return { enabled: false, reason: '本需求还没有成功分账的结算，分账完成后才能开票' }
  }

  return { enabled: false, reason: '本需求能开的发票都已申请过，到「我的发票」可查看进度' }
}
