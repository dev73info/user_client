import { authHeaders, requestJson } from '@/api/http'

import type { PointsProduct, PointsRedeemOrder, PromoCard, ResourcePromoMeta } from './types'

export async function listMallProducts(token: string): Promise<PointsProduct[]> {
  return requestJson<PointsProduct[]>(
    '/points/mall/products',
    { headers: authHeaders(token) },
    '加载积分商城失败',
  )
}

export async function redeemMallProduct(
  token: string,
  productId: number,
): Promise<PointsRedeemOrder> {
  return requestJson<PointsRedeemOrder>(
    '/points/mall/redeem',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ product_id: productId }),
    },
    '兑换失败',
  )
}

export async function listMyRedeemOrders(token: string): Promise<PointsRedeemOrder[]> {
  return requestJson<PointsRedeemOrder[]>(
    '/points/mall/orders',
    { headers: authHeaders(token) },
    '加载兑换记录失败',
  )
}

export async function listMyPromoCards(
  token: string,
  status: 'unused' | 'used' = 'unused',
): Promise<PromoCard[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  return requestJson<PromoCard[]>(
    `/points/promo-cards${qs}`,
    { headers: authHeaders(token) },
    '加载道具卡失败',
  )
}

export async function getResourcePromoMeta(token?: string): Promise<ResourcePromoMeta> {
  return requestJson<ResourcePromoMeta>(
    '/points/resource-promo-meta',
    token ? { headers: authHeaders(token) } : {},
    '加载资源推广配置失败',
  )
}

export function promoCardLabel(cardCode: string): string {
  if (cardCode === 'resource_featured_card') return '资源精选卡'
  if (cardCode === 'resource_pin_card') return '资源置顶卡'
  return cardCode
}
