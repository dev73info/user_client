/**
 * 资源购买订单接口。
 *
 * 拆成 buyer（下单 / 我的已购 / 收银台票据）、seller（售出订单与卖家退款）、
 * wechat（微信支付三步，公开接口靠短时 token）与共用的 types；
 * 本文件只做汇总导出，调用方仍然 `import ... from '@/api/resourcePurchase'`。
 */
export type {
  CheckoutTicketExchangeResult,
  CreateResourcePurchasePayload,
  ListMyResourcePurchasesQuery,
  ListSellerResourcePurchasesQuery,
  MyResourcePurchasesPage,
  ResourcePurchaseOrder,
  ResourceWechatAuthUrlResp,
  ResourceWechatJsapiResp,
  ResourceWechatStatusResp,
  SellerRefundPayload,
} from './types'

export {
  buildMyResourcePurchasesQuery,
  countMyResourcePurchases,
  createResourcePurchase,
  exchangeCheckoutTicket,
  getMyResourcePurchase,
  listMyResourcePurchases,
  listMyResourcePurchasesPage,
} from './buyer'

export {
  getSellerResourcePurchase,
  listSellerResourcePurchases,
  sellerRefundResourcePurchase,
} from './seller'

export {
  completeResourceWechatJsapi,
  getResourceWechatAuthUrl,
  getResourceWechatStatus,
} from './wechat'
