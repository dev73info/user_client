/**
 * Adapay（电签担保）域接口。
 *
 * 拆成 payment（定金 / 尾款下单与查单）、acceptance（验收）、
 * member（会员状态与结算账户）、availability（可用性）与共用的 types；
 * 本文件只做汇总导出，调用方仍然 `import ... from '@/api/adapay'`。
 *
 * 契约里没有的「开发者保证金充值（预付钱包）」整条链路已删除：当前后端只有
 * `/api/adapay/requirements/{id}/deposit|final-payment`，没有 `developer-deposits`。
 *
 * 解除合作案件**不在本域**：`/adapay/breaches/*` 三条（表态 / 申请平台介入 / 撤回）
 * 契约里根本没有，已整块删除；案件读写走争议线（`@/api/afterSales`）。
 */
export type {
  AdapayAcceptanceResponse,
  AdapayAcceptanceResult,
  AdapayAvailability,
  AdapayBusinessPayChannel,
  AdapayClientPlatform,
  AdapayMemberStatus,
  AdapayMilestone,
  AdapayPaymentResponse,
  PaymentOrderResponse,
  MySettlementAccountChangePayload,
  MySettlementAccountPayload,
  MySettlementAccountSnapshot,
} from './types'

export { createAdapayPayment, getAdapayClientPlatform, getAdapayPayment } from './payment'

export {
  changeMyAdapaySettlementAccount,
  closeMyAdapaySettlementAccount,
  createMyAdapaySettlementAccount,
  getMyAdapayMember,
  getMySettlementAccountSnapshot,
  syncMyAdapaySettlementAccount,
} from './member'

export { getAdapayAvailability } from './availability'
