export type WechatJsapiPaymentInfo = {
  appId: string
  timeStamp: string
  nonceStr: string
  package: string
  signType: string
  paySign: string
}

export function parseWechatPayInfo(raw: string): WechatJsapiPaymentInfo | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const source = parsed as Record<string, unknown>
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const value = source[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
    return ''
  }
  const paymentInfo = {
    appId: read('appId', 'app_id'),
    timeStamp: read('timeStamp', 'timestamp', 'time_stamp'),
    nonceStr: read('nonceStr', 'nonce_str'),
    package: read('package'),
    signType: read('signType', 'sign_type'),
    paySign: read('paySign', 'pay_sign'),
  }
  return Object.values(paymentInfo).every(Boolean) ? paymentInfo : null
}

export function isWechatPaymentHandoff(query: Record<string, unknown>): boolean {
  return query.adapay === '1' &&
    query.payment_handoff === '1' &&
    query.channel === 'wechat' &&
    query.client_platform === 'mobile' &&
    query.intent !== '1' &&
    typeof query.payment_id === 'string' && Boolean(query.payment_id.trim()) &&
    typeof query.qr_content === 'string' && Boolean(parseWechatPayInfo(query.qr_content))
}
