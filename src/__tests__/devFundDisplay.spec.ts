import { describe, expect, it } from 'vitest'

import {
  buildFundRecords,
  depositWithdrawalStatusText,
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

describe('money', () => {
  it('统一两位小数，缺值按 0 展示', () => {
    expect(money(5)).toBe('¥5.00')
    expect(money(1234.5)).toBe('¥1234.50')
    expect(money(null)).toBe('¥0.00')
    expect(money(undefined)).toBe('¥0.00')
  })
})

describe('状态文案', () => {
  it('两个池子的「已到账」说法不同，别混用', () => {
    expect(incomeWithdrawalStatusText('paid')).toBe('已到账')
    expect(depositWithdrawalStatusText('paid')).toBe('已退回')
    expect(depositWithdrawalStatusText('approved')).toBe('待退回')
    expect(incomeWithdrawalStatusText('payout_processing')).toBe('出款中（T+1）')
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
  it('流入两类用强调色，出款用中性色，冲减用警示色', () => {
    expect(isInflowKind('income')).toBe(true)
    expect(isInflowKind('deposit_recharge')).toBe(true)
    expect(isInflowKind('income_withdrawal')).toBe(false)
    expect(kindTagTone('income', 'success')).toBe('success')
    expect(kindTagTone('income_withdrawal', 'info')).toBe('info')
    expect(kindTagTone('income_reversal', 'danger')).toBe('danger')
  })
})

describe('buildFundRecords', () => {
  it('空入参返回空表', () => {
    expect(buildFundRecords()).toEqual([])
  })

  it('四类台账合并后按时间倒序，收入行记到账额而不是净额', () => {
    const records = buildFundRecords({
      income: [{ ...income, refund_developer_cny: 2, amount_cny: 3 }],
      incomeWithdrawals: [
        {
          withdrawal_id: 'wd-1',
          amount_cny: 2,
          channel: 'alipay',
          account_name: '张三',
          account_no: '6222',
          account_no_masked: '***123',
          creator: '张三',
          updated_at: '2026-09-08 12:00:00',
          status: 'pending_review',
          created_at: '2026-09-08 12:00:00',
        },
      ],
      depositOrders: [
        {
          payment_id: 'dep-1',
          channel: 'adapay',
          amount_cny: 100,
          status: 'paid',
          created_at: '2026-09-08 10:00:00',
          updated_at: '2026-09-08 10:00:00',
        },
      ],
      depositWithdrawals: [
        {
          withdrawal_id: 'dwd-1',
          amount_cny: 100,
          channel: 'adapay',
          account_name: '张三',
          account_no: '6222',
          account_no_masked: '***456',
          creator: '张三',
          source: 'developer_order_deposit',
          updated_at: '2026-09-08 11:00:00',
          status: 'paid',
          review_note: '已退回',
          created_at: '2026-09-08 11:00:00',
        },
      ],
    })
    expect(records.map((record) => record.kind)).toEqual([
      'income',
      'income_reversal',
      'income_withdrawal',
      'deposit_withdrawal',
      'deposit_recharge',
    ])
    // 收入行是到账的 5 元，冲减行单独记被收回的份额 2 元
    expect(records[0]).toMatchObject({ amount: 5, status: '已入账' })
    expect(records[1]).toMatchObject({ amount: 2, status: '已冲减', tag: 'danger' })
    // 退款冲减的时间落在退款时刻；没有退款时刻就退回付款时刻
    expect(records[1]?.time).toBe('2026-09-08 13:00:00')
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
    depositOrders: [
      {
        payment_id: 'dep-1',
        channel: 'adapay',
        amount_cny: 100,
        status: 'paid',
        updated_at: '2026-09-08 10:00:00',
        created_at: '2026-09-08 10:00:00',
      },
    ],
  })

  it('空关键字原样返回', () => {
    expect(filterFundRecords(records, '   ')).toBe(records)
  })

  it('能按中文类型名与参考号命中', () => {
    expect(filterFundRecords(records, '保证金充值')).toHaveLength(1)
    expect(filterFundRecords(records, 'pay-1')).toHaveLength(1)
    expect(filterFundRecords(records, '不存在的关键字')).toHaveLength(0)
  })
})
