/** 资源付费售卖：价格展示、下载闸与退款分支的纯函数（按职责分在 `resourceSale/` 下，此处汇总再导出）。 */

export {
  yuanToFen,
  parseYuanPriceInput,
  stripLeadingZeros,
  caretAfterStripLeadingZeros,
  normalizeYuanPriceText,
  parsePointsPriceInput,
  fenToYuanText,
} from './resourceSale/price'
export type {
  ResourceSaleLike,
  ResourcePurchaseOrderLike,
  ParseYuanPriceOk,
  ParseYuanPriceErr,
  ParseYuanPriceResult,
  ParsePointsPriceOk,
  ParsePointsPriceErr,
  ParsePointsPriceResult,
} from './resourceSale/price'
export {
  isPaidResource,
  isPointsResource,
  canSwitchToPointsPrice,
  isPricedResource,
  isFreeListingResource,
  isCashPaidListingResource,
  isPointsListingResource,
  DEFAULT_RESOURCE_LISTING_SALE,
  RESOURCE_LISTING_SALE_OPTIONS,
  parseResourceListingSale,
  resolveResourceListingSale,
  formatResourcePriceLabel,
  formatPurchaseAmountLabel,
} from './resourceSale/listing'
export type { ResourceListingSale } from './resourceSale/listing'
export {
  canDownloadResource,
  canBuyerDownload,
  needsPurchase,
  API_RESOURCE_PURCHASE_HINT,
  canPurchaseOnPlatform,
  isPurchaseRequiredError,
  canSelfRefundPurchase,
  canSelfRefund,
  isPointsPurchaseOrder,
  canSellerRefundPurchase,
  refundInitiatorLabel,
  resourcePurchaseStatusLabel,
  isApiResourcePurchaseOrder,
} from './resourceSale/purchase'
export type { SellerRefundOrderLike } from './resourceSale/purchase'
export {
  PROMO_SHARE_MAX_BPS,
  PROMO_SHARE_RANGE_MESSAGE,
  parsePromoSharePercentInput,
  promoShareBpsToPercentText,
  promoShareBpsLabel,
  normalizePromoCode,
  promoRejectReasonLabel,
  promoterSplitStatusLabel,
} from './resourceSale/promo'
export type { ParsePromoShareResult } from './resourceSale/promo'
export { toResourcePayChannel, canReuseCashQrForChannel } from './resourceSale/payChannel'
export type { ResourcePayChannelUi, ReusableCashQrOrderLike } from './resourceSale/payChannel'

export {
  isWechatPayChannel,
  isWechatBrowser,
  wechatMiddleQuery,
} from './resourceSale/wechatPay'
export type { WechatMiddleQuery } from './resourceSale/wechatPay'
