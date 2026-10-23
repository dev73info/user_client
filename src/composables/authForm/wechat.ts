import type { Ref } from 'vue'
import { onBeforeUnmount, reactive, ref } from 'vue'
import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { apiUrl } from '@/api/http'
import { getWechatLoginQrUrl } from '@/api/auth'
import { isWechatBrowser } from '@/shared/auth/browser'
import { TMessage } from 'ui_73info'

type AuthStore = ReturnType<typeof useAuthStore>

/** 微信登录：微信内跳服务号网页授权，PC 端展示扫码弹窗并轮询登录状态。 */
export function useWechatLogin({
  auth,
  router,
  acceptTerms,
}: {
  auth: AuthStore
  router: Router
  acceptTerms: Ref<boolean>
}) {
  const wechatLoginLoading = ref(false)

  // PC 端扫码登录：展示二维码并轮询登录 token。
  const wechatQrLogin = reactive({ visible: false, url: '', state: '', pollSecret: '' })

  /** 扫码登录的回调落点：与 GitHub / Gitee 一致，固定回首页。 */
  function wechatQrRedirectTarget(): string {
    const homeHref = router.resolve({ name: 'home' }).href
    return `${window.location.origin}${homeHref}`
  }

  /** 申领一张新的扫码登录二维码（首次打开与「重新扫码」共用）。 */
  async function openWechatQrLogin() {
    const qr = await getWechatLoginQrUrl(wechatQrRedirectTarget())
    if (!qr.url.trim() || !qr.state.trim() || !qr.poll_secret?.trim()) {
      throw new Error('微信扫码登录地址为空')
    }
    wechatQrLogin.url = qr.url
    wechatQrLogin.state = qr.state
    wechatQrLogin.pollSecret = qr.poll_secret
    wechatQrLogin.visible = true
  }

  async function loginWithWechat() {
    if (wechatLoginLoading.value || auth.loading) {
      return
    }
    if (!acceptTerms.value) {
      TMessage.error('请先同意用户协议、隐私政策和支付与退款说明')
      return
    }

    wechatLoginLoading.value = true
    const redirectTarget = wechatQrRedirectTarget()

    // 微信内（移动端）：点击跳转服务号网页授权；PC 端：展示二维码扫码登录。
    if (isWechatBrowser()) {
      const loginUrl = apiUrl(
        `/auth/wechat/login/url?redirect_to=${encodeURIComponent(redirectTarget)}`,
      )
      window.location.href = loginUrl
      return
    }

    try {
      await openWechatQrLogin()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '微信扫码登录失败')
    } finally {
      wechatLoginLoading.value = false
    }
  }

  /**
   * 弹窗里点「重新扫码」：手机端取消了本次登录、或二维码已失效时重新申领一张。
   * 失败就把弹窗关掉并提示——留在原地只会让人对着一个申领不出来的空框。
   */
  async function refreshWechatQrLogin() {
    try {
      await openWechatQrLogin()
    } catch (err) {
      closeWechatQrLogin()
      TMessage.error(err instanceof Error ? err.message : '微信扫码登录失败')
    }
  }

  function closeWechatQrLogin() {
    wechatQrLogin.visible = false
    wechatQrLogin.url = ''
    wechatQrLogin.state = ''
    wechatQrLogin.pollSecret = ''
  }

  onBeforeUnmount(closeWechatQrLogin)

  async function handleWechatQrToken(token: string) {
    closeWechatQrLogin()
    auth.setToken(token)
    TMessage.success('登录成功')
    await auth.fetchProfile(true).catch(() => undefined)
    const homeHref = router.resolve({ name: 'home' }).href
    await router.replace(homeHref)
  }
  return {
    wechatLoginLoading,
    wechatQrLogin,
    loginWithWechat,
    closeWechatQrLogin,
    refreshWechatQrLogin,
    handleWechatQrToken,
  }
}
