import type { ResourcePayChannelUi } from '@/shared/resourceSale'

export type ResourcePurchaseOrder = {
  order_no: string
  buyer: string
  /** 真实买家的平台用户名（R034 接口资源订单才有；普通单为 null） */
  buyer_account?: string | null
  /** 开发者侧外部用户 ID（R034 接口资源订单才有；普通单为 null） */
  buyer_external_id?: string | null
  /** 订单来源：platform / api（R034 之前的历史单可能没有该字段） */
  source_kind?: string | null
  resource_id: number
  resource_title: string | null
  seller: string
  amount_fen: number
  platform_fee_fen: number
  seller_net_fen: number
  platform_fee_bps: number
  amount_points: number
  platform_fee_points: number
  seller_net_points: number
  status: string
  pay_channel: string | null
  provider_payment_id: string | null
  provider_confirm_id: string | null
  pay_url: string | null
  split_status: string
  first_downloaded_at: string | null
  paid_at: string | null
  refunded_at: string | null
  created_at: string
  updated_at: string
  /** 累计已退现金（分）；支持部分退后可能小于 `amount_fen` */
  refunded_amount_fen: number
  /** 剩余可退现金（分）= `amount_fen - refunded_amount_fen` */
  refundable_amount_fen: number
  /** 是否仍在「支付后 365 天」可退窗口内 */
  within_refund_window: boolean
  /** 下载权是否已被退款收回 */
  entitlement_revoked: boolean
  /** 最近一次退款的留痕（原因 / 发起方 / 操作人） */
  refund_reason: string | null
  /** `seller` | `admin` | `buyer` */
  refund_initiator: string | null
  refund_operator: string | null
  last_refund_at: string | null
  /** 推广者用户名（未归因 = null） */
  promoter: string | null
  /** 下单时带来的推广码（原样留痕） */
  promo_code: string | null
  /** 下单时资源的推广分成比例快照（万分比） */
  promo_share_bps: number
  /** 本单实际切给推广者的金额（分） */
  promoter_fee_fen: number
  /** 推广者那份的分账状态：none / pending / succeeded / failed */
  promoter_split_status: string
  /** 未归因 / 不合格的原因；未开启推广或正常归因为 null */
  promo_reject_reason: string | null
}

export type CreateResourcePurchasePayload =
  | {
      pay_channel: ResourcePayChannelUi
      client_platform?: 'pc' | 'mobile'
      /** 推广码（可选）：带则后端按邀请码归因；不合格不阻断下单 */
      promo_code?: string | null
    }
  | {
      pay_channel: 'points'
    }

export type ListMyResourcePurchasesQuery = {
  resource_id?: number
  status?: string
  /** 关键词：后端按订单号 / 资源标题模糊匹配 */
  keyword?: string
  limit?: number
  offset?: number
}

/** 「我的已购资源」服务端分页结果：`total` 取自响应头 `X-Total-Count`。 */
export type MyResourcePurchasesPage = {
  items: ResourcePurchaseOrder[]
  total: number
}

/** R034 一次性收银台票据换来的登录会话（POST /api/resource/open/checkout/exchange）。 */
export type CheckoutTicketExchangeResult = {
  token: string
  username: string
  order_no: string
}

export type ListSellerResourcePurchasesQuery = {
  status?: string
  limit?: number
  offset?: number
}

/**
 * 卖家主动退款请求体。
 *
 * `reason` 必填（≤200 字）；`amount_fen` 省略即退「剩余可退全额」，
 * 显式指定时须 > 0 且不超过 `refundable_amount_fen`。
 */
export type SellerRefundPayload = {
  reason: string
  amount_fen?: number
}

export type ResourceWechatAuthUrlResp = {
  url: string
  authorized: boolean
}

export type ResourceWechatJsapiResp = {
  order: ResourcePurchaseOrder
  pay_info: string
}

export type ResourceWechatStatusResp = {
  order: ResourcePurchaseOrder
  authorized: boolean
}
