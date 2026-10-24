import { authHeaders, requestJson } from '@/api/http'
import { getPaymentOrder } from '@/api/payments'

import type {
  AdapayBusinessPayChannel,
  AdapayClientPlatform,
  AdapayMilestone,
  AdapayPaymentResponse,
  PaymentOrderResponse,
} from './types'

/** 按浏览器 UA 判断客户端形态：契约 `CreateDepositPaymentRequest.client_platform` 只认 `mobile` / `desktop`。 */
export function getAdapayClientPlatform(): AdapayClientPlatform {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    ? 'mobile'
    : 'desktop'
}

/**
 * 发起定金 / 尾款支付单。
 *
 * 契约：`POST /api/adapay/requirements/{requirement_id}/deposit`（定金）与
 * `.../final-payment`（尾款），请求体是 `CreateDepositPaymentRequest`——
 * **只有 `pay_channel`（`alipay` / `wechat`）与 `client_platform`（`mobile` / `desktop`）两个字段**，
 * 金额由服务端按合同快照算，前端不传、也不该自己算。
 */
export async function createAdapayPayment(
  token: string,
  requirementId: string,
  milestone: AdapayMilestone,
  payChannel: AdapayBusinessPayChannel,
  clientPlatform: AdapayClientPlatform = getAdapayClientPlatform(),
): Promise<AdapayPaymentResponse> {
  const path =
    milestone === 'deposit'
      ? `/adapay/requirements/${encodeURIComponent(requirementId)}/deposit`
      : `/adapay/requirements/${encodeURIComponent(requirementId)}/final-payment`

  return requestJson<AdapayPaymentResponse>(
    path,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        pay_channel: payChannel,
        client_platform: clientPlatform,
      }),
    },
    `创建 Adapay${milestone === 'deposit' ? '定金' : '尾款'}订单失败`,
  )
}

/**
 * 查单：支付结果只有这一个来源（没有「确认支付」接口）。
 *
 * `order_no` 就是下单回执里的 `payment_id`，支付页 query 上的 `payment_id` 原样传进来。
 * 实现只有 `api/payments` 那一份（`GET /api/payment/orders/{order_no}`），这里只是沿用
 * 「Adapay 域」的旧名字，免得支付页的调用点集体改名。
 */
export function getAdapayPayment(token: string, orderNo: string): Promise<PaymentOrderResponse> {
  return getPaymentOrder(token, orderNo)
}
