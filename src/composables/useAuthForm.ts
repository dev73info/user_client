import type { Ref } from 'vue'
import { onBeforeUnmount, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { apiUrl } from '@/api/http'
import {
  getGiteeAuthorizeUrl,
  getGithubAuthorizeUrl,
  getOauthStatus,
  getQqLoginQrStatus,
  getQqLoginQrUrl,
  getWechatLoginQrUrl,
} from '@/api/auth'
import { isQqBrowser, isWechatBrowser } from '@/shared/auth/browser'
import { qrPollDelayMs } from '@/utils/qrPollBackoff'

type AuthMode = 'login' | 'register' | 'reset'

export function useAuthForm(mode: Ref<AuthMode>) {
  const auth = useAuthStore()
  const router = useRouter()
  const { showToast } = useToast()

  const authUsername = ref('')
  const authPassword = ref('')
  const authEmail = ref('')
  const authEmailCode = ref('')
  const authInviteCode = ref('')
  const authShareType = ref('')
  const authShareTargetId = ref('')
  // Cloudflare Turnstile 一次性 token：由登录弹窗里的挂件抛上来，随各接口提交。
  // Turnstile 的 token **一次性**且有时效，被后端消费后必须由挂件 reset 重新取一枚；
  // 因此这里只在「当前这一次提交」使用，挂件在每次请求结束后会清空并重取。
  const authTurnstileToken = ref('')
  const acceptTerms = ref(false)
  const loginRequiresTwoFactor = ref(false)
  const sendCodeLoading = ref(false)
  const sendCodeCountdown = ref(0)
  let sendCodeTimer: ReturnType<typeof setInterval> | null = null

  function resetAuthForm() {
    authUsername.value = ''
    authPassword.value = ''
    authEmail.value = ''
    authEmailCode.value = ''
    authInviteCode.value = ''
    authShareType.value = ''
    authShareTargetId.value = ''
    authTurnstileToken.value = ''
    acceptTerms.value = false
    loginRequiresTwoFactor.value = false
    sendCodeLoading.value = false
    sendCodeCountdown.value = 0
    if (sendCodeTimer) {
      clearInterval(sendCodeTimer)
      sendCodeTimer = null
    }
  }

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
      showToast('请先同意用户协议、隐私政策和支付与退款说明', 'error')
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
      showToast(err instanceof Error ? err.message : 'GitHub 登录失败', 'error')
      githubLoading.value = false
    }
  }

  async function loginWithGitee() {
    if (giteeLoading.value || auth.loading) {
      return
    }
    if (!acceptTerms.value) {
      showToast('请先同意用户协议、隐私政策和支付与退款说明', 'error')
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
      showToast(err instanceof Error ? err.message : 'Gitee 登录失败', 'error')
      giteeLoading.value = false
    }
  }

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
      showToast('请先同意用户协议、隐私政策和支付与退款说明', 'error')
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
      showToast(err instanceof Error ? err.message : '微信扫码登录失败', 'error')
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
      showToast(err instanceof Error ? err.message : '微信扫码登录失败', 'error')
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
    showToast('登录成功', 'success')
    await auth.fetchProfile(true).catch(() => undefined)
    const homeHref = router.resolve({ name: 'home' }).href
    await router.replace(homeHref)
  }

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
        showToast('登录成功', 'success')
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
      showToast('请先同意用户协议、隐私政策和支付与退款说明', 'error')
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
      showToast(err instanceof Error ? err.message : 'QQ登录失败', 'error')
    } finally {
      qqLoginLoading.value = false
    }
  }

  async function sendAuthCode() {
    if (sendCodeLoading.value || sendCodeCountdown.value > 0) {
      return
    }

    sendCodeLoading.value = true
    try {
      if (mode.value === 'login' && loginRequiresTwoFactor.value) {
        const username = authUsername.value.trim()
        const password = authPassword.value
        if (!username || !password) {
          showToast('请先输入用户名和密码', 'error')
          return
        }
        const result = await auth.login(
          username,
          password,
          undefined,
          authTurnstileToken.value || undefined,
        )
        if (!result.requiresTwoFactor) {
          showToast('登录成功', 'success')
          return
        }
      } else {
        const email = authEmail.value.trim()
        if (!email) {
          showToast('请输入邮箱地址', 'error')
          return
        }
        if (mode.value === 'register') {
          await auth.sendRegisterEmailCode(email, authTurnstileToken.value || undefined)
        } else {
          await auth.sendResetPasswordEmailCode(email, authTurnstileToken.value || undefined)
        }
      }
      showToast('验证码已发送，请查收邮箱', 'success')
      sendCodeCountdown.value = 60
      sendCodeTimer = setInterval(() => {
        if (sendCodeCountdown.value <= 1) {
          sendCodeCountdown.value = 0
          if (sendCodeTimer) {
            clearInterval(sendCodeTimer)
            sendCodeTimer = null
          }
          return
        }
        sendCodeCountdown.value -= 1
      }, 1000)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '发送验证码失败', 'error')
    } finally {
      sendCodeLoading.value = false
    }
  }

  async function submitAuth() {
    try {
      if (mode.value === 'login') {
        if (!acceptTerms.value) {
          showToast('请先同意用户协议、隐私政策和支付与退款说明', 'error')
          return false
        }
        const username = authUsername.value.trim()
        const password = authPassword.value
        const twoFactorCode = authEmailCode.value.trim()
        if (!username) {
          showToast('请输入用户名或邮箱', 'error')
          return false
        }
        if (!password) {
          showToast('请输入密码', 'error')
          return false
        }
        if (loginRequiresTwoFactor.value && twoFactorCode.length !== 6) {
          showToast('请输入 6 位邮箱验证码', 'error')
          return false
        }
        const result = await auth.login(
          username,
          password,
          loginRequiresTwoFactor.value ? twoFactorCode : undefined,
          authTurnstileToken.value || undefined,
        )
        if (result.requiresTwoFactor) {
          loginRequiresTwoFactor.value = true
          authEmailCode.value = ''
          showToast('验证码已发送，请查收邮箱', 'success')
          return false
        }
        loginRequiresTwoFactor.value = false
        showToast('登录成功', 'success')
        return true
      }
      if (mode.value === 'register') {
        if (!acceptTerms.value) {
          showToast('请先同意用户协议、隐私政策和支付与退款说明', 'error')
          return false
        }
        const username = authUsername.value.trim()
        const password = authPassword.value
        if (!username) {
          showToast('请输入用户名', 'error')
          return false
        }
        if (!authEmail.value.trim()) {
          showToast('邮箱不能为空', 'error')
          return false
        }
        if (authEmailCode.value.trim().length !== 6) {
          showToast('请输入 6 位邮箱验证码', 'error')
          return false
        }
        if (!password) {
          showToast('请输入密码', 'error')
          return false
        }
        await auth.registerWithEmail(
          username,
          password,
          authEmail.value.trim(),
          authEmailCode.value.trim(),
          authInviteCode.value.trim() || undefined,
          authShareType.value.trim() || undefined,
          authShareTargetId.value.trim() || undefined,
          authTurnstileToken.value || undefined,
        )
        showToast('注册成功', 'success')
        return true
      }
      if (mode.value === 'reset') {
        if (!authEmail.value.trim()) {
          showToast('邮箱不能为空', 'error')
          return false
        }
        if (authEmailCode.value.trim().length !== 6) {
          showToast('请输入 6 位邮箱验证码', 'error')
          return false
        }
        if (!authPassword.value) {
          showToast('请输入新密码', 'error')
          return false
        }
        await auth.resetPasswordWithEmail(
          authEmail.value.trim(),
          authPassword.value,
          authEmailCode.value.trim(),
          authTurnstileToken.value || undefined,
        )
        showToast('密码已重置，已自动登录', 'success')
        return true
      }
      return false
    } catch (err) {
      showToast(err instanceof Error ? err.message : '操作失败', 'error')
      return false
    }
  }

  function changeAuthMode(modeValue: AuthMode) {
    mode.value = modeValue
    loginRequiresTwoFactor.value = false
    authEmailCode.value = ''
  }

  void loadOauthStatus()

  return {
    authUsername,
    authPassword,
    authEmail,
    authEmailCode,
    authInviteCode,
    authShareType,
    authShareTargetId,
    authTurnstileToken,
    acceptTerms,
    loginRequiresTwoFactor,
    sendCodeLoading,
    sendCodeCountdown,
    githubLoading,
    giteeLoading,
    wechatLoginLoading,
    qqLoginLoading,
    githubAvailable,
    wechatAvailable,
    qqAvailable,
    giteeAvailable,
    loadOauthStatus,
    resetAuthForm,
    loginWithGithub,
    loginWithGitee,
    loginWithWechat,
    sendAuthCode,
    submitAuth,
    changeAuthMode,
    wechatQrLogin,
    closeWechatQrLogin,
    refreshWechatQrLogin,
    handleWechatQrToken,
    loginWithQq,
  }
}
