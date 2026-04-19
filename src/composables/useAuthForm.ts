import type { Ref } from 'vue'
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { startGlobalLoading } from '@/composables/useGlobalLoadingScreen'
import { useToast } from '@/composables/useToast'
import { getGithubAuthorizeUrl } from '@/api/auth'

type AuthMode = 'login' | 'register' | 'reset'
type GithubOauthMessage = {
  type: '73hub-github-oauth'
  oauthToken?: string
  oauthError?: string
}

function buildGithubPopupFeatures() {
  const width = 720
  const height = 840
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2))
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2))

  return [
    'popup=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'resizable=yes',
    'scrollbars=yes',
  ].join(',')
}

function waitForGithubPopupResult(popup: Window): Promise<GithubOauthMessage> {
  return new Promise((resolve, reject) => {
    const expectedOrigin = window.location.origin

    const cleanup = () => {
      window.removeEventListener('message', handleMessage)
      window.clearInterval(closeCheckTimer)
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) {
        return
      }

      if (event.source !== popup) {
        return
      }

      const data = event.data as GithubOauthMessage | undefined
      if (!data || data.type !== '73hub-github-oauth') {
        return
      }

      cleanup()
      resolve(data)
    }

    const closeCheckTimer = window.setInterval(() => {
      if (!popup.closed) {
        return
      }

      cleanup()
      reject(new Error('GitHub 登录已取消'))
    }, 400)

    window.addEventListener('message', handleMessage)
  })
}

export function useAuthForm(mode: Ref<AuthMode>) {
  const auth = useAuthStore()
  const { showToast } = useToast()

  const authUsername = ref('')
  const authPassword = ref('')
  const authEmail = ref('')
  const authEmailCode = ref('')
  const acceptTerms = ref(false)
  const sendCodeLoading = ref(false)
  const sendCodeCountdown = ref(0)
  let sendCodeTimer: ReturnType<typeof setInterval> | null = null

  function resetAuthForm() {
    authUsername.value = ''
    authPassword.value = ''
    authEmail.value = ''
    authEmailCode.value = ''
    acceptTerms.value = false
    sendCodeLoading.value = false
    sendCodeCountdown.value = 0
    if (sendCodeTimer) {
      clearInterval(sendCodeTimer)
      sendCodeTimer = null
    }
  }

  async function loginWithGithub() {
    if (auth.loading) {
      return false
    }

    const redirectTarget = `${window.location.origin}${window.location.pathname}${window.location.search}`
    const finishGlobalLoading = startGlobalLoading()
    const popup = window.open('', '73hub-github-oauth', buildGithubPopupFeatures())
    let shouldKeepLoading = false

    try {
      const resp = await getGithubAuthorizeUrl(redirectTarget)
      if (!resp.url) {
        throw new Error('GitHub 授权地址为空')
      }

      if (popup && !popup.closed) {
        popup.location.href = resp.url
        const result = await waitForGithubPopupResult(popup)

        if (!result.oauthToken) {
          throw new Error(result.oauthError || 'GitHub 登录失败')
        }

        auth.setToken(result.oauthToken)
        showToast('GitHub 登录成功', 'success')
        return true
      }

      shouldKeepLoading = true
      window.location.href = resp.url
      return false
    } catch (err) {
      if (popup && !popup.closed) {
        popup.close()
      }

      finishGlobalLoading()
      showToast(err instanceof Error ? err.message : 'GitHub 登录失败', 'error')
      return false
    } finally {
      if (!shouldKeepLoading) {
        finishGlobalLoading()
      }
    }
  }

  async function sendAuthCode() {
    const email = authEmail.value.trim()
    if (!email) {
      showToast('请输入邮箱地址', 'error')
      return
    }
    if (sendCodeLoading.value || sendCodeCountdown.value > 0) {
      return
    }

    sendCodeLoading.value = true
    try {
      if (mode.value === 'register') {
        await auth.sendRegisterEmailCode(email)
      } else {
        await auth.sendResetPasswordEmailCode(email)
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
        await auth.login(authUsername.value.trim(), authPassword.value)
        showToast('登录成功', 'success')
        return true
      }
      if (mode.value === 'register') {
        if (!acceptTerms.value) {
          showToast('请先同意用户协议、隐私政策和支付与退款说明', 'error')
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
        await auth.registerWithEmail(
          authUsername.value.trim(),
          authPassword.value,
          authEmail.value.trim(),
          authEmailCode.value.trim(),
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
  }

  return {
    authUsername,
    authPassword,
    authEmail,
    authEmailCode,
    acceptTerms,
    sendCodeLoading,
    sendCodeCountdown,
    resetAuthForm,
    loginWithGithub,
    sendAuthCode,
    submitAuth,
    changeAuthMode,
  }
}
