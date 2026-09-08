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

  function isWechatBrowser() {
    return /MicroMessenger/i.test(navigator.userAgent)
  }

  function isQqBrowser() {
    return /(?:QQ|MQQBrowser)/i.test(navigator.userAgent)
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
    const homeHref = router.resolve({ name: 'home' }).href
    const redirectTarget = `${window.location.origin}${homeHref}`

    // 微信内（移动端）：点击跳转服务号网页授权；PC 端：展示二维码扫码登录。
    if (isWechatBrowser()) {
      const loginUrl = apiUrl(
        `/auth/wechat/login/url?redirect_to=${encodeURIComponent(redirectTarget)}`,
      )
      window.location.href = loginUrl
      return
    }

    try {
      const qr = await getWechatLoginQrUrl(redirectTarget)
      if (!qr.url.trim() || !qr.state.trim() || !qr.poll_secret?.trim()) {
        throw new Error('微信扫码登录地址为空')
      }
      wechatQrLogin.url = qr.url
      wechatQrLogin.state = qr.state
      wechatQrLogin.pollSecret = qr.poll_secret
      wechatQrLogin.visible = true
    } catch (err) {
      showToast(err instanceof Error ? err.message : '微信扫码登录失败', 'error')
    } finally {
      wechatLoginLoading.value = false
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

  async function checkQqLogin(state: string, generation: number) {
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
    qqPollTimer = setTimeout(() => void checkQqLogin(state, generation), 2000)
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
        const result = await auth.login(username, password)
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
          await auth.sendRegisterEmailCode(email)
        } else {
          await auth.sendResetPasswordEmailCode(email)
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
    handleWechatQrToken,
    loginWithQq,
  }
}
