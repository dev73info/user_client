/**
 * 积分域接口。
 *
 * 按子域拆成 self（我的积分 / 权益）、mall（积分商城与道具卡）、checkin（签到）、
 * transfer（打赏）与共用的 types；本文件只做汇总导出，调用方仍然 `import ... from '@/api/points'`。
 * 行为与拆分前一致：路径、报文形状、错误文案一条都没改。
 */
export type {
  CheckinResponse,
  CheckinStatus,
  PointsProduct,
  PointsRedeemOrder,
  PointsTransfer,
  PointsTransferMeta,
  PromoCard,
  ResourcePromoMeta,
  TransferPointsPayload,
  TransferPointsResponse,
  UserPerk,
  UserPointsLog,
  UserPointsQuery,
  UserPointsSelf,
  UsernameGradientStatus,
} from './types'

export { getMyPoints, setPerkEquipped, setUsernameAppearance, setUsernameGradient } from './self'
export {
  getResourcePromoMeta,
  listMallProducts,
  listMyPromoCards,
  listMyRedeemOrders,
  promoCardLabel,
  redeemMallProduct,
} from './mall'
export { doCheckin, getCheckinStatus } from './checkin'
export { getTransferMeta, listMyTransfers, transferPoints } from './transfer'
