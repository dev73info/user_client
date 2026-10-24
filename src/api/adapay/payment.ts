import { authHeader, requestJson } from '@/api/http'

import type {
  AdapayBusinessPayChannel,
  AdapayClientPlatform,
  AdapayDeveloperDepositPaymentResponse,
  AdapayMilestone,
  AdapayPaymentResponse,
} from './types'

export function getAdapayClientPlatform(): AdapayClientPlatform {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    ? 'mobile'
    : 'pc'
}

export async function createAdapayPayment(
  token: string,
  requirementId: string,
  milestone: AdapayMilestone,
  payChannel: AdapayBusinessPayChannel,
  clientPlatform: AdapayClientPlatform = getAdapayClientPlatform(),
  /**
   * 优惠券码（P6 / BUG-025）：只有定金接券——折扣由**平台服务费**承担，开发者净额按合同快照不变，
   * 折扣上限 = 该笔定金的平台服务费（超出会被后端拒）。尾款传了也会被后端忽略。
   */
  couponCode?: string | null,
): Promise<AdapayPaymentResponse> {
  const path =
    milestone === 'deposit'
      ? `/adapay/requirements/${encodeURIComponent(requirementId)}/deposit`
      : `/adapay/requirements/${encodeURIComponent(requirementId)}/final`
  const normalizedCoupon = couponCode?.trim()

  return requestJson<AdapayPaymentResponse>(
    path,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({
        pay_channel:
          payChannel === 'wechat' ? 'wx_pub' : payChannel === 'union' ? 'union' : 'alipay',
        client_platform: clientPlatform,
        ...(normalizedCoupon && milestone === 'deposit' ? { coupon_code: normalizedCoupon } : {}),
      }),
    },
    `创建 Adapay${milestone === 'deposit' ? '定金' : '尾款'}订单失败`,
  )
}

export async function getAdapayPayment(
  token: string,
  paymentId: string,
): Promise<AdapayPaymentResponse> {
  return requestJson<AdapayPaymentResponse>(
    `/adapay/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: {
        ...authHeader(token),
      },
    },
    '查询 Adapay 支付状态失败',
  )
}

export async function createAdapayDeveloperDepositPayment(
  token: string,
  amountCny: number,
  payChannel: 'alipay' | 'wechat',
  clientPlatform: AdapayClientPlatform = getAdapayClientPlatform(),
): Promise<AdapayDeveloperDepositPaymentResponse> {
  return requestJson<AdapayDeveloperDepositPaymentResponse>(
    '/adapay/developer-deposits',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({
        amount_cny: amountCny,
        pay_channel: payChannel,
        client_platform: clientPlatform,
      }),
    },
    '创建 Adapay 保证金充值订单失败',
  )
}

export async function getAdapayDeveloperDepositPayment(
  token: string,
  paymentId: string,
): Promise<AdapayDeveloperDepositPaymentResponse> {
  return requestJson<AdapayDeveloperDepositPaymentResponse>(
    `/adapay/developer-deposits/${encodeURIComponent(paymentId)}`,
    {
      headers: {
        ...authHeader(token),
      },
    },
    '查询 Adapay 保证金充值状态失败',
  )
}
