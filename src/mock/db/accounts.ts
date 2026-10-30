import { CLIENT_NICKNAME, DEV_NICKNAME, datetime } from './shared'

/* ------------------------------------------------------------------ 通用账户数据 */

/**
 * 我的可用券（契约 `CouponResponse`）。
 *
 * 金额一律**整数分**、折扣一律**整数基点**：早先这里写的是 `discount_value` / `min_amount_cny` /
 * `max_discount_cny`，与契约一个字段都对不上，券中心于是把面额和门槛都读成 `undefined`，
 * 渲染成「减免 ¥0.00 · 门槛 ¥0.00」——看起来像券的面额是零。
 */
export const coupons = [
  {
    code: 'MOCK-COUPON-10',
    name: '新需求立减 10 元',
    discount_type: 'amount',
    amount_off_fen: 1000,
    // 满 100 元可用
    min_amount_fen: 10000,
    max_discount_fen: null as number | null,
    discount_bps: null as number | null,
    starts_at: datetime(-10, 0, 0),
    ends_at: datetime(20, 23, 59),
    active: true,
    status: 'pending_use',
  },
  {
    code: 'MOCK-COUPON-5P',
    name: '定金支付 95 折',
    discount_type: 'percent',
    amount_off_fen: null as number | null,
    // 满 500 元可用
    min_amount_fen: 50000,
    // 折扣上限 200 元
    max_discount_fen: 20000,
    // 500 基点 = 优惠 5%，对上券名「95 折」（按原价 95% 收款）
    discount_bps: 500,
    starts_at: datetime(-5, 0, 0),
    ends_at: datetime(25, 23, 59),
    active: true,
    status: 'pending_use',
  },
]
