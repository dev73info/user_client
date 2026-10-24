/**
 * Adapay（电签担保）域接口。
 *
 * 拆成 payment（定金 / 尾款与开发者保证金充值）、acceptance（验收）、breach（解除合作案件）、
 * member（会员状态与结算账户）、availability（可用性）与共用的 types；
 * 本文件只做汇总导出，调用方仍然 `import ... from '@/api/adapay'`。
 */
export type {
  AdapayAcceptanceResponse,
  AdapayAcceptanceResult,
  AdapayAvailability,
  AdapayBreachCase,
  AdapayBreachDecisionValue,
  AdapayBreachLiableParty,
  AdapayBreachVerdictParty,
  AdapayBreachVerdictSource,
  AdapayBusinessPayChannel,
  AdapayClientPlatform,
  AdapayDeveloperDepositPaymentResponse,
  AdapayMemberStatus,
  AdapayMilestone,
  AdapayPaymentResponse,
  MySettlementAccountPayload,
  MySettlementAccountSnapshot,
} from './types'

export {
  createAdapayDeveloperDepositPayment,
  createAdapayPayment,
  getAdapayClientPlatform,
  getAdapayDeveloperDepositPayment,
  getAdapayPayment,
} from './payment'

export {
  getAdapayBreachCase,
  reportAdapayTermination,
  requestAdapayPlatformReview,
  submitAdapayBreachDecision,
  withdrawAdapayBreach,
} from './breach'

export {
  changeMyAdapaySettlementAccount,
  closeMyAdapaySettlementAccount,
  createMyAdapaySettlementAccount,
  getMyAdapayMember,
  getMySettlementAccountSnapshot,
} from './member'

export { getAdapayAvailability } from './availability'
