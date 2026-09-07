export type PaymentRouteChannel = 'alipay' | 'wechat' | 'union'
export type PaymentRoutePlatform = 'mobile' | 'pc'
export type PaymentRouteMilestone = 'deposit' | 'final'

export type AdapayPaymentRouteOptions = {
  requirementId: string
  channel: PaymentRouteChannel
  clientPlatform: PaymentRoutePlatform
  amountCny: string | number
  paymentId?: string
  qrContent?: string | null
  milestone?: PaymentRouteMilestone
  intent?: boolean
}

export function buildAdapayPaymentQuery(options: AdapayPaymentRouteOptions): Record<string, string> {
  const query: Record<string, string> = {
    adapay: '1',
    requirement_id: options.requirementId,
    channel: options.channel,
    client_platform: options.clientPlatform,
    amount_cny: String(options.amountCny),
  }

  if (options.paymentId) {
    query.payment_id = options.paymentId
  }

  if (options.qrContent) {
    query.qr_content = options.qrContent
  }

  if (options.milestone) {
    query.milestone = options.milestone
  }

  if (options.intent) {
    query.intent = '1'
  }

  return query
}
