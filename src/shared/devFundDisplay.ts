/**
 * 资金明细的纯展示层：类型/文案/金额格式，以及把两类台账**合成一张表**。
 *
 * 合成规则是这页最容易读错的地方，所以放在这里单独写清（见 `buildFundRecords`）：
 *
 * | 类型 | 数据来源 | 说明 |
 * | --- | --- | --- |
 * | 收入 | 父级传进来的 `DevIncomeResponse[]` | 每个里程碑分账到账一笔 |
 * | 退款冲减 | 同上，`refund_developer_cny > 0` 的行 | 售后按原分账份额从开发者收回的那部分 |
 * | 收入提现 | `GET /api/payment/withdrawals` | 接单收入的提现出款单 |
 *
 * 只有这两类台账在契约里存在：1.x 的「保证金充值 / 保证金提现」是预付钱包，2.0 没有对应端点，
 * 接单保证金改由后端从可提现收益里冻结（`POST` 接单时判，不够回 409）。
 *
 * 金额一律按**正数**展示、方向靠「类型」区分（与原来的收入记录同一口径），不做正负号——
 * 混排时符号容易被读成「同一笔钱的加减」。
 */
import type { DevWalletIncomeItem, DevWithdrawalRecord } from '@/api/devWallet'

/** 三类资金动作：类型标签 + 金额着色 + 那一行的说明怎么拼。 */
export type FundRecordKind = 'income' | 'income_reversal' | 'income_withdrawal'

export type FundRecord = {
  key: string
  kind: FundRecordKind
  id: string
  amount: number
  /** 同一需求单合并后的分笔金额；未合并时为空。 */
  amountBreakdown?: number[]
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
  income_withdrawal: '收入提现',
}

/** 金额展示：一律带 ¥ 与两位小数；缺值按 0 处理（列表里不出现空白格）。 */
export function money(value?: number | null) {
  if (value == null) {
    return '¥0.00'
  }
  return `¥${value.toFixed(2)}`
}

/** 金额列：同一需求合并后把分笔摆出来，如 `¥0.80（¥0.16 + ¥0.64）`。 */
export function fundAmount(record: Pick<FundRecord, 'amount' | 'amountBreakdown'>) {
  const parts = record.amountBreakdown ?? []
  if (parts.length < 2) {
    return money(record.amount)
  }
  return `${money(record.amount)}（${parts.map((part) => money(part)).join(' + ')}）`
}

/**
 * 接单收入提现的状态文案：**兜底**用。
 *
 * 契约的 `WithdrawalResponse` 自带 `status_label`（后端下发的中文说明），显示一律以它为准；
 * 这张 map 只在 `status_label` 为空时兜底，所以不写任何到账承诺（比如 1.x 页面里那句
 * 「出款中（T+1）」的 T+1 后端并没有承诺，渠道打款时间不由前端规定）。
 */
export function incomeWithdrawalStatusText(status: DevWithdrawalRecord['status']) {
  const map: Record<string, string> = {
    pending_review: '待审核',
    approved: '待出款',
    payout_processing: '出款中',
    payout_failed: '出款失败',
    rejected: '已驳回',
    paid: '已到账',
    closed: '已关闭',
  }
  return map[status] ?? status
}

export function statusTagType(
  status: DevWithdrawalRecord['status'],
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

/** 钱进来的那一类（收入）用同一种强调色，出款与冲减用中性色/警示色。 */
export function isInflowKind(kind: FundRecordKind): boolean {
  return kind === 'income'
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
  income: DevWalletIncomeItem[]
  incomeWithdrawals: DevWithdrawalRecord[]
}

/** 两类台账合成一段，按时间倒序。纯函数：不给入参就返回空表，方便单测。 */
export function buildFundRecords(sources: Partial<FundRecordSources> = {}): FundRecord[] {
  const income = sources.income ?? []
  const incomeWithdrawals = sources.incomeWithdrawals ?? []
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
    const breakdown = records
      .map((record) => record.gross_amount_cny)
      .sort((first, second) => first - second)
    const amount = breakdown.reduce((total, part) => total + part, 0)

    // 「收入」行永远记**到账**了多少。此前这里取的是净额，一次售后退款就把那一行改写成
    // ¥0.00——既看不出这笔钱到过账，也和「累计收入」对不上。
    merged.push({
      key: `income:${requirementId}`,
      kind: 'income',
      id: requirementId,
      amount,
      amountBreakdown: breakdown.length > 1 ? breakdown : undefined,
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
      // 中文说明以后端下发的 `status_label` 为准，本地 map 只兜底
      status: record.status_label || incomeWithdrawalStatusText(record.status),
      tag: statusTagType(record.status),
      note: record.review_note || record.payout_failure_reason || '-',
      reference: record.withdrawal_id,
      time: record.created_time,
    })
  }

  // 时间缺失（契约里 nullable 的字段）不能让它抛 `Cannot read properties of undefined`：
  // 缺时间的行按空串参与比较，落到表尾，其余行照常倒序。
  return merged.sort((first, second) =>
    String(second.time ?? '').localeCompare(String(first.time ?? '')),
  )
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

export type { DevWalletIncomeItem }
