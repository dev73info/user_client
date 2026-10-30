import type { MockRoute } from '../../router'

import {
  DEV_USERNAME,
  devWallet,
  devWithdrawalLimits,
  devWithdrawalSetting,
  devWithdrawals,
  payments,
} from '../../db'
import { errorResponse, jsonResponse, noContentResponse } from '../../response'
import { nowText } from './helpers'

export const devPaymentRoutes: MockRoute[] = [
  /* ---------------------------------------------------------------- 开发者侧 */
  {
    method: 'GET',
    path: '/payment/withdrawals',
    note: '收益提现记录（契约 `WithdrawalResponse[]`）',
    handler: () => jsonResponse(devWithdrawals),
  },
  {
    method: 'GET',
    path: '/payment/withdrawals/balance',
    note: '提现额度（契约 `WithdrawalBalanceResponse`，单位分）',
    handler: () =>
      jsonResponse({
        income_fen: Math.round(devWallet.total_income_cny * 100),
        withdrawn_fen: Math.round(devWallet.paid_withdraw_cny * 100),
        withdrawable_fen: Math.round(devWallet.withdrawable_balance_cny * 100),
      }),
  },
  {
    method: 'POST',
    path: '/payment/withdrawals',
    note: '提交收益提现申请：写进记录列表并计入待处理金额',
    handler: (request) => {
      const body = (request.body ?? {}) as {
        amount_fen?: number
        note?: string | null
      }
      const amountFen = Number(body.amount_fen) || 0
      const amount = amountFen / 100

      const record = {
        withdrawal_id: `WD-${Date.now()}`,
        creator: DEV_USERNAME,
        amount_fen: amountFen,
        account_name: '开发者',
        account_no_tail: '3445',
        source: 'income',
        status: 'pending_review' as const,
        status_label: '待审核',
        note: body.note ?? '',
        review_note: '',
        payout_failure_reason: null,
        payout_attempts: 0,
        created_time: nowText(),
        paid_time: null,
      }

      devWithdrawals.unshift(record)
      devWallet.withdrawable_balance_cny = Math.max(devWallet.withdrawable_balance_cny - amount, 0)
      devWallet.pending_withdraw_cny += amount

      return jsonResponse(record)
    },
  },
  {
    method: 'POST',
    path: '/payment/refunds/sync',
    note: '主动回查在途退款（契约 `RefundSyncOutcome`）',
    // 钱包页每次刷新都会先调一次它再读余额，漏了它就会一直落在 `uncovered` 名单里。
    // 假数据没有真渠道可回查，回一份「查了 0 笔」的干净结果即可：形状必须齐，
    // 前端按 `errors.length` 决定要不要弹提示，缺字段会直接抛。
    handler: () => jsonResponse({ checked: 0, settled: 0, still_pending: 0, errors: [] }),
  },
  {
    method: 'GET',
    path: '/payment/withdrawal-limits/system',
    note: '提现限额（契约 `WithdrawalConfig`）',
    handler: () => jsonResponse(devWithdrawalLimits),
  },
  {
    method: 'GET',
    path: '/payment/withdrawal-setting',
    note: '自动提现设置',
    handler: () => jsonResponse(devWithdrawalSetting),
  },
  {
    method: 'PATCH',
    path: '/payment/withdrawal-setting',
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
    method: 'DELETE',
    path: '/payment/withdrawals/:id',
    note: '删除提现单：只允许删「钱还没动过」的单（待审核 / 已驳回）',
    handler: (_request, params) => {
      const index = devWithdrawals.findIndex((item) => item.withdrawal_id === params.id)
      const record = index >= 0 ? devWithdrawals[index] : null
      if (!record) {
        return errorResponse(404, '提现单不存在')
      }
      if (record.status !== 'pending_review' && record.status !== 'rejected') {
        return errorResponse(409, '这笔提现的钱已经动过，不能删除')
      }
      devWithdrawals.splice(index, 1)
      return noContentResponse()
    },
  },
]
