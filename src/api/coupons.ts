import { authHeader, requestJson } from '@/api/http'

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

export async function listAvailableCoupons(token: string): Promise<CouponItem[]> {
  return requestJson<CouponItem[]>(
    '/coupons/available',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载优惠券失败',
  )
}
