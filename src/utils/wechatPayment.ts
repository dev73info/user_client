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

type WechatBridge = {
  invoke: (
    method: string,
    params: WechatJsapiPaymentInfo,
    callback: (result: { err_msg?: string }) => void,
  ) => void
}

function getWechatBridge(): WechatBridge | null {
  return (window as Window & { WeixinJSBridge?: WechatBridge }).WeixinJSBridge ?? null
}

/** 一次 JSAPI 调起的结果：只描述「微信侧动作」，到账以服务端查单为准。 */
export type WechatJsapiOutcome = 'ok' | 'cancel' | 'fail' | 'unavailable'

/**
 * 把 JSAPI 参数交给微信内置浏览器并等一个结论。
 *
 * 与 `useWechatJsapiPay` 的区别是没有会话状态：给只需要「拉一次支付」的
 * 轻量页面（保证金充值中间页）用。bridge 可能晚于脚本注入，等一次
 * `WeixinJSBridgeReady`；5 秒还没出现就明确失败，不让页面永远转圈。
 */
export function invokeWechatJsapiPayment(
  payInfo: WechatJsapiPaymentInfo,
): Promise<WechatJsapiOutcome> {
  return new Promise((resolve) => {
    const invoke = () => {
      const bridge = getWechatBridge()
      if (!bridge) {
        resolve('unavailable')
        return
      }
      bridge.invoke('getBrandWCPayRequest', payInfo, (result) => {
        const message = result.err_msg?.toLowerCase() ?? ''
        if (message.includes(':ok')) resolve('ok')
        else if (message.includes('cancel')) resolve('cancel')
        else resolve('fail')
      })
    }

    if (getWechatBridge()) {
      invoke()
      return
    }
    const onReady = () => {
      document.removeEventListener('WeixinJSBridgeReady', onReady)
      invoke()
    }
    document.addEventListener('WeixinJSBridgeReady', onReady, { once: true })
    window.setTimeout(() => {
      if (!getWechatBridge()) {
        document.removeEventListener('WeixinJSBridgeReady', onReady)
        resolve('unavailable')
      }
    }, 5000)
  })
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

/** 资源购买 PC 出码 → 手机打开的本站中间页（凭 order token，无需登录） */
export function isResourceWechatMiddlePage(query: Record<string, unknown>): boolean {
  const flag = query.resource_wechat
  const orderNo = typeof query.order_no === 'string' ? query.order_no.trim() : ''
  const token = typeof query.token === 'string' ? query.token.trim() : ''
  return (flag === '1' || flag === 1) && Boolean(orderNo) && Boolean(token)
}
