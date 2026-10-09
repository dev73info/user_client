/** 资源付费售卖：价格展示、下载闸与退款分支的纯函数。 */

export type ResourceSaleLike = {
  price_fen?: number | null
  price_points?: number | null
  purchased_by_me?: boolean | null
  creator?: string | null
}

export type ResourcePurchaseOrderLike = {
  status: string
  first_downloaded_at?: string | null
  amount_fen?: number | null
  amount_points?: number | null
}

/** 元 → 分；非法或负数按 0。保留两位小数后四舍五入。 */
export function yuanToFen(yuan: number | string): number {
  const n = typeof yuan === 'string' ? Number(yuan.trim()) : yuan
  if (!Number.isFinite(n) || n <= 0) {
    return 0
  }
  return Math.round(n * 100)
}

export type ParseYuanPriceOk = { ok: true; fen: number }
export type ParseYuanPriceErr = { ok: false; message: string }
export type ParseYuanPriceResult = ParseYuanPriceOk | ParseYuanPriceErr

/**
 * 表单「售价（元）」解析：空/空白 = 免费 0 分；须为非负、最多两位小数。
 */
export function parseYuanPriceInput(raw: string | number | null | undefined): ParseYuanPriceResult {
  if (raw === null || raw === undefined) {
    return { ok: true, fen: 0 }
  }
  const text = String(raw).trim()
  if (!text) {
    return { ok: true, fen: 0 }
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { ok: false, message: '售价须为非负数字，最多两位小数' }
  }
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, message: '售价须为非负数字，最多两位小数' }
  }
  return { ok: true, fen: Math.round(n * 100) }
}

export type ParsePointsPriceOk = { ok: true; points: number }
export type ParsePointsPriceErr = { ok: false; message: string }
export type ParsePointsPriceResult = ParsePointsPriceOk | ParsePointsPriceErr

/**
 * 表单「积分售价」解析：空/空白 = 0；须为非负整数。
 */
export function parsePointsPriceInput(
  raw: string | number | null | undefined,
): ParsePointsPriceResult {
  if (raw === null || raw === undefined) {
    return { ok: true, points: 0 }
  }
  const text = String(raw).trim()
  if (!text) {
    return { ok: true, points: 0 }
  }
  if (!/^\d+$/.test(text)) {
    return { ok: false, message: '积分售价须为非负整数' }
  }
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    return { ok: false, message: '积分售价须为非负整数' }
  }
  return { ok: true, points: n }
}

/** 分 → 元字符串（两位小数）。 */
export function fenToYuanText(fen: number | null | undefined): string {
  const n = Number(fen ?? 0)
  if (!Number.isFinite(n)) {
    return '0.00'
  }
  return (n / 100).toFixed(2)
}

/** 现金一口价（分 > 0）。 */
export function isPaidResource(priceFen: number | null | undefined): boolean {
  const fen = Number(priceFen ?? 0)
  return Number.isFinite(fen) && fen > 0
}

/** 积分一口价（积分 > 0）。 */
export function isPointsResource(pricePoints: number | null | undefined): boolean {
  const points = Number(pricePoints ?? 0)
  return Number.isFinite(points) && points > 0
}

/**
 * 编辑已有资源时能否设积分售价：积分价可改现金价，现金价不可改积分价。
 * 「设过现金价」看后端的 `cash_price_locked`（改回免费也算设过），旧数据没有该字段时看当前现金价。
 */
export function canSwitchToPointsPrice(
  savedPriceFen: number | null | undefined,
  cashPriceLocked?: boolean | null,
): boolean {
  return !cashPriceLocked && !isPaidResource(savedPriceFen)
}

/** 现金或积分任一标价 > 0，即需购买（或作者豁免）。 */
export function isPricedResource(
  priceFen: number | null | undefined,
  pricePoints?: number | null,
): boolean {
  return isPaidResource(priceFen) || isPointsResource(pricePoints)
}

/**
 * 列表 / 详情用的价格文案：免费 / ¥x.xx / N 积分。
 * 积分价优先于现金价（二者互斥，正常只会有一侧 > 0）。
 */
export function formatResourcePriceLabel(
  priceFen: number | null | undefined,
  pricePoints?: number | null,
): string {
  const points = Number(pricePoints ?? 0)
  if (Number.isFinite(points) && points > 0) {
    return `${Math.trunc(points)} 积分`
  }
  const fen = Number(priceFen ?? 0)
  if (!Number.isFinite(fen) || fen <= 0) {
    return '免费'
  }
  return `¥${fenToYuanText(fen)}`
}

/** 订单金额展示：积分单优先，否则现金。 */
export function formatPurchaseAmountLabel(order: ResourcePurchaseOrderLike): string {
  const points = Number(order.amount_points ?? 0)
  if (Number.isFinite(points) && points > 0) {
    return `${Math.trunc(points)} 积分`
  }
  return `¥${fenToYuanText(order.amount_fen ?? 0)}`
}

/**
 * 当前访客是否可下载（前端展示闸，最终以后端为准）。
 * 免费 / 已购 / 作者本人 → 可下；其余付费未购 → 不可。
 */
export function canDownloadResource(
  resource: ResourceSaleLike,
  viewerUsername?: string | null,
): boolean {
  if (!isPricedResource(resource.price_fen, resource.price_points)) {
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

/** 详情页现金支付渠道 UI 取值。 */
export type ResourcePayChannelUi = 'alipay' | 'wechat' | 'union'

/** 前端支付渠道 → 后端 pay_channel（不含 points）。 */
export function toResourcePayChannel(channel: ResourcePayChannelUi): string {
  if (channel === 'wechat') {
    return 'wx_pub'
  }
  if (channel === 'union') {
    return 'union'
  }
  return 'alipay'
}
