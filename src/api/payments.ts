import { apiUrl, authHeader, readErrorMessage, requestJson } from '@/api/http'

export type CouponItem = {
  code: string
  name: string
  discount_type: 'amount' | 'percent'
  discount_value: number
  min_amount_cny: number
  max_discount_cny?: number | null
  total_quota?: number | null
  used_count?: number
  starts_at?: string | null
  ends_at?: string | null
  active: boolean
  status?: 'pending_use' | 'used'
}

export type AlipayCreatePaymentResp = {
  payment_id: string
  requirement_id: string
  channel: string
  amount_cny: number
  status: string
  alipay_order_string: string
  expires_at: string
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

export async function listAvailableCoupons(token: string): Promise<CouponItem[]> {
  return requestJson<CouponItem[]>(
    '/payments/coupons/available',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载优惠券失败',
  )
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
