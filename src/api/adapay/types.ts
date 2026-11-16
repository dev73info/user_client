import type { components } from '@/api/generated/schema'

type Schemas = components['schemas']

export type AdapayMilestone = 'deposit' | 'final'
export type AdapayClientPlatform = 'mobile' | 'desktop'
export type AdapayBusinessPayChannel = 'alipay' | 'wechat'

export type AdapayPaymentResponse = Schemas['DepositPaymentResponse']
export type PaymentOrderResponse = Schemas['PaymentOrderResponse']

export type AdapayDeveloperDepositPaymentResponse = {
  paymentId: string
  amountCny: string
  payChannel: string
  payMode: 'delay'
  status: string
  providerPaymentId?: string | null
  providerStatus?: string | null
  payUrl?: string | null
}

export type AdapayAcceptanceResult = 'passed' | 'rejected'

export type AdapayAcceptanceResponse = {
  /** 本次提交的验收留档 ID；验收可重复提交，历史记录按时间倒序展示。 */
  recordId: number
  requirementId: string
  /** 无担保模式没有合同，此时为空。 */
  contractId: number | null
  /** 本次提交的验收结论。 */
  status: AdapayAcceptanceResult
  note: string
  acceptedAt: string
  depositSplitStatus: string
}

/**
 * 收款账户（结算账户）在用户端的读数。
 *
 * 字段全部来自契约 `GET /api/payment/settlement-account`（`SettlementAccountResponse`），
 * 只有命名从 snake_case 折成 camelCase；契约里没有的东西（渠道会员号、结算账户号、
 * 渠道侧状态原文）一律不编：**平台只存卡号后四位**，也就没有可回显的完整卡号或账户号。
 */
export type AdapayMemberStatus = {
  username: string
  /** `personal` / `enterprise`。 */
  memberType?: string | null
  /** 收款人姓名。 */
  accountName?: string | null
  /** 开户行。 */
  bankName?: string | null
  /** 卡号后四位（平台不存完整卡号）。 */
  accountNoTail?: string | null
  /** `pending` / `under_review` / `active` / `failed` / `closed`，口径见 `@/shared/settleAccountStage`。 */
  onboardingStatus: string
  /** 后端给的中文状态说明，直接展示。 */
  statusLabel?: string | null
  /** 审核意见（平台侧）。 */
  reviewNote?: string | null
  /** 渠道侧失败原因，用于告诉用户「为什么没开通、接下来该补什么」。 */
  providerError?: string | null
  /** 渠道会员已就绪，可以绑定结算账户；不等于已能收款。 */
  memberReady?: boolean
  /** 能不能收分账款：状态可用且号码齐备（后端判定）。 */
  acceptsSettlement: boolean
  updatedTime?: string | null
}

export type MySettlementAccountPayload = Schemas['SettlementApplyRequest']
export type MySettlementAccountChangePayload = Schemas['SettlementAccountChangeRequest']
/**
 * 对私自动开户请求体（`POST /api/payment/settlement-account/open`）。
 *
 * 含完整卡号、银行预留手机号与证件号：**只在请求体里出现一次**，后端校验后直接送渠道，
 * 不落库、不进日志。平台只保存后四位（响应 `SettlementAccountResponse.account_no_tail`）。
 */
export type MySettlementOpenPayload = Schemas['SettlementOpenRequest']

/**
 * 已绑定结算账户的**脱敏**快照，用于「收款银行卡」弹窗回填。
 *
 * 契约只回后四位：完整卡号平台不存，所以这里也没有可回填的卡号，
 * 提示文案只能写「当前尾号 xxxx」。
 */
export type MySettlementAccountSnapshot = {
  bound: boolean
  accountName?: string
  bankName?: string
  accountNoTail?: string
  memberType?: string
}

export type AdapayAvailability = Schemas['AvailabilityResponse']
