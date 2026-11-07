/**
 * 微信 JSAPI「商家转账」确认收款的 WeixinJSBridge 封装。
 *
 * `WeixinJSBridge` 是微信内置浏览器注入的原生对象，不依赖 jweixin SDK；
 * 非微信环境拿不到，调用方需要自己回退到扫码提示。
 */

export type WeixinBridge = {
  invoke: (
    method: string,
    params: { mchId: string; appId: string; package: string },
    callback: (result: { err_msg?: string }) => void,
  ) => void
}

export type MerchantTransferParams = {
  mchId: string
  appId: string
  package: string
}

export function getWeixinBridge(): WeixinBridge | null {
  if (typeof window === 'undefined') return null
  const bridge = (window as Window & { WeixinJSBridge?: WeixinBridge }).WeixinJSBridge
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

/** bridge 可能晚于页面脚本注入：等一次 `WeixinJSBridgeReady`，5 秒还没有就当不可用。 */
export function waitForWeixinBridge(timeoutMs = 5000): Promise<WeixinBridge | null> {
  const ready = getWeixinBridge()
  if (ready) return Promise.resolve(ready)

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let done = false
    const finish = () => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('WeixinJSBridgeReady', finish)
      resolve(getWeixinBridge())
    }
    document.addEventListener('WeixinJSBridgeReady', finish, { once: true })
    timer = setTimeout(finish, timeoutMs)
  })
}

export function invokeTransfer(
  bridge: WeixinBridge,
  params: MerchantTransferParams,
): Promise<'ok' | 'cancel' | 'fail'> {
  return new Promise((resolve) => {
    bridge.invoke('requestMerchantTransfer', params, (result) => {
      const message = (result.err_msg ?? '').toLowerCase()
      if (message.includes(':ok')) resolve('ok')
      else if (message.includes('cancel')) resolve('cancel')
      else resolve('fail')
    })
  })
}
