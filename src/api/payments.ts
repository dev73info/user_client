import { apiUrl, authHeader, readErrorMessage, requestJson } from '@/api/http'

export type AlipayCreatePaymentResp = {
  payment_id: string
  requirement_id: string
  channel: string
  amount_cny: number
  status: string
  alipay_order_string: string
  expires_at: string
}

export type AlipayPageCreatePaymentResp = AlipayCreatePaymentResp & {
  page_html: string
}

export type WechatCreatePaymentResp = {
  payment_id: string
  requirement_id: string
  channel: string
  amount_cny: number
  status: string
  wechat_prepay_id?: string | null
  code_url: string
  expires_at: string
}

export type ConfirmPaymentResp = {
  status: string
  requirement_status?: string
}

export type PaymentOrderItem = {
  payment_id: string
  status: string
}

export type ConfirmResult = {
  ok: boolean
  status: number
  data?: ConfirmPaymentResp
  message?: string
}

export async function listPaymentOrders(token: string): Promise<PaymentOrderItem[]> {
  const resp = await fetch(apiUrl('/payments/orders'), {
    headers: {
      ...authHeader(token),
    },
  })

  if (!resp.ok) {
    return []
  }

  return (await resp.json()) as PaymentOrderItem[]
}

export async function createPayment(
  token: string,
  channel: 'alipay' | 'wechat',
  payload: {
    requirement_id: string
    amount_cny: number
    coupon_code?: string
    description: string
  },
): Promise<AlipayCreatePaymentResp | WechatCreatePaymentResp> {
  const path = channel === 'alipay' ? '/payments/alipay/create' : '/payments/wechat/create'
  return requestJson<AlipayCreatePaymentResp | WechatCreatePaymentResp>(
    path,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    `创建${channel === 'alipay' ? '支付宝' : '微信'}支付订单失败`,
  )
}

export async function createAlipayPagePayment(
  token: string,
  payload: {
    requirement_id: string
    amount_cny: number
    coupon_code?: string
    description: string
  },
): Promise<AlipayPageCreatePaymentResp> {
  return requestJson<AlipayPageCreatePaymentResp>(
    '/payments/alipay/page',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '创建支付宝页面支付订单失败',
  )
}

export async function getAlipayPageHtml(token: string, paymentId: string): Promise<string> {
  const resp = await fetch(
    apiUrl(`/payments/alipay/page?payment_id=${encodeURIComponent(paymentId)}`),
    {
      headers: {
        ...authHeader(token),
      },
    },
  )

  if (!resp.ok) {
    throw new Error(await readErrorMessage(resp, '获取支付宝页面支付数据失败'))
  }

  return resp.text()
}

export async function confirmPayment(
  token: string,
  channel: 'alipay' | 'wechat',
  paymentId: string,
): Promise<ConfirmResult> {
  const path = channel === 'alipay' ? '/payments/alipay/confirm' : '/payments/wechat/confirm'
  const resp = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
    },
    body: JSON.stringify({ payment_id: paymentId }),
  })

  if (!resp.ok) {
    return {
      ok: false,
      status: resp.status,
      message: await readErrorMessage(resp, '确认支付失败'),
    }
  }

  let data: ConfirmPaymentResp | undefined
  try {
    data = (await resp.json()) as ConfirmPaymentResp
  } catch {
    data = undefined
  }

  return {
    ok: true,
    status: resp.status,
    data,
  }
}
