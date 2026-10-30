/**
 * 保证金（预付账户）与信用额度的假路由。
 *
 * 契约在 `crates/business/payment/src/api/prepaid.rs` 与 `credit/src/api/mod.rs`，
 * 前端类型见 `src/api/devOrderDeposit`、`src/api/devCredit`。这一族原来整组没实现，
 * 钱包页的保证金卡与充值弹窗都读不到数：靠兜底的 `[]` 取 `account.balance_fen` 会直接抛错。
 *
 * 只做「能读、能充值下单、能提现」这三条主链，余额与流水在 `db/prepaid.ts` 里真实推进，
 * 所以预览时充一笔、提一笔都能看到数字变化，而不是只换一句提示。
 */

import type { MockRoute } from '../../router'

import {
  appendLedger,
  pendingPrepaidWithdrawalFen,
  prepaidAccount,
  prepaidLedger,
  prepaidWithdrawals,
  pushPrepaidWithdrawal,
  withdrawablePrepaidFen,
} from '../../db/prepaid'
import { DEV_USERNAME } from '../../db/shared'
import { errorResponse, jsonResponse } from '../../response'
import { nowText } from './helpers'

/** 充值单内存表：以 order_no 为键，供查单接口回读。 */
const rechargeOrders = new Map<string, Record<string, unknown>>()

let nextOrderSeq = 1

function buildRechargeOrder(amountFen: number, channel: string) {
  const orderNo = `PP-DEMO-${nextOrderSeq}`
  nextOrderSeq += 1

  const order = {
    order_no: orderNo,
    biz_type: 'prepaid_recharge',
    biz_no: orderNo,
    payer: DEV_USERNAME,
    amount_fen: amountFen,
    channel,
    status: 'pending',
    status_label: '待支付',
    subject: '接单保证金充值',
    provider_payment_id: null,
    // 与真实后端同形状：`redirect_url` 才是拉起收银台用的那个字段，
    // 早先前端读的是不存在的 `pay_url`，于是充值二维码永远画不出来。
    client_action: {
      redirect_url: `https://mock.73info.local/pay/${orderNo}`,
      qr_code: null,
      sdk_payload: null,
    },
    paid_at: null,
    created_time: nowText(),
  }
  rechargeOrders.set(orderNo, order)

  return order
}

export const prepaidRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/payment/developer-order-deposit',
    note: '保证金总览：余额、累计、可提额度与最近流水（契约 `PrepaidAccountStatementResponse`）',
    handler: () =>
      jsonResponse({
        account: prepaidAccount,
        ledger: prepaidLedger.slice(0, 20),
        pending_withdrawal_fen: pendingPrepaidWithdrawalFen(),
        withdrawable_fen: withdrawablePrepaidFen(),
      }),
  },
  {
    method: 'POST',
    path: '/payment/developer-order-deposit',
    note: '发起充值下单：金额整数分，返回带 redirect_url 的收银台动作',
    handler: (request) => {
      const body = (request.body ?? {}) as { amount_fen?: number; channel?: string }
      const amountFen = Math.round(Number(body.amount_fen ?? 0))

      if (!Number.isFinite(amountFen) || amountFen <= 0) {
        return errorResponse(400, '充值金额必须大于 0')
      }

      return jsonResponse(buildRechargeOrder(amountFen, body.channel ?? 'alipay'))
    },
  },
  {
    method: 'GET',
    path: '/payment/developer-order-deposit/orders',
    note: '我的充值单（最新在前）',
    handler: () => {
      const items = [...rechargeOrders.values()].reverse()

      return jsonResponse({
        total: items.length,
        page: 1,
        page_size: items.length || 20,
        items,
      })
    },
  },
  {
    method: 'GET',
    path: '/payment/developer-order-deposit/orders/:payment_id',
    note: '单张充值单',
    handler: (_request, params) => {
      const order = rechargeOrders.get(params.payment_id ?? '')

      return order ? jsonResponse(order) : errorResponse(404, '充值单不存在')
    },
  },
  {
    method: 'GET',
    path: '/payment/developer-order-deposit/withdrawals',
    note: '我的保证金提现单（契约 `WithdrawalResponse[]`）',
    handler: () => jsonResponse(prepaidWithdrawals),
  },
  {
    method: 'POST',
    path: '/payment/developer-order-deposit/withdrawals',
    note: '申请退回保证金：提交即占住可提额度，状态待审核',
    handler: (request) => {
      const body = (request.body ?? {}) as { amount_fen?: number; note?: string | null }
      const amountFen = Math.round(Number(body.amount_fen ?? 0))

      if (!Number.isFinite(amountFen) || amountFen <= 0) {
        return errorResponse(400, '提现金额必须大于 0')
      }
      if (amountFen > withdrawablePrepaidFen()) {
        return errorResponse(400, '提现金额超过可提额度')
      }

      return jsonResponse(pushPrepaidWithdrawal(amountFen, (body.note ?? '').trim()))
    },
  },
  {
    method: 'GET',
    path: '/credit/credit/me',
    note: '开发者信用与额度：没启用封顶就不展示那一枚标签，但字段要齐（契约 `CreditSelfResponse`）',
    handler: () =>
      jsonResponse({
        username: DEV_USERNAME,
        credit_score: 82.5,
        fen_per_credit: 10000,
        max_deposit_fen: 5000000,
        max_order_amount_fen: 2000000,
        remaining_deposit_cap_fen: 4880000,
        enforce_deposit_limit: true,
        enforce_order_limit: true,
      }),
  },
]
