/**
 * 优惠券（用户端）。
 *
 * 契约：`GET /api/coupon/available` → `CouponResponse[]`，取**登录人自己**名下的可用券
 * （后端权限码 `coupon.available.get`，只按 `auth.username` 圈定范围）。
 *
 * 金额一律**整数分**：`amount_off_fen` / `min_amount_fen` / `max_discount_fen`；
 * 优惠百分比是**整数基点** `discount_bps`（2000 = 优惠 20%），没有 `*_cny`、没有浮点
 * `discount_value`。
 *
 * 契约里另外几条读接口（`/api/coupon/coupons`、`/api/coupon/discount-coupons`、
 * `/api/coupon/coupons/assignable`、`/api/coupon/users/{username}/coupons`）都是**管理端**
 * 端点（权限码 `coupon.admin_list.get` / `coupon.admin_discount_list.get` 等，见后端
 * `crates/business/coupon/src/api/coupon.rs`）：用户令牌调过去只会 403，用户端也没有页面
 * 用它们，所以不在这里封装。用户端的「折扣券」是同一份可用券里 `discount_type=percent`
 * 的那一档（见 `CouponCenterView`）。
 */
import type { components } from '@/api/generated/schema'
import { authHeaders, requestJson } from '@/api/http'

type Schemas = components['schemas']

/** 优惠券（契约 `CouponResponse`）；`CouponItem` 是既有调用方沿用的别名。 */
export type CouponResponse = Schemas['CouponResponse']
export type CouponItem = CouponResponse

/** 我的可用券（`GET /api/coupon/available`）。 */
export async function listAvailableCoupons(token: string): Promise<CouponResponse[]> {
  return requestJson<CouponResponse[]>(
    '/coupon/available',
    { headers: authHeaders(token) },
    '加载优惠券失败',
  )
}
