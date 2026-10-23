import type { MockRoute } from '../../router'

import {
  DEV_USERNAME,
  devOrderDeposit,
  devWallet,
  devWithdrawalLimits,
  devWithdrawalSetting,
  devWithdrawals,
  payments,
} from '../../db'
import { jsonResponse, noContentResponse } from '../../response'
import { nowText } from './helpers'

export const devPaymentRoutes: MockRoute[] = [
  /* ---------------------------------------------------------------- 开发者侧 */
  {
    method: 'GET',
    path: '/dev/payments/developer-order-deposit',
    note: '接单保证金状态',
    handler: () => jsonResponse({ ...devOrderDeposit, username: DEV_USERNAME }),
  },
  {
    method: 'GET',
    path: '/dev/payments/developer-order-deposit/orders',
    note: '保证金充值记录（「资金明细」里的「保证金充值」那一段；演示数据只有最近一笔）',
    handler: () => jsonResponse(devOrderDeposit.latest_order ? [devOrderDeposit.latest_order] : []),
  },
  {
    method: 'GET',
    path: '/dev/payments/developer-order-deposit/withdrawals',
    note: '保证金提现记录（演示数据里没有保证金退回记录，返回空列表）',
    handler: () =>
      jsonResponse({
        withdrawable_balance_cny: devOrderDeposit.available_cny,
        pending_withdraw_cny: devOrderDeposit.pending_withdraw_cny,
        paid_withdraw_cny: devOrderDeposit.paid_withdraw_cny,
        withdrawals: [],
      }),
  },
  {
    method: 'POST',
    path: '/dev/payments/developer-order-deposit/withdrawals',
    note: '提交保证金提现申请',
    handler: (request) => {
      const body = (request.body ?? {}) as {
        amount_cny?: number
        account_name?: string
        account_no?: string
        note?: string | null
      }

      const record = {
        withdrawal_id: `WD-DEPOSIT-${Date.now()}`,
        creator: DEV_USERNAME,
        source: 'developer_order_deposit' as const,
        amount_cny: Number(body.amount_cny) || 0,
        channel: 'adapay' as const,
        account_name: body.account_name ?? '',
        account_no: body.account_no ?? '',
        account_no_masked: `****${(body.account_no ?? '').slice(-4)}`,
        status: 'pending_review' as const,
        note: body.note ?? null,
        review_note: null,
        reviewed_by: null,
        reviewed_at: null,
        paid_reference: null,
        paid_at: null,
        payout_failure_message: null,
        created_at: nowText(),
        updated_at: nowText(),
      }

      return jsonResponse(record)
    },
  },
  {
    method: 'GET',
    path: '/dev/payments/withdrawals',
    note: '收益提现记录',
    handler: () =>
      jsonResponse({
        withdrawable_balance_cny: devWallet.withdrawable_balance_cny,
        pending_withdraw_cny: devWallet.pending_withdraw_cny,
        paid_withdraw_cny: devWallet.paid_withdraw_cny,
        withdrawals: devWithdrawals,
      }),
  },
  {
    method: 'POST',
    path: '/dev/payments/withdrawals',
    note: '提交收益提现申请：写进记录列表并计入待处理金额',
    handler: (request) => {
      const body = (request.body ?? {}) as {
        amount_cny?: number
        channel?: 'alipay' | 'wechat' | 'adapay'
        account_name?: string
        account_no?: string
        note?: string | null
      }
      const amount = Number(body.amount_cny) || 0

      const record = {
        withdrawal_id: `WD-${Date.now()}`,
        creator: DEV_USERNAME,
        amount_cny: amount,
        channel: body.channel ?? 'adapay',
        account_name: body.account_name ?? '',
        account_no: body.account_no ?? '',
        account_no_masked: `****${(body.account_no ?? '').slice(-4)}`,
        status: 'pending_review' as const,
        note: body.note ?? null,
        review_note: null,
        reviewed_by: null,
        reviewed_at: null,
        paid_reference: null,
        paid_at: null,
        payout_failure_message: null,
        payout_started_at: null,
        payout_attempts: 0,
        created_at: nowText(),
        updated_at: nowText(),
      }

      devWithdrawals.unshift(record)
      devWallet.withdrawable_balance_cny = Math.max(devWallet.withdrawable_balance_cny - amount, 0)
      devWallet.pending_withdraw_cny += amount

      return jsonResponse(record)
    },
  },
  {
    method: 'GET',
    path: '/dev/payments/withdrawal-limits',
    note: '提现限额与通道开关',
    handler: () => jsonResponse(devWithdrawalLimits),
  },
  {
    method: 'GET',
    path: '/dev/payments/withdrawal-setting',
    note: '自动提现设置',
    handler: () => jsonResponse(devWithdrawalSetting),
  },
  {
    method: 'PATCH',
    path: '/dev/payments/withdrawal-setting',
    note: '开关自动提现',
    handler: (request) => {
      const body = (request.body ?? {}) as { auto_withdraw_enabled?: boolean }
      devWithdrawalSetting.auto_withdraw_enabled = body.auto_withdraw_enabled === true
      devWithdrawalSetting.auto_withdraw_enabled_at = devWithdrawalSetting.auto_withdraw_enabled
        ? nowText()
        : null

      return jsonResponse(devWithdrawalSetting)
    },
  },
  {
    method: 'GET',
    path: '/dev/payments/withdrawals/:id',
    note: '单条提现详情（预留）',
    handler: (_request, params) => {
      const record = devWithdrawals.find((item) => item.withdrawal_id === params.id)
      return record ? jsonResponse(record) : noContentResponse()
    },
  },
]
