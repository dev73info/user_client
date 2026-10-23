import type { Ref } from 'vue'
import { onBeforeUnmount, ref } from 'vue'
import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { apiUrl } from '@/api/http'
import { getQqLoginQrStatus, getQqLoginQrUrl } from '@/api/auth'
import { isQqBrowser } from '@/shared/auth/browser'
import { qrPollDelayMs } from '@/utils/qrPollBackoff'
import { TMessage } from 'ui_73info'

type AuthStore = ReturnType<typeof useAuthStore>

/** QQ 登录：QQ 内跳授权页，PC 端开小窗授权并轮询登录状态。 */
export function useQqLogin({
  auth,
  router,
  acceptTerms,
}: {
  auth: AuthStore
  router: Router
  acceptTerms: Ref<boolean>
}) {
  const qqLoginLoading = ref(false)
  let qqAuthorizationWindow: Window | null = null
  let qqPollTimer: ReturnType<typeof setTimeout> | null = null
  let qqLoginGeneration = 0

  function stopQqLogin() {
    qqLoginGeneration += 1
    if (qqPollTimer) {
      clearTimeout(qqPollTimer)
      qqPollTimer = null
    }
    qqAuthorizationWindow?.close()
    qqAuthorizationWindow = null
  }

  async function checkQqLogin(state: string, generation: number, attempt = 0) {
    if (generation !== qqLoginGeneration) return
    try {
      const result = await getQqLoginQrStatus(state)
      if (generation !== qqLoginGeneration) return
      if (result.token) {
        stopQqLogin()
        auth.setToken(result.token)
        TMessage.success('登录成功')
        await auth.fetchProfile(true).catch(() => undefined)
        const homeHref = router.resolve({ name: 'home' }).href
        await router.replace(homeHref)
        return
      }
    } catch {
      if (generation !== qqLoginGeneration) return
    }
    if (generation !== qqLoginGeneration) return
    if (qqAuthorizationWindow?.closed) {
      stopQqLogin()
      return
    }
    qqPollTimer = setTimeout(
      () => void checkQqLogin(state, generation, attempt + 1),
      qrPollDelayMs(attempt + 1),
    )
  }

  onBeforeUnmount(stopQqLogin)

  async function loginWithQq() {
    if (qqLoginLoading.value || auth.loading) {
      return
    }
    if (!acceptTerms.value) {
      TMessage.error('请先同意用户协议、隐私政策和支付与退款说明')
      return
    }

    qqLoginLoading.value = true
    const homeHref = router.resolve({ name: 'home' }).href
    const redirectTarget = `${window.location.origin}${homeHref}`

    if (isQqBrowser()) {
      const loginUrl = apiUrl(
        `/auth/qq/login/url?redirect_to=${encodeURIComponent(redirectTarget)}`,
      )
      window.location.href = loginUrl
      return
    }

    stopQqLogin()
    const generation = qqLoginGeneration
    qqAuthorizationWindow = window.open(
      '',
      'TencentLogin',
      'width=450,height=640,menubar=0,scrollbars=1,resizable=1,status=1,titlebar=0,toolbar=0,location=1',
    )

    try {
      const qr = await getQqLoginQrUrl(redirectTarget)
      if (generation !== qqLoginGeneration) return
      if (!qr.url.trim() || !qr.state.trim()) {
        throw new Error('QQ授权地址为空')
      }
      if (!qqAuthorizationWindow) {
        window.location.assign(qr.url)
        return
      }
      qqAuthorizationWindow.location.href = qr.url
      void checkQqLogin(qr.state, generation)
    } catch (err) {
      if (generation !== qqLoginGeneration) return
      stopQqLogin()
      TMessage.error(err instanceof Error ? err.message : 'QQ登录失败')
    } finally {
      qqLoginLoading.value = false
    }
  }
  return {
    qqLoginLoading,
    loginWithQq,
  }
}
