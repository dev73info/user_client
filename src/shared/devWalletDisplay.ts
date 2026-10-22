/**
 * 收益钱包页的纯展示口径：金额规整、环比文案与提现门档的兜底值。
 *
 * 金额格式化**不在这里另写一份**——`money()` 统一走 `shared/devFundDisplay`，
 * 与资金明细、开发者首页资金卡同一份实现（原来本页自带一份一模一样的 `money`）。
 *
 * 这里只放「页内多处要用、且与请求无关」的几条：
 * | 名称 | 用途 |
 * | --- | --- |
 * | `normalizeCnyAmount` | 提交前把金额收成两位小数（后端也校验，这里先收一次避免 0.30000000000000004） |
 * | `rateText` | 今日入账环比：正数带 `+`、缺值按 `0.0%`（页面固定占一格，不留空白） |
 * | `MIN_WITHDRAW_CNY` / `MAX_WITHDRAW_CNY` / `WITHDRAW_NOTE_MAX_LEN` | 提现门档兜底值 |
 */

/** 提现门档兜底：本页没接 `getDevWithdrawalLimits`，这三个数与 `validateDevWithdrawalRequest`
 *  的默认值同源（原来视图里挂着一个永远为 null 的 `withdrawalLimits`，口径全靠 `?? 0.01` 这类兜底）。 */
export const MIN_WITHDRAW_CNY = 0.01
export const MAX_WITHDRAW_CNY = 999999
export const WITHDRAW_NOTE_MAX_LEN = 200

/** 金额收两位小数：避免浮点尾数（`19.99 * 3` 这类）带进请求体与展示。 */
export function normalizeCnyAmount(value: number): number {
  return Math.round(value * 100) / 100
}

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
