import { describe, expect, it } from 'vitest'

import {
  buildFundRecords,
  filterFundRecords,
  incomeWithdrawalStatusText,
  isInflowKind,
  kindTagTone,
  money,
  statusTagType,
} from '@/shared/devFundDisplay'

const income = {
  payment_id: 'pay-1',
  requirement_id: 'req-1',
  title: '小程序首页改版',
  customer: '甲方',
  gross_amount_cny: 5,
  refund_developer_cny: 0,
  amount_cny: 5,
  paid_at: '2026-09-08 13:00:00',
  requirement_status: 'completed' as const,
  refunded_at: null,
  requirement_refund_cny: 0,
}

const withdrawal = {
  withdrawal_id: 'wd-1',
  amount_fen: 200,
  account_name: '张三',
  account_no_tail: '1234',
  creator: '张三',
  source: 'income',
  status: 'pending_review',
  status_label: '待审核',
  note: '',
  review_note: '',
  payout_failure_reason: null,
  payout_attempts: 0,
  created_time: '2026-09-08 12:00:00',
}

describe('money', () => {
  it('统一两位小数，缺值按 0 展示', () => {
    expect(money(5)).toBe('¥5.00')
    expect(money(1234.5)).toBe('¥1234.50')
    expect(money(null)).toBe('¥0.00')
    expect(money(undefined)).toBe('¥0.00')
  })
})

describe('状态文案', () => {
  it('提现状态以契约的 status_label 为准，本地 map 只兜底且不带任何到账承诺', () => {
    expect(incomeWithdrawalStatusText('paid')).toBe('已到账')
    expect(incomeWithdrawalStatusText('pending_review')).toBe('待审核')
    // 「T+1」是 1.x 页面自己编的到账承诺，契约的 WithdrawalResponse 没有这个字段
    expect(incomeWithdrawalStatusText('payout_processing')).toBe('出款中')
    // 契约里没见过的状态原样透出，不猜
    expect(incomeWithdrawalStatusText('unknown_state')).toBe('unknown_state')
  })

  it('标签色调按状态分档：待审核警示、出款中信息、失败危险', () => {
    expect(statusTagType('pending_review')).toBe('warning')
    expect(statusTagType('approved')).toBe('info')
    expect(statusTagType('payout_processing')).toBe('info')
    expect(statusTagType('paid')).toBe('success')
    expect(statusTagType('payout_failed')).toBe('danger')
    expect(statusTagType('rejected')).toBe('danger')
  })
})

describe('类型着色', () => {
  it('只有收入算流入，出款用中性色，冲减用警示色', () => {
    expect(isInflowKind('income')).toBe(true)
    expect(isInflowKind('income_withdrawal')).toBe(false)
    expect(isInflowKind('income_reversal')).toBe(false)
    expect(kindTagTone('income', 'success')).toBe('success')
    expect(kindTagTone('income_withdrawal', 'info')).toBe('info')
    expect(kindTagTone('income_reversal', 'danger')).toBe('danger')
  })
})

describe('buildFundRecords', () => {
  it('空入参返回空表', () => {
    expect(buildFundRecords()).toEqual([])
  })

  it('两类台账合并后按时间倒序，收入行记到账额而不是净额', () => {
    const records = buildFundRecords({
      income: [{ ...income, refund_developer_cny: 2, amount_cny: 3 }],
      incomeWithdrawals: [withdrawal],
    })
    expect(records.map((record) => record.kind)).toEqual([
      'income',
      'income_reversal',
      'income_withdrawal',
    ])
    // 收入行是到账的 5 元，冲减行单独记被收回的份额 2 元
    expect(records[0]).toMatchObject({ amount: 5, status: '已入账' })
    expect(records[1]).toMatchObject({ amount: 2, status: '已冲减', tag: 'danger' })
    // 退款冲减的时间落在退款时刻；没有退款时刻就退回付款时刻
    expect(records[1]?.time).toBe('2026-09-08 13:00:00')
    // 提现行的状态用契约下发的 status_label
    expect(records[2]).toMatchObject({ amount: 2, status: '待审核' })
  })

  it('时间缺失的行不抛错，落到表尾', () => {
    const records = buildFundRecords({
      income: [{ ...income, paid_at: undefined as unknown as string }],
      incomeWithdrawals: [withdrawal],
    })
    expect(records.map((record) => record.id)).toEqual(['wd-1', 'pay-1'])
  })

  it('客户实收高于开发者份额时，备注点明差额由平台承担', () => {
    const [incomeRecord, reversal] = buildFundRecords({
      income: [{ ...income, refund_developer_cny: 160, requirement_refund_cny: 199 }],
    })
    expect(incomeRecord?.kind).toBe('income')
    expect(reversal?.note).toContain('¥199.00')
    expect(reversal?.note).toContain('平台按服务费承担')
  })

  it('无退款时备注用通用话术', () => {
    const [, reversal] = buildFundRecords({
      income: [{ ...income, refund_developer_cny: 160, requirement_refund_cny: 160 }],
    })
    expect(reversal?.note).toBe('售后退款按原分账份额从开发者收回')
  })
})

describe('filterFundRecords', () => {
  const records = buildFundRecords({
    income: [income],
    incomeWithdrawals: [withdrawal],
  })

  it('空关键字原样返回', () => {
    expect(filterFundRecords(records, '   ')).toBe(records)
  })

  it('能按中文类型名与参考号命中', () => {
    // 「收入」同时命中「收入」与「收入提现」两个类型标签
    expect(filterFundRecords(records, '收入')).toHaveLength(2)
    expect(filterFundRecords(records, '收入提现')).toHaveLength(1)
    expect(filterFundRecords(records, 'pay-1')).toHaveLength(1)
    expect(filterFundRecords(records, '不存在的关键字')).toHaveLength(0)
  })
})
