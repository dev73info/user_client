/**
 * 资金明细的纯展示层：类型/文案/金额格式，以及把三类台账**合成一张表**。
 *
 * 合成规则是这页最容易读错的地方，所以放在这里单独写清（见 `buildFundRecords`）：
 *
 * | 类型 | 数据来源 | 说明 |
 * | --- | --- | --- |
 * | 收入 | 父级传进来的 `DevIncomeResponse[]` | 每个里程碑分账到账一笔 |
 * | 退款冲减 | 同上，`refund_developer_cny > 0` 的行 | 售后按原分账份额从开发者收回的那部分 |
 * | 收入提现 | `GET /api/payment/withdrawals` | 接单收入的提现出款单 |
 * | 保证金充值 | `GET /api/payment/developer-order-deposit` 的 `ledger`（`kind = recharge`） | 预付账户充值入账 |
 * | 保证金提现 | `GET /api/payment/developer-order-deposit/withdrawals` | 预付账户退回保证金的出款单 |
 *
 * 保证金池的 `freeze` / `unfreeze` / `refund_*` 流水是账户内部动作（接单冻结、解冻、退款占用），
 * 不进这张表：这里是「钱进出了哪些口」，不是预付账户的完整账本。
 *
 * 金额一律按**正数**展示、方向靠「类型」区分（与原来的收入记录同一口径），不做正负号——
 * 混排时符号容易被读成「同一笔钱的加减」。
 */
import type { PrepaidLedgerEntry, PrepaidWithdrawal } from '@/api/devOrderDeposit'
import type { DevWalletIncomeItem, DevWithdrawalRecord } from '@/api/devWallet'

import { buildDepositFundRecords } from './devDepositFundRecords'
import { incomeWithdrawalStatusText, statusTagType } from './devWithdrawalStatus'

export { incomeWithdrawalStatusText, statusTagType } from './devWithdrawalStatus'

/** 五类资金动作：类型标签 + 金额着色 + 那一行的说明怎么拼。 */
export type FundRecordKind =
  | 'income'
  | 'income_reversal'
  | 'income_withdrawal'
  | 'deposit_recharge'
  | 'deposit_withdrawal'

export type FundAmountPart = {
  amount: number
  /** 该笔分账的支付阶段：定金 / 尾款 / 收入。 */
  label: string
}

export type FundRecord = {
  key: string
  kind: FundRecordKind
  id: string
  amount: number
  /** 收入的分笔金额与阶段；悬停每笔金额时展示。 */
  amountParts?: FundAmountPart[]
  detail: string
  account: string
  status: string
  tag: 'success' | 'info' | 'warning' | 'danger'
  note: string
  reference: string
  time: string
}

export const KIND_LABELS: Record<FundRecordKind, string> = {
  income: '收入',
  income_reversal: '退款冲减',
  income_withdrawal: '提现',
  deposit_recharge: '保证金充值',
  deposit_withdrawal: '保证金提现',
}

/** 金额展示：一律带 ¥ 与两位小数；缺值按 0 处理（列表里不出现空白格）。 */
export function money(value?: number | null) {
  if (value == null) {
    return '¥0.00'
  }
  return `¥${value.toFixed(2)}`
}

/** 后端支付阶段 → 金额悬停文案。 */
export function paymentStageLabel(stage?: string | null) {
  if (stage === 'deposit') {
    return '定金'
  }
  if (stage === 'final') {
    return '尾款'
  }
  return '收入'
}

/** 金额列：同一需求合并后把分笔摆出来，如 `¥0.80（¥0.16 + ¥0.64）`。 */
export function fundAmount(record: Pick<FundRecord, 'amount' | 'amountParts'>) {
  const parts = record.amountParts ?? []
  if (parts.length < 2) {
    return money(record.amount)
  }
  return `${money(record.amount)}（${parts.map((part) => money(part.amount)).join(' + ')}）`
}

/** 钱进来的那一类（收入 / 保证金充值）用青色强调，出账用其它色调。 */
export function isInflowKind(kind: FundRecordKind): boolean {
  return kind === 'income' || kind === 'deposit_recharge'
}

/** 「类型」列的标签色调：收入黄色、提现绿色、退款冲减红色、保证金提现蓝色。 */
export function kindTagTone(kind: FundRecordKind): 'warning' | 'success' | 'danger' | 'info' {
  if (kind === 'income') {
    return 'warning'
  }
  if (kind === 'income_reversal') {
    return 'danger'
  }
  if (kind === 'deposit_withdrawal') {
    return 'info'
  }
  return 'success'
}

export type FundRecordSources = {
  income: DevWalletIncomeItem[]
  incomeWithdrawals: DevWithdrawalRecord[]
  /** 预付账户流水：只取 `kind = recharge` 那几行，其余是账户内部动作。 */
  depositLedger: PrepaidLedgerEntry[]
  depositWithdrawals: PrepaidWithdrawal[]
}

/** 三类台账合成一段，按时间倒序。纯函数：不给入参就返回空表，方便单测。 */
export function buildFundRecords(sources: Partial<FundRecordSources> = {}): FundRecord[] {
  const income = sources.income ?? []
  const incomeWithdrawals = sources.incomeWithdrawals ?? []
  const depositLedger = sources.depositLedger ?? []
  const depositWithdrawals = sources.depositWithdrawals ?? []
  const merged: FundRecord[] = []

  // 同一需求通常有定金与尾款两笔分账。收入按需求合并成一行，
  // 金额列同时展开分笔，避免同一项目在明细里看起来像两笔独立收入。
  const incomeByRequirement = new Map<string, DevWalletIncomeItem[]>()
  for (const record of income) {
    const groupKey = record.requirement_id || record.payment_id
    const group = incomeByRequirement.get(groupKey) ?? []
    group.push(record)
    incomeByRequirement.set(groupKey, group)
  }

  for (const [requirementId, records] of incomeByRequirement) {
    const latest = [...records].sort(
      (first, second) =>
        String(second.paid_at ?? '').localeCompare(String(first.paid_at ?? '')) ||
        second.gross_amount_cny - first.gross_amount_cny,
    )[0]!
    const amountParts = records
      .map((record) => ({
        amount: record.gross_amount_cny,
        label: paymentStageLabel(record.payment_stage),
      }))
      .sort((first, second) => first.amount - second.amount)
    const amount = amountParts.reduce((total, part) => total + part.amount, 0)

    // 「收入」行永远记**到账**了多少。此前这里取的是净额，一次售后退款就把那一行改写成
    // ¥0.00——既看不出这笔钱到过账，也和「累计收入」对不上。
    merged.push({
      key: `income:${requirementId}`,
      kind: 'income',
      id: requirementId,
      amount,
      amountParts,
      detail: latest.title,
      account: `${latest.requirement_id} · ${latest.customer}`,
      status: '已入账',
      tag: 'success',
      note: '-',
      reference: records.map((record) => record.payment_id).join(' / '),
      time: latest.paid_at,
    })

    for (const record of records) {
      // 售后按原分账份额收回的那部分单独成行：钱往哪走了看得见，也不用回头改历史收入行。
      if (record.refund_developer_cny > 0) {
        // 这一行的金额是**从开发者这里收回的份额**，不是客户实收：结单后的退款由渠道按原分账
        // 份额从各方收回去，平台会按自己的服务费承担一部分（实测：客户申请 199.00，
        // 开发者份额 160.00 = 128.00 + 32.00，余下 39.00 由平台出）。两个数摆在一起，
        // 免得 128.00 / 32.00 被读成「客户只退了 160」。
        const shareNote =
          record.requirement_refund_cny > record.refund_developer_cny
            ? `本次退款客户实收 ${money(record.requirement_refund_cny)}（含平台按服务费承担的部分），此处只记从开发者收回的份额`
            : '售后退款按原分账份额从开发者收回'
        merged.push({
          key: `income_reversal:${record.payment_id}`,
          kind: 'income_reversal',
          id: record.payment_id,
          amount: record.refund_developer_cny,
          detail: `退款冲减（开发者份额）· ${record.title}`,
          account: `${record.requirement_id} · ${record.customer}`,
          status: '已冲减',
          tag: 'danger',
          note: shareNote,
          reference: record.payment_id,
          time: record.refunded_at ?? record.paid_at,
        })
      }
    }
  }

  for (const record of incomeWithdrawals) {
    merged.push({
      key: `income_withdrawal:${record.withdrawal_id}`,
      kind: 'income_withdrawal',
      id: record.withdrawal_id,
      amount: record.amount_fen / 100,
      detail: `收入提现 · ${record.account_name}`,
      account: record.account_no_tail,
      // 已知状态用紧凑文案，未知状态才回落到后端下发的 `status_label`
      status: incomeWithdrawalStatusText(record.status, record.status_label),
      tag: statusTagType(record.status),
      note: record.review_note || record.payout_failure_reason || '-',
      reference: record.withdrawal_id,
      time: record.created_time,
    })
  }

  merged.push(...buildDepositFundRecords(depositLedger, depositWithdrawals))

  // 时间缺失（契约里 nullable 的字段）不能让它抛 `Cannot read properties of undefined`：
  // 缺时间的行按空串参与比较，落到表尾，其余行照常倒序。
  return merged.sort((first, second) =>
    String(second.time ?? '').localeCompare(String(first.time ?? '')),
  )
}

/** 关键字过滤：与其它列表页的搜索同口径，跨「类型 / 来源 / 账户 / 状态 / 备注 / 参考号 / 时间」。 */
export function filterFundRecords(
  records: FundRecord[],
  keyword?: string | null,
  kind?: FundRecordKind | 'all' | null,
): FundRecord[] {
  const matchedKind =
    kind && kind !== 'all' ? records.filter((record) => record.kind === kind) : records
  const needle = (keyword ?? '').trim().toLowerCase()
  if (!needle) {
    return matchedKind
  }
  return matchedKind.filter((record) =>
    [
      record.id,
      KIND_LABELS[record.kind],
      record.detail,
      record.account,
      record.status,
      record.note,
      record.reference,
      record.time,
    ].some((field) =>
      String(field ?? '')
        .toLowerCase()
        .includes(needle),
    ),
  )
}

export type { DevWalletIncomeItem }
