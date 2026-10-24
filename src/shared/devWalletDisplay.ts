/**
 * 收益钱包页的纯展示口径：环比文案与提现门档的兜底值。
 *
 * 金额格式化**不在这里另写一份**——`money()` 统一走 `shared/devFundDisplay`，
 * 元↔分统一走 `shared/money`（`parseCnyToFen` / `formatFenAsCny`）。本文件不再提供
 * 「按元收两位小数」那种浮点规整函数：提现金额一律在提交前换成整数分，
 * 浮点元不参与任何请求体与上限比较。
 *
 * 这里只放「页内多处要用、且与请求无关」的几条：
 * | 名称 | 用途 |
 * | --- | --- |
 * | `MIN_WITHDRAW_FEN` | 提现下限兜底（分）：真正的上下限来自 `GET /api/payment/withdrawal-limits/system` |
 * | `rateText` | 今日入账环比：正数带 `+`、缺值按 `0.0%`（页面固定占一格，不留空白） |
 */

/** 提现下限兜底：拿不到 `withdrawal-limits` 时按 1 分判断「有没有可提的钱」。 */
export const MIN_WITHDRAW_FEN = 1

/**
 * 环比百分比文案：正数显式带 `+`，负数自带 `-`。
 *
 * 缺值按 `0.0%` 而不是空串——这一格在读数条里始终占位，空串会把同一行的其它读数挤位。
 */
export function rateText(value?: number | null): string {
  if (value == null) {
    return '0.0%'
  }

  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)}%`
}
