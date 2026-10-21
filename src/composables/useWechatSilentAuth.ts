import { onUnmounted, ref } from 'vue'
import QRCode from 'qrcode'
import { TMessage } from 'ui_73info'

import { getWechatPaymentAuthorizeUrl, getWechatPaymentAuthorizationStatus } from '@/api/auth'
import type { PaymentSession } from '@/composables/usePaymentSession'

/** 后端授权 state 有效期 10 分钟，超时后二维码失效，需要重新发起。 */
const SILENT_AUTH_QR_TTL_MS = 10 * 60 * 1000
const SILENT_AUTH_POLL_INTERVAL_MS = 2000

type UseWechatSilentAuthOptions = {
  session: PaymentSession
  token: () => string
  /** 授权成功后刷新一次用户资料（回填 open_id 绑定状态） */
  refreshProfile: () => Promise<void>
  /** 授权成功后接着往下走（意图模式下继续下单） */
  onAuthorized: () => Promise<void> | void
}

/**
 * PC 端微信 snsapi_base 静默授权。
 *
 * 未绑定微信（缺 open_id）时 Adapay 下单会失败，原做法是让用户回订单页重来；
 * 这里在支付页就地出授权二维码：手机微信扫码后无确认页、无感知完成绑定，
 * PC 轮询 `auth/wechat/payment/status`，检测到已授权即自动继续下单。
 */
export function useWechatSilentAuth(options: UseWechatSilentAuthOptions) {
  const silentAuthQrDataUrl = ref('')
  const silentAuthWaiting = ref(false)
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let expireTimer: ReturnType<typeof setTimeout> | null = null

  function stopSilentWechatAuthPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function resetSilentWechatAuth() {
    stopSilentWechatAuthPolling()
    if (expireTimer) {
      clearTimeout(expireTimer)
      expireTimer = null
    }
    silentAuthWaiting.value = false
    silentAuthQrDataUrl.value = ''
  }

  async function checkSilentWechatAuth() {
    if (!silentAuthWaiting.value || !options.token()) {
      return
    }
    try {
      const { authorized } = await getWechatPaymentAuthorizationStatus(options.token())
      if (!authorized) {
        return
      }
    } catch {
      // 轮询失败保留二维码，继续下一轮。
      return
    }
    resetSilentWechatAuth()
    TMessage.success('微信授权成功，正在继续支付')
    await options.refreshProfile()
    await options.onAuthorized()
  }

  async function startSilentWechatAuth() {
    if (!options.token() || silentAuthWaiting.value) {
      return
    }
    silentAuthWaiting.value = true
    silentAuthQrDataUrl.value = ''
    options.session.wechatPayError.value = ''
    try {
      const { url } = await getWechatPaymentAuthorizeUrl(
        options.token(),
        window.location.href,
        'qr',
      )
      if (!url.trim()) {
        throw new Error('微信授权二维码地址为空')
      }
      silentAuthQrDataUrl.value = await QRCode.toDataURL(url, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: 'M',
      })
      pollTimer = setInterval(() => {
        void checkSilentWechatAuth()
      }, SILENT_AUTH_POLL_INTERVAL_MS)
      expireTimer = setTimeout(() => {
        if (!silentAuthWaiting.value) {
          return
        }
        resetSilentWechatAuth()
        options.session.wechatPayError.value = '微信授权二维码已过期，请点击重试重新获取。'
      }, SILENT_AUTH_QR_TTL_MS)
    } catch (err) {
      resetSilentWechatAuth()
      options.session.wechatPayError.value =
        err instanceof Error ? err.message : '获取微信授权二维码失败，请重试。'
    }
  }

  onUnmounted(() => {
    stopSilentWechatAuthPolling()
    if (expireTimer) {
      clearTimeout(expireTimer)
      expireTimer = null
    }
  })

  return {
    silentAuthQrDataUrl,
    silentAuthWaiting,
    startSilentWechatAuth,
    resetSilentWechatAuth,
  }
}
