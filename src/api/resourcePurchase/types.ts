import type { components } from '@/api/generated/schema'
import type { ResourcePayChannelUi } from '@/shared/resourceSale'

type Schemas = components['schemas']

export type ResourcePurchaseOrder = Schemas['ResourcePurchaseOrderResponse']

export type CreateResourcePurchasePayload = Omit<
  Schemas['CreatePurchaseRequest'],
  'pay_channel'
> & {
  pay_channel: ResourcePayChannelUi
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

/** 一次性收银台票据换来的平台会话；订单号只从结账页 query 读取。 */
export type CheckoutTicketExchangeResult = {
  token: string
  username: string
  role: string
  roles: string[]
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
