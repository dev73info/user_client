import { apiUrl, authHeaders, requestJson } from '@/api/http'

/**
 * 开发者自己的信用与额度（契约 `CreditSelfResponse`，后端 `crates/business/credit/src/api/mod.rs`）。
 *
 * 路径是 `/api/credit/credit/me`（**不是** `/api/dev/credit/me`——那是 1.x 的写法）。
 * 权限 `credit.self.get` 已授给 `user` 角色，开发者自己就能读。
 *
 * 这张卡片只关心两件事：给不给封顶、还剩多少能充。其余字段留着备用，不要凭印象加字段。
 * 金额一律整数分（`*_fen`）；`credit_score` 是浮点分（不是金额），照原样展示。
 */
export type DevCreditSelf = {
  username: string
  /** 信用分：浮点，不是金额，别拿 toYuan 去转 */
  credit_score: number
  /** 每 1 信用分折算多少分钱 */
  fen_per_credit: number
  /** 保证金封顶（分） */
  max_deposit_fen: number
  /** 单笔订单金额封顶（分） */
  max_order_amount_fen: number
  /** 剩余可充（分） */
  remaining_deposit_cap_fen: number
  /** 是否启用保证金封顶：false 时不展示额度那一枚标签 */
  enforce_deposit_limit: boolean
  /** 是否启用订单金额封顶 */
  enforce_order_limit: boolean
}

/**
 * 读自己的信用与额度（`GET /api/credit/credit/me`）。
 *
 * 读不到不是致命错误：额度只影响卡上多一枚提示标签，取数失败时页面照常展示
 * 余额与提现入口（调用方按 `null` 处理）。
 */
export async function getDevCreditSelf(token: string): Promise<DevCreditSelf> {
  return requestJson<DevCreditSelf>(
    apiUrl('/credit/credit/me'),
    { headers: authHeaders(token) },
    '加载开发者信用失败',
  )
}
