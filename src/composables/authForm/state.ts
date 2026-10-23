import { ref } from 'vue'

export type AuthMode = 'login' | 'register' | 'reset'

/** 登录 / 注册 / 重置三个表单共用的输入状态与邮箱验证码倒计时。 */
export function useAuthFormState() {
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

  function clearSendCodeTimer() {
    if (sendCodeTimer) {
      clearInterval(sendCodeTimer)
      sendCodeTimer = null
    }
  }

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
    clearSendCodeTimer()
  }

  /** 发送成功后开始 60 秒倒计时；到点自行停表，重置时由 resetAuthForm 清掉。 */
  function startSendCodeCountdown() {
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
  }
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
    resetAuthForm,
    startSendCodeCountdown,
  }
}
