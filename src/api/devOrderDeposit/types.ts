import type { components } from '@/api/generated/schema'

type Schemas = components['schemas']

export type PrepaidWithdrawal = Schemas['WithdrawalResponse']
export type PrepaidWithdrawalRequest = Schemas['WithdrawalRequest']
export type PrepaidRefundRequest = Schemas['RefundRequest']
export type PrepaidRefundResponse = Schemas['RefundResponse']
export type PrepaidAccount = Schemas['PrepaidAccountResponse']
export type PrepaidLedgerEntry = Schemas['PrepaidLedgerResponse']
export type PrepaidAccountStatement = Schemas['PrepaidAccountStatementResponse']
export type PrepaidAccountPage = Schemas['PrepaidAccountPageResponse']
export type PrepaidRechargeRequest = Schemas['PrepaidRechargeRequest']
export type PrepaidCreditRequest = Schemas['PrepaidCreditRequest']

/** 契约中的支付动作是原始 JSON，这里按支付端定义的三种字段收窄。 */
export type PrepaidClientAction = {
  redirect_url?: string | null
  qr_code?: string | null
  sdk_payload?: unknown
}

export type PrepaidOrder = Omit<Schemas['PrepaidOrderResponse'], 'client_action'> & {
  client_action?: PrepaidClientAction | null
}

export type PrepaidOrderList = Omit<Schemas['PrepaidOrderListResponse'], 'items'> & {
  items: PrepaidOrder[]
}

type QueryWithoutNull<T> = {
  [K in keyof T]?: Exclude<T[K], null>
}

export type PrepaidOrderQuery = QueryWithoutNull<Schemas['PrepaidOrderListQuery']>
export type PrepaidWithdrawalQuery = QueryWithoutNull<Schemas['WithdrawalListQuery']>
