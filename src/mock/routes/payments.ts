/**
 * 支付：担保模式的定金 / 尾款下单与确认，以及开发者侧的接单保证金与提现。
 *
 * 下单 + 确认这条链在 mock 里是真会推进状态的：确认支付后需求单会从「待付定金」走到「已付定金」，
 * 尾款确认后走到「待结算」，所以四流的演示能一路走到底，而不是只换一个按钮文案。
 *
 * 爱签 / 支付宝 / 微信都不过第三方：mock 直接返回可用的占位结果（支付宝页面单给一段 HTML）。
 */

import {
  DEV_USERNAME,
  devOrderDeposit,
  devWallet,
  devWithdrawalLimits,
  devWithdrawalSetting,
  devWithdrawals,
  findRequirement,
  markPaymentPaid,
  paymentOf,
  payments,
  type MockPayment,
} from '../db'
import { defineRouteTable, type MockRoute } from '../router'
import { jsonResponse, noContentResponse, readString, textResponse } from '../response'

function nowText(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function expiresAt(): string {
  const date = new Date()
  date.setMinutes(date.getMinutes() + 30)
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 19)}`
}

/** 支付目的推断：需求在「待付尾款」就是尾款单，其余算定金单。 */
function inferKind(requirementId: string): 'deposit' | 'final' {
  const requirement = findRequirement(requirementId)
  return requirement?.status === 'pending_final' ? 'final' : 'deposit'
}

function ensurePayment(
  requirementId: string,
  amount: number,
  channel: 'alipay' | 'wechat',
): MockPayment {
  const kind = inferKind(requirementId)
  const existing = paymentOf(requirementId, kind)

  if (existing && existing.status !== 'paid') {
    existing.amount_cny = amount || existing.amount_cny
    existing.channel = channel
    return existing
  }

  const requirement = findRequirement(requirementId)
  const record: MockPayment = {
    payment_id: `PAY-${requirementId}-${kind.toUpperCase()}-${Date.now()}`,
    requirement_id: requirementId,
    kind,
    channel,
    amount_cny: amount,
    status: 'pending',
    description: `${requirement?.title ?? requirementId} · ${kind === 'deposit' ? '定金' : '尾款'}`,
    created_at: nowText(),
    paid_at: null,
  }

  payments.push(record)
  return record
}

function createPayload(record: MockPayment, channel: 'alipay' | 'wechat') {
  const base = {
    payment_id: record.payment_id,
    requirement_id: record.requirement_id,
    channel,
    amount_cny: record.amount_cny,
    status: record.status,
    expires_at: expiresAt(),
  }

  if (channel === 'wechat') {
    return {
      ...base,
      wechat_prepay_id: `wx-prepay-${record.payment_id}`,
      code_url: `weixin://wxpay/bizpayurl?pr=${record.payment_id}`,
    }
  }

  return {
    ...base,
    alipay_order_string: `<form id="mock-alipay" action="about:blank"></form><script>/* mock 支付单 ${record.payment_id} */</script>`,
  }
}

const CONFIRM_HTML = [
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>mock 支付宝收银台</title></head>',
  '<body style="font-family:sans-serif;padding:32px">',
  '<h1>mock 收银台</h1>',
  '<p>这是 mock 返回的占位页面，不会真的发起支付。</p>',
  '<p>回到应用点「我已完成支付」即可让 mock 把这一单标记为已支付。</p>',
  '</body></html>',
].join('')

function confirm(requirementId: string): { status: string; requirement_status: string } {
  const kind = inferKind(requirementId)
  const record = paymentOf(requirementId, kind)

  if (!record) {
    return { status: 'paid', requirement_status: findRequirement(requirementId)?.status ?? '' }
  }

  const result = markPaymentPaid(record)

  // 接单保证金：客户付了定金说明需求真的启动，这里同步一下开发者的保证金口径
  if (record.kind === 'deposit') {
    devOrderDeposit.can_bind_requirement = true
  }

  return { status: 'paid', requirement_status: result.requirement_status }
}

const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/payments/orders',
    note: '我的支付单（只给列表用，字段与后端一致）',
    handler: (request) => {
      const visible = payments.filter((item) => {
        const requirement = findRequirement(item.requirement_id)
        if (!requirement) {
          return false
        }
        return request.identity === 'dev'
          ? requirement.developer === DEV_USERNAME
          : true
      })

      return jsonResponse(
        visible.map((item) => ({ payment_id: item.payment_id, status: item.status })),
      )
    },
  },
  {
    method: 'POST',
    path: '/payments/alipay/create',
    note: '支付宝下单',
    handler: (request) => {
      const body = (request.body ?? {}) as { requirement_id?: string; amount_cny?: number }
      const record = ensurePayment(
        body.requirement_id ?? '',
        Number(body.amount_cny) || 0,
        'alipay',
      )

      return jsonResponse(createPayload(record, 'alipay'))
    },
  },
  {
    method: 'POST',
    path: '/payments/wechat/create',
    note: '微信下单',
    handler: (request) => {
      const body = (request.body ?? {}) as { requirement_id?: string; amount_cny?: number }
      const record = ensurePayment(
        body.requirement_id ?? '',
        Number(body.amount_cny) || 0,
        'wechat',
      )

      return jsonResponse(createPayload(record, 'wechat'))
    },
  },
  {
    method: 'POST',
    path: '/payments/alipay/page',
    note: '支付宝页面支付单（带 page_html）',
    handler: (request) => {
      const body = (request.body ?? {}) as { requirement_id?: string; amount_cny?: number }
      const record = ensurePayment(
        body.requirement_id ?? '',
        Number(body.amount_cny) || 0,
        'alipay',
      )

      return jsonResponse({ ...createPayload(record, 'alipay'), page_html: CONFIRM_HTML })
    },
  },
  {
    method: 'GET',
    path: '/payments/alipay/page',
    note: '支付宝页面支付单的 HTML（前端直读文本）',
    handler: () => textResponse(CONFIRM_HTML),
  },
  {
    method: 'POST',
    path: '/payments/alipay/confirm',
    note: '确认支付宝支付：直接置为已支付并推进需求状态',
    handler: (request) => {
      const body = (request.body ?? {}) as { payment_id?: string }
      const record = payments.find((item) => item.payment_id === body.payment_id)
      const requirementId = record?.requirement_id ?? readString(request.query, 'requirement_id')

      return jsonResponse(confirm(requirementId))
    },
  },
  {
    method: 'POST',
    path: '/payments/wechat/confirm',
    note: '确认微信支付',
    handler: (request) => {
      const body = (request.body ?? {}) as { payment_id?: string }
      const record = payments.find((item) => item.payment_id === body.payment_id)
      const requirementId = record?.requirement_id ?? readString(request.query, 'requirement_id')

      return jsonResponse(confirm(requirementId))
    },
  },

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
    handler: () =>
      jsonResponse(
        devOrderDeposit.latest_order ? [devOrderDeposit.latest_order] : [],
      ),
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
      devWallet.withdrawable_balance_cny = Math.max(
        devWallet.withdrawable_balance_cny - amount,
        0,
      )
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

export const paymentRoutes = defineRouteTable('payments', routes)
