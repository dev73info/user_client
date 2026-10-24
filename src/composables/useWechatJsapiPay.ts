import { onUnmounted, ref } from 'vue'
import { TMessage } from 'ui_73info'

import type { WechatJsapiPaymentInfo } from '@/utils/wechatPayment'
import type { PaymentSession } from '@/composables/usePaymentSession'

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

type UseWechatJsapiPayOptions = {
  session: PaymentSession
  /** 微信支付参数（订单 payUrl / 中间页回填），拿不到就不调起 */
  payInfo: () => WechatJsapiPaymentInfo | null
  isWechatBrowser: () => boolean
  /** 跨设备 handoff 的落地页没有登录态，不做查单 */
  isPaymentHandoff: () => boolean
  token: () => string
  /** 微信回调 `:ok` 后补一次查单（到账以服务端为准） */
  onSubmitted: () => void
}

/**
 * 微信 JSAPI 调起（`getBrandWCPayRequest`）。
 *
 * 只负责「把支付参数交给微信」并记录回调结果：`:ok` 只说明支付动作发出去了，
 * 真到账仍要靠查单，所以这里不写 `paid`，只写 `wechatSubmitted`（两者语义不同，见页面的支付结果区）。
 */
export function useWechatJsapiPay(options: UseWechatJsapiPayOptions) {
  const wechatPayLoading = ref(false)
  let bridgeListener: (() => void) | null = null

  function launchWechatPayment() {
    const { session } = options
    if (
      session.wechatSubmitted.value ||
      session.paid.value ||
      wechatPayLoading.value ||
      bridgeListener
    ) {
      return
    }
    session.wechatPayError.value = ''
    const paymentInfo = options.payInfo()
    if (!paymentInfo) {
      session.wechatPayError.value = '微信支付信息无效，请返回订单页重新发起支付。'
      return
    }
    if (!options.isWechatBrowser()) {
      session.wechatPayError.value = '请用手机微信打开当前支付页后再发起支付。'
      return
    }

    const invoke = () => {
      bridgeListener = null
      if (session.wechatSubmitted.value || session.paid.value) return
      const bridge = getWechatBridge()
      if (!bridge) {
        session.wechatPayError.value = '微信支付环境未就绪，请稍后重试。'
        return
      }

      wechatPayLoading.value = true
      bridge.invoke('getBrandWCPayRequest', paymentInfo, (result) => {
        wechatPayLoading.value = false
        const message = result.err_msg?.toLowerCase() ?? ''
        if (message.includes(':ok')) {
          session.wechatSubmitted.value = true
          TMessage.success('微信支付请求已提交，请等待支付结果')
          if (options.token() && !options.isPaymentHandoff()) {
            options.onSubmitted()
          }
        } else if (message.includes('cancel')) {
          session.wechatPayError.value = '你已取消微信支付。'
        } else {
          session.wechatPayError.value = '微信支付未完成，请重试或返回订单页。'
        }
      })
    }

    if (getWechatBridge()) {
      invoke()
      return
    }

    // 微信内置浏览器里 bridge 可能晚于页面脚本注入，等一次 WeixinJSBridgeReady
    if (bridgeListener) {
      document.removeEventListener('WeixinJSBridgeReady', bridgeListener)
    }
    bridgeListener = invoke
    document.addEventListener('WeixinJSBridgeReady', bridgeListener, { once: true })
  }

  onUnmounted(() => {
    if (bridgeListener) {
      document.removeEventListener('WeixinJSBridgeReady', bridgeListener)
      bridgeListener = null
    }
  })

  return { wechatPayLoading, launchWechatPayment }
}
