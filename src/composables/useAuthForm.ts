import type { Ref } from 'vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { getGithubAuthorizeUrl } from '@/api/auth'

type AuthMode = 'login' | 'register' | 'reset'

export function useAuthForm(mode: Ref<AuthMode>) {
  const auth = useAuthStore()
  const router = useRouter()
  const { showToast } = useToast()

  const authUsername = ref('')
  const authPassword = ref('')
  const authEmail = ref('')
  const authEmailCode = ref('')
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

  return {
    authUsername,
    authPassword,
    authEmail,
    authEmailCode,
    acceptTerms,
    loginRequiresTwoFactor,
    sendCodeLoading,
    sendCodeCountdown,
    githubLoading,
    resetAuthForm,
    loginWithGithub,
    sendAuthCode,
    submitAuth,
    changeAuthMode,
  }
}
