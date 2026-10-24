import type { Ref } from 'vue'

/**
 * 资源购买 / 打赏中间页共用的类型（纯类型，无运行时依赖）。
 *
 * 两条中间页的流程同构，只在订单域与接口上分叉：引擎按 `MiddlePageApi` 注入接口，
 * 回填状态按 `MiddlePageBackfill` 由页面装配层创建，供展示与流程共用。
 */

/** 中间页展示与判付只认这几个字段 */
export type MiddleOrder = {
  order_no: string
  amount_fen: number
  status: string
}

export type MiddlePageApi<T extends MiddleOrder> = {
  /** 本流程是否适用（`resource_wechat` / `tip_wechat`） */
  active: () => boolean
  orderNo: () => string
  token: () => string
  getStatus: (orderNo: string, token: string) => Promise<{ order: T; authorized: boolean }>
  getAuthUrl: (
    orderNo: string,
    token: string,
    redirectTo: string,
  ) => Promise<{
    url: string
    authorized: boolean
  }>
  completeJsapi: (orderNo: string, token: string) => Promise<{ order: T; pay_info: string }>
}

export type MiddlePageBackfill<T extends MiddleOrder> = {
  /** `complete` / `status` 回填的支付参数（wx_pub 原始串） */
  payInfoRaw: Ref<string>
  /** `wechat-status` 回填的订单详情（中间页 query 本身不含金额） */
  detail: Ref<T | null>
  /** 正在创建支付订单 */
  creating: Ref<boolean>
}
