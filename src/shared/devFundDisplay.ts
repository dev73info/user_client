/**
 * 资金明细的纯展示层：类型/文案/金额格式，以及把四类台账**合成一张表**。
 *
 * 合成规则是这页最容易读错的地方，所以放在这里单独写清（见 `buildFundRecords`）：
 *
 * | 类型 | 数据来源 | 说明 |
 * | --- | --- | --- |
 * | 保证金充值 | `GET /dev/payments/developer-order-deposit/orders` | 已支付的充值单（未支付/失败/关闭的不算钱进来） |
 * | 保证金提现 | `GET /dev/payments/developer-order-deposit/withdrawals` | 保证金退回原充值订单的出款单 |
 * | 收入 | 父级传进来的到账凭据 | 每个里程碑分账到账一笔 |
 * | 收入提现 | `GET /dev/payments/withdrawals` | 接单收入的提现出款单 |
 *
 * 金额一律按**正数**展示、方向靠「类型」区分（与原来的收入记录同一口径），不做正负号——
 * 四类混排时符号容易被读成「同一笔钱的加减」，而它们分属两个互不相通的池子（保证金 / 接单收入）。
 */
import type {
  DevOrderDepositOrderSummary,
  DevOrderDepositWithdrawalRecord,
  DevOrderDepositWithdrawalSummary,
} from '@/api/devOrderDeposit'
import type {
  DevWalletIncomeItem,
  DevWithdrawalRecord,
  DevWithdrawalSummary,
} from '@/api/devWallet'

/** 四类资金动作：类型标签 + 金额着色 + 那一行的说明怎么拼。 */
export type FundRecordKind =
  | 'deposit_recharge'
  | 'deposit_withdrawal'
  | 'income'
  | 'income_reversal'
  | 'income_withdrawal'

export type FundRecord = {
  key: string
  kind: FundRecordKind
  id: string
  amount: number
  detail: string
  account: string
  status: string
  tag: 'success' | 'info' | 'warning' | 'danger'
  note: string
  reference: string
  time: string
}

export const KIND_LABELS: Record<FundRecordKind, string> = {
  deposit_recharge: '保证金充值',
  deposit_withdrawal: '保证金提现',
  income: '收入',
  income_reversal: '退款冲减',
  income_withdrawal: '收入提现',
}

/** 金额展示：一律带 ¥ 与两位小数；缺值按 0 处理（列表里不出现空白格）。 */
export function money(value?: number | null) {
  if (value == null) {
    return '¥0.00'
  }
  return `¥${value.toFixed(2)}`
}

/** 接单收入提现的状态文案（与钱包页原来的口径一致）。 */
export function incomeWithdrawalStatusText(status: DevWithdrawalRecord['status']) {
  const map: Record<DevWithdrawalRecord['status'], string> = {
    pending_review: '待审核',
    approved: '待出款',
    payout_processing: '出款中（T+1）',
    payout_failed: '出款失败',
    rejected: '已驳回',
    paid: '已到账',
  }
  return map[status]
}

/** 保证金提现（退回原充值订单）的状态文案（与保证金那一段原来的口径一致）。 */
export function depositWithdrawalStatusText(status: DevOrderDepositWithdrawalRecord['status']) {
  const map: Record<DevOrderDepositWithdrawalRecord['status'], string> = {
    pending_review: '待审核',
    approved: '待退回',
    payout_processing: '退回处理中',
    payout_failed: '退回需处理',
    rejected: '已驳回',
    paid: '已退回',
  }
  return map[status]
}

export function statusTagType(
  status: DevWithdrawalRecord['status'] | DevOrderDepositWithdrawalRecord['status'],
): 'warning' | 'success' | 'danger' | 'info' {
  if (status === 'pending_review') {
    return 'warning'
  }
  if (status === 'approved' || status === 'payout_processing') {
    return 'info'
  }
  if (status === 'paid') {
    return 'success'
  }
  return 'danger'
}

/** 钱进来的两类（保证金充值 / 收入）用同一种强调色，出款与冲减用中性色。 */
export function isInflowKind(kind: FundRecordKind): boolean {
  return kind === 'income' || kind === 'deposit_recharge'
}

/** 「类型」列的标签色调：冲减是警示色，流入是成功色，出款是信息色。 */
export function kindTagTone(
  kind: FundRecordKind,
  tag: FundRecord['tag'],
): 'success' | 'info' | 'danger' {
  if (tag === 'danger') {
    return 'danger'
  }
  return isInflowKind(kind) ? 'success' : 'info'
}

export type FundRecordSources = {
  depositOrders: DevOrderDepositOrderSummary[]
  depositWithdrawals: DevOrderDepositWithdrawalRecord[]
  income: DevWalletIncomeItem[]
  incomeWithdrawals: DevWithdrawalRecord[]
}

/** 四类台账合成一段，按时间倒序。纯函数：不给入参就返回空表，方便单测。 */
export function buildFundRecords(sources: Partial<FundRecordSources> = {}): FundRecord[] {
  const depositOrders = sources.depositOrders ?? []
  const depositWithdrawals = sources.depositWithdrawals ?? []
  const income = sources.income ?? []
  const incomeWithdrawals = sources.incomeWithdrawals ?? []
  const merged: FundRecord[] = []

  // 保证金充值：到账即一笔；充值单上没有收款账户（钱是从开发者自己的支付渠道进来的）。
  for (const order of depositOrders) {
    merged.push({
      key: `deposit_recharge:${order.payment_id}`,
      kind: 'deposit_recharge',
      id: order.payment_id,
      amount: order.amount_cny,
      detail: '保证金充值',
      account: '渠道：Adapay',
      status: '已到账',
      tag: 'success',
      note: '-',
      reference: order.payment_id,
      time: order.created_at,
    })
  }

  for (const record of depositWithdrawals) {
    merged.push({
      key: `deposit_withdrawal:${record.withdrawal_id}`,
      kind: 'deposit_withdrawal',
      id: record.withdrawal_id,
      amount: record.amount_cny,
      detail: `保证金提现 · ${record.account_name}`,
      account: record.account_no_masked,
      status: depositWithdrawalStatusText(record.status),
      tag: statusTagType(record.status),
      note: record.review_note || record.payout_failure_message || '-',
      reference: record.paid_reference || '-',
      time: record.created_at,
    })
  }

  for (const record of income) {
    // 「收入」行永远记**到账**了多少。此前这里取的是净额，一次售后退款就把那一行改写成
    // ¥0.00——既看不出这笔钱到过账，也和「累计收入」对不上。
    merged.push({
      key: `income:${record.payment_id}`,
      kind: 'income',
      id: record.payment_id,
      amount: record.gross_amount_cny,
      detail: record.title,
      account: `${record.requirement_id} · ${record.customer}`,
      status: '已入账',
      tag: 'success',
      note: '-',
      reference: record.payment_id,
      time: record.paid_at,
    })
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

  for (const record of incomeWithdrawals) {
    merged.push({
      key: `income_withdrawal:${record.withdrawal_id}`,
      kind: 'income_withdrawal',
      id: record.withdrawal_id,
      amount: record.amount_cny,
      detail: `收入提现 · ${record.account_name}`,
      account: record.account_no_masked,
      status: incomeWithdrawalStatusText(record.status),
      tag: statusTagType(record.status),
      note: record.review_note || record.payout_failure_message || '-',
      reference: record.paid_reference || '-',
      time: record.created_at,
    })
  }

  return merged.sort((first, second) => second.time.localeCompare(first.time))
}

/** 关键字过滤：与其它列表页的搜索同口径，跨「类型 / 来源 / 账户 / 状态 / 备注 / 参考号 / 时间」。 */
export function filterFundRecords(records: FundRecord[], keyword?: string | null): FundRecord[] {
  const needle = (keyword ?? '').trim().toLowerCase()
  if (!needle) {
    return records
  }
  return records.filter((record) =>
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

export type { DevOrderDepositWithdrawalSummary, DevWalletIncomeItem, DevWithdrawalSummary }
