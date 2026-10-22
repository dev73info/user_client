import {
  devOrderDeposit,
  findRequirement,
  markPaymentPaid,
  paymentOf,
  payments,
  type MockPayment,
} from '../../db'

export function nowText(): string {
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

export function ensurePayment(
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

export function createPayload(record: MockPayment, channel: 'alipay' | 'wechat') {
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

export const CONFIRM_HTML = [
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>mock 支付宝收银台</title></head>',
  '<body style="font-family:sans-serif;padding:32px">',
  '<h1>mock 收银台</h1>',
  '<p>这是 mock 返回的占位页面，不会真的发起支付。</p>',
  '<p>回到应用点「我已完成支付」即可让 mock 把这一单标记为已支付。</p>',
  '</body></html>',
].join('')

export function confirm(requirementId: string): { status: string; requirement_status: string } {
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
