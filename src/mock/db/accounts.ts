import { CLIENT_NICKNAME, DEV_NICKNAME, datetime } from './shared'

/* ------------------------------------------------------------------ 通用账户数据 */

export const coupons = [
  {
    code: 'MOCK-COUPON-10',
    name: '新需求立减 10 元',
    discount_type: 'amount' as const,
    discount_value: 10,
    min_amount_cny: 100,
    max_discount_cny: null as number | null,
    total_quota: 1000,
    used_count: 12,
    starts_at: datetime(-10, 0, 0),
    ends_at: datetime(20, 23, 59),
    active: true,
    status: 'pending_use' as const,
  },
  {
    code: 'MOCK-COUPON-5P',
    name: '定金支付 95 折',
    discount_type: 'percent' as const,
    discount_value: 5,
    min_amount_cny: 500,
    max_discount_cny: 200,
    total_quota: 500,
    used_count: 40,
    starts_at: datetime(-5, 0, 0),
    ends_at: datetime(25, 23, 59),
    active: true,
    status: 'pending_use' as const,
  },
]
