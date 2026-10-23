import { ref } from 'vue'
import type { Ref } from 'vue'
import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getGiteeAuthorizeUrl, getGithubAuthorizeUrl, getOauthStatus } from '@/api/auth'
import { TMessage } from 'ui_73info'

type AuthStore = ReturnType<typeof useAuthStore>

/** GitHub / Gitee 快捷登录与「各渠道是否可用」的探活。 */
export function useAuthProviders({
  auth,
  router,
  acceptTerms,
}: {
  auth: AuthStore
  router: Router
  acceptTerms: Ref<boolean>
}) {
  const githubLoading = ref(false)
  const giteeLoading = ref(false)

  // 各快捷登录是否可用（由后端配置决定），不可用时前端不展示对应按钮。
  const githubAvailable = ref(false)
  const wechatAvailable = ref(false)
  const qqAvailable = ref(false)
  const giteeAvailable = ref(false)

  async function loadOauthStatus() {
    try {
      const status = await getOauthStatus()
      githubAvailable.value = !!status.github
      wechatAvailable.value = !!status.wechat
      qqAvailable.value = !!status.qq
      giteeAvailable.value = !!status.gitee
    } catch {
      githubAvailable.value = false
      wechatAvailable.value = false
      qqAvailable.value = false
      giteeAvailable.value = false
    }
  }

  async function loginWithGithub() {
    if (githubLoading.value || auth.loading) {
      return
    }
    if (!acceptTerms.value) {
      TMessage.error('请先同意用户协议、隐私政策和支付与退款说明')
      return
    }

    githubLoading.value = true
    // 与开发者端保持一致：固定回到首页，减少不同页面路径带来的回调不稳定。
    const homeHref = router.resolve({ name: 'home' }).href
    const redirectTarget = `${window.location.origin}${homeHref}`

    try {
      const resp = await getGithubAuthorizeUrl(redirectTarget)
      if (!resp.url) {
        throw new Error('GitHub 授权地址为空')
      }
      window.location.href = resp.url
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : 'GitHub 登录失败')
      githubLoading.value = false
    }
  }

  async function loginWithGitee() {
    if (giteeLoading.value || auth.loading) {
      return
    }
    if (!acceptTerms.value) {
      TMessage.error('请先同意用户协议、隐私政策和支付与退款说明')
      return
    }

    giteeLoading.value = true
    // 与开发者端保持一致：固定回到首页，减少不同页面路径带来的回调不稳定。
    const homeHref = router.resolve({ name: 'home' }).href
    const redirectTarget = `${window.location.origin}${homeHref}`

    try {
      const resp = await getGiteeAuthorizeUrl(redirectTarget)
      if (!resp.url) {
        throw new Error('Gitee 授权地址为空')
      }
      window.location.href = resp.url
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : 'Gitee 登录失败')
      giteeLoading.value = false
    }
  }
  return {
    githubLoading,
    giteeLoading,
    githubAvailable,
    wechatAvailable,
    qqAvailable,
    giteeAvailable,
    loadOauthStatus,
    loginWithGithub,
    loginWithGitee,
  }
}
