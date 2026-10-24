import type { Ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

import type { AuthMode, useAuthFormState } from './state'

type AuthStore = ReturnType<typeof useAuthStore>
type AuthFormState = ReturnType<typeof useAuthFormState>

/** 邮箱验证码的发送与倒计时，以及登录 / 注册 / 重置三个模式各自的校验与提交。 */
export function useAuthSubmit({
  mode,
  auth,
  state,
}: {
  mode: Ref<AuthMode>
  auth: AuthStore
  state: AuthFormState
}) {
  const {
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
    startSendCodeCountdown,
  } = state

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
          TMessage.error('请先输入用户名和密码')
          return
        }
        const result = await auth.login(
          username,
          password,
          undefined,
          authTurnstileToken.value || undefined,
        )
        if (!result.requiresTwoFactor) {
          TMessage.success('登录成功')
          return
        }
      } else {
        const email = authEmail.value.trim()
        if (!email) {
          TMessage.error('请输入邮箱地址')
          return
        }
        if (mode.value === 'register') {
          await auth.sendRegisterEmailCode(email, authTurnstileToken.value || undefined)
        } else {
          await auth.sendResetPasswordEmailCode(email, authTurnstileToken.value || undefined)
        }
      }
      TMessage.success('验证码已发送，请查收邮箱')
      startSendCodeCountdown()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '发送验证码失败')
    } finally {
      sendCodeLoading.value = false
    }
  }

  async function submitAuth() {
    try {
      if (mode.value === 'login') {
        if (!acceptTerms.value) {
          TMessage.error('请先同意用户协议、隐私政策和支付与退款说明')
          return false
        }
        const username = authUsername.value.trim()
        const password = authPassword.value
        const twoFactorCode = authEmailCode.value.trim()
        if (!username) {
          TMessage.error('请输入用户名或邮箱')
          return false
        }
        if (!password) {
          TMessage.error('请输入密码')
          return false
        }
        if (loginRequiresTwoFactor.value && twoFactorCode.length !== 6) {
          TMessage.error('请输入 6 位邮箱验证码')
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
          TMessage.success('验证码已发送，请查收邮箱')
          return false
        }
        loginRequiresTwoFactor.value = false
        TMessage.success('登录成功')
        return true
      }
      if (mode.value === 'register') {
        if (!acceptTerms.value) {
          TMessage.error('请先同意用户协议、隐私政策和支付与退款说明')
          return false
        }
        const username = authUsername.value.trim()
        const password = authPassword.value
        if (!username) {
          TMessage.error('请输入用户名')
          return false
        }
        if (!authEmail.value.trim()) {
          TMessage.error('邮箱不能为空')
          return false
        }
        if (authEmailCode.value.trim().length !== 6) {
          TMessage.error('请输入 6 位邮箱验证码')
          return false
        }
        if (!password) {
          TMessage.error('请输入密码')
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
        TMessage.success('注册成功')
        return true
      }
      if (mode.value === 'reset') {
        if (!authEmail.value.trim()) {
          TMessage.error('邮箱不能为空')
          return false
        }
        if (authEmailCode.value.trim().length !== 6) {
          TMessage.error('请输入 6 位邮箱验证码')
          return false
        }
        if (!authPassword.value) {
          TMessage.error('请输入新密码')
          return false
        }
        await auth.resetPasswordWithEmail(
          authEmail.value.trim(),
          authPassword.value,
          authEmailCode.value.trim(),
          authTurnstileToken.value || undefined,
        )
        TMessage.success('密码已重置，已自动登录')
        return true
      }
      return false
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '操作失败')
      return false
    }
  }

  return {
    sendAuthCode,
    submitAuth,
  }
}
