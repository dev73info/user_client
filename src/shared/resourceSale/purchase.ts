import { isApiResourceKind } from '@/shared/resourceApi'

import { isPricedResource } from './listing'
import { type ResourcePurchaseOrderLike, type ResourceSaleLike } from './price'

export function canDownloadResource(
  resource: ResourceSaleLike,
  viewerUsername?: string | null,
): boolean {
  if (!isPricedResource(resource.buyout_price_fen, resource.price_points)) {
    return true
  }
  if (resource.purchased_by_me) {
    return true
  }
  const creator = resource.creator?.trim() ?? ''
  const viewer = viewerUsername?.trim() ?? ''
  return Boolean(creator && viewer && creator === viewer)
}

/** 详情页购买闸：与 `canDownloadResource` 同语义，入参已展平。 */

export function canBuyerDownload(input: {
  priceFen?: number | null
  pricePoints?: number | null
  purchasedByMe?: boolean | null
  isOwner?: boolean | null
}): boolean {
  if (!isPricedResource(input.priceFen, input.pricePoints)) {
    return true
  }
  if (input.purchasedByMe) {
    return true
  }
  return Boolean(input.isOwner)
}

/**
 * 详情页是否需要购买：已标价（现金或积分）且当前访客不可下载。
 */

export function needsPurchase(input: {
  priceFen?: number | null
  pricePoints?: number | null
  purchasedByMe?: boolean | null
  isOwner?: boolean | null
}): boolean {
  if (!isPricedResource(input.priceFen, input.pricePoints)) {
    return false
  }
  return !canBuyerDownload(input)
}

/**
 * 接口资源在平台内没有购买入口时的统一引导文案（BUG-020）。
 *
 * 与后端 409 的口径一致：接口资源只能由开发者站点的服务端通过开放接口下单。
 */

export const API_RESOURCE_PURCHASE_HINT = '接口资源不在平台内售卖，请到开发者站点下单'

/**
 * 平台内购买入口（现金购 / 积分购）是否对这个资源开放。
 *
 * BUG-020：接口资源只由开发者自有站点的服务端通过开放接口下单，平台内的两条入口对它一律无效——
 * 后端会以 409 拒掉。详情页因此不给接口资源开平台内购买入口，只给「到开发者站点下单」的引导，
 * 免得用户点进去只拿到一句后端报错。
 */

export function canPurchaseOnPlatform(input: {
  priceFen?: number | null
  pricePoints?: number | null
  purchasedByMe?: boolean | null
  isOwner?: boolean | null
  resourceKind?: string | null
}): boolean {
  if (isApiResourceKind(input.resourceKind)) {
    return false
  }
  return needsPurchase({
    priceFen: input.priceFen,
    pricePoints: input.pricePoints,
    purchasedByMe: input.purchasedByMe,
    isOwner: input.isOwner,
  })
}

/** 下载 403 是否应引导购买。 */

export function isPurchaseRequiredError(message: string | null | undefined): boolean {
  const text = (message ?? '').trim()
  return text.includes('请先购买') || text.includes('PurchaseRequired')
}

/** 已付费且尚未产生成功下载 → 可自助退。 */

export function canSelfRefundPurchase(order: ResourcePurchaseOrderLike): boolean {
  return order.status === 'paid' && !order.first_downloaded_at
}

/** 与 `canSelfRefundPurchase` 同义（页面侧命名）。 */

export const canSelfRefund = canSelfRefundPurchase

/** 主动退款（卖家 / 平台通道）判定需要的字段。 */

export type SellerRefundOrderLike = ResourcePurchaseOrderLike & {
  within_refund_window?: boolean | null
  refundable_amount_fen?: number | null
}

/** 积分支付订单：本轮不纳入主动退款（需求 Q7），列表里不给退款按钮。 */

export function isPointsPurchaseOrder(order: { amount_points?: number | null }): boolean {
  return Number(order.amount_points ?? 0) > 0
}

/**
 * 卖家 / 平台能否对该订单发起主动退款。
 *
 * 条件：现金单、`paid`、仍在「支付后 365 天」窗口内、且还有可退余额。
 * 与买家自助退的关键差异是**已下载也能退**——这里刻意不看 `first_downloaded_at`。
 * 前端只用来决定按钮是否展示，最终以后端为准。
 */

export function canSellerRefundPurchase(order: SellerRefundOrderLike): boolean {
  if (order.status !== 'paid') {
    return false
  }
  if (isPointsPurchaseOrder(order)) {
    return false
  }
  if (order.within_refund_window === false) {
    return false
  }
  return Number(order.refundable_amount_fen ?? 0) > 0
}

/** 退款发起方文案（订单留痕 `refund_initiator`）。 */

export function refundInitiatorLabel(initiator: string | null | undefined): string {
  switch ((initiator ?? '').trim()) {
    case 'seller':
      return '卖家'
    case 'admin':
      return '平台'
    case 'buyer':
      return '买家'
    default:
      return '未知'
  }
}

export function resourcePurchaseStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return '待支付'
    case 'paid':
      return '已购买'
    case 'refunding':
      return '退款中'
    case 'refunded':
      return '已退款'
    case 'failed':
      return '失败'
    case 'closed':
      return '已关闭'
    default:
      return status || '未知'
  }
}

/** 开放接口订单：来源为 `oauth`，并可能带客户端与外部用户标识。 */

export function isApiResourcePurchaseOrder(order: {
  source_kind?: string | null
  client_id?: string | null
  buyer_external_id?: string | null
}): boolean {
  return (
    (order.source_kind ?? '').trim().toLowerCase() === 'oauth' ||
    Boolean(order.client_id?.trim()) ||
    Boolean(order.buyer_external_id?.trim())
  )
}

/* ---------------------------------------------------------------------------
 * R029 售卖推广分成：比例解析 / 回显、推广码归一化、未归因原因与分账状态文案。
 * 与后端契约同口径（万分比，0 = 关闭，上限 5000 = 50%），见任务-01 §3。
 * ------------------------------------------------------------------------- */

/** 推广分成比例上限（万分比）：50% */
