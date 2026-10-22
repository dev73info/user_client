import { useRoute } from 'vue-router'
import { TMessage } from 'ui_73info'

import { getWechatPaymentAuthorizationStatus, getWechatPaymentAuthorizeUrl } from '@/api/auth'
import { isWechatBrowser } from '@/shared/auth/browser'

export type WechatAuthorizeResult = {
  ok: boolean
  /** 失败原因（原样透给弹窗，别让用户只看到转瞬即逝的 toast） */
  message: string
}

/**
 * 微信支付的「先授权再下单」。
 *
 * 仅微信内置浏览器需要先做静默授权拿 openid（下单走 `wx_pub` JSAPI）；
 * PC / 普通浏览器直接返回 ok，后端回本站中间页 URL 画码，手机扫码后在中间页 OAuth。
 *
 * 单独成一份是因为 `useResourcePurchase` 已经直接用满三处 api 模块
 * （`resourcePurchase` / `adapay` / `points`），授权这块归 `api/auth`；
 * 同时它跟下单流程只有「先问一句能不能下单」的关系，不需要塞在同一份状态里。
 */
export function useWechatPayAuthorize() {
  const route = useRoute()

  async function ensureAuthorized(token: string): Promise<WechatAuthorizeResult> {
    if (!isWechatBrowser()) {
      return { ok: true, message: '' }
    }
    // 从授权回跳过来的那一跳已经绑好了 openid，不必再查一次
    if (route.query.wechat_oauth === 'success') {
      return { ok: true, message: '' }
    }
    try {
      const { authorized } = await getWechatPaymentAuthorizationStatus(token)
      if (authorized) {
        return { ok: true, message: '' }
      }
      const { url } = await getWechatPaymentAuthorizeUrl(token, window.location.href)
      if (!url.trim()) {
        const message = '微信授权地址为空，请改用支付宝或稍后重试'
        TMessage.error(message)
        return { ok: false, message }
      }
      TMessage.info('首次微信支付需先完成微信授权，正在跳转…')
      window.location.assign(url)
      return { ok: false, message: '' }
    } catch (error) {
      const message = error instanceof Error ? error.message : '检查微信授权失败'
      TMessage.error(message)
      return { ok: false, message }
    }
  }

  return { ensureAuthorized }
}
