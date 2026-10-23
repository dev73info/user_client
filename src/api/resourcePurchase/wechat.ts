import { requestJson } from '@/api/http'

import type {
  ResourceWechatAuthUrlResp,
  ResourceWechatJsapiResp,
  ResourceWechatStatusResp,
} from './types'

/** GET /api/resource/purchases/{order_no}/wechat-auth-url（公开，靠短时 token） */
export async function getResourceWechatAuthUrl(
  orderNo: string,
  token: string,
  redirectTo?: string,
): Promise<ResourceWechatAuthUrlResp> {
  const query = new URLSearchParams({ token })
  if (redirectTo?.trim()) {
    query.set('redirect_to', redirectTo.trim())
  }
  return requestJson<ResourceWechatAuthUrlResp>(
    `/resource/purchases/${encodeURIComponent(orderNo)}/wechat-auth-url?${query.toString()}`,
    { method: 'GET' },
    '获取微信授权地址失败',
  )
}

/** POST /api/resource/purchases/{order_no}/wechat-jsapi（公开，靠短时 token） */
export async function completeResourceWechatJsapi(
  orderNo: string,
  token: string,
): Promise<ResourceWechatJsapiResp> {
  return requestJson<ResourceWechatJsapiResp>(
    `/resource/purchases/${encodeURIComponent(orderNo)}/wechat-jsapi`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    },
    '创建微信支付失败',
  )
}

/** GET /api/resource/purchases/{order_no}/wechat-status（公开，靠短时 token） */
export async function getResourceWechatStatus(
  orderNo: string,
  token: string,
): Promise<ResourceWechatStatusResp> {
  const query = new URLSearchParams({ token })
  return requestJson<ResourceWechatStatusResp>(
    `/resource/purchases/${encodeURIComponent(orderNo)}/wechat-status?${query.toString()}`,
    { method: 'GET' },
    '查询资源购买订单失败',
  )
}
