/**
 * 登录态的「动作面」：开发者资格校验，以及登录 / 注册 / 邮箱验证码 / 重置口令。
 *
 * 从 `stores/auth.ts` 拆出（行为逐行搬移）：这些动作都读写 `createAuthSession` 返回的
 * 同一份状态与同一组内部动作，所以以它的返回值作参数，不另建一份 ref。
 */
import {
  authRequest,
  getDevAccessStatus,
  isTwoFactorRequiredPayload,
  requestDevRole,
  resetPassword,
  sendRegisterEmailCode as sendRegisterEmailCodeApi,
  sendResetPasswordEmailCode as sendResetPasswordEmailCodeApi,
} from '@/api/auth'
import { HttpError } from '@/api/http'
import type { AuthSession } from '@/stores/auth/session'
import type { LoginResult } from '@/stores/auth/types'

export function createAuthActions(session: AuthSession) {
  const {
    token,
    role,
    loading,
    profileLoaded,
    isDev,
    devAccessError,
    developerAgreementSigned,
    apiUsageAgreementSigned,
    fetchProfile,
    initializeSession,
    applyAuthPayload,
  } = session

  async function ensureDevAccess(): Promise<boolean> {
    devAccessError.value = ''
    developerAgreementSigned.value = false
    apiUsageAgreementSigned.value = false
    if (!token.value) {
      return false
    }

    if (!profileLoaded.value) {
      await fetchProfile()
    }

    if (role.value === 'super_admin') {
      return true
    }

    try {
      // 先只读查询开发者资格与签约状态：已签约与否不影响进入工作台。
      const status = await getDevAccessStatus(token.value).catch(() => null)
      if (status) {
        developerAgreementSigned.value = status.developer_agreement_signed
        apiUsageAgreementSigned.value = status.api_usage_agreement_signed
        if (status.is_dev || status.is_super_admin) {
          return true
        }
      }

      // 尚未成为开发者：申请开发者角色（后端仅要求实名认证与成年）。
      await requestDevRole(token.value)
      if (!isDev.value) {
        await fetchProfile(true)
      }
    } catch (error) {
      devAccessError.value = error instanceof Error ? error.message : '开发者权限校验失败'
      if (error instanceof HttpError && error.status === 403) {
        return false
      }
      throw error
    }

    return isDev.value
  }

  async function login(
    usernameInput: string,
    passwordInput: string,
    twoFactorCode?: string,
    turnstileToken?: string,
  ): Promise<LoginResult> {
    loading.value = true
    try {
      const payload = await authRequest(
        '/auth/login',
        usernameInput,
        passwordInput,
        undefined,
        undefined,
        undefined,
        twoFactorCode,
        undefined,
        undefined,
        undefined,
        turnstileToken,
      )
      if (isTwoFactorRequiredPayload(payload)) {
        return {
          requiresTwoFactor: true,
          username: payload.username,
        }
      }
      applyAuthPayload(payload)
      if (!payload.username || !payload.role) {
        await initializeSession(true)
      }
      return { requiresTwoFactor: false }
    } finally {
      loading.value = false
    }
  }

  async function register(usernameInput: string, passwordInput: string) {
    loading.value = true
    try {
      const payload = await authRequest('/auth/register', usernameInput, passwordInput)
      if (isTwoFactorRequiredPayload(payload)) {
        throw new Error('注册流程不需要两步验证')
      }
      applyAuthPayload(payload)
      if (!payload.username || !payload.role) {
        await initializeSession(true)
      }
    } finally {
      loading.value = false
    }
  }

  async function sendRegisterEmailCode(email: string, turnstileToken?: string) {
    await sendRegisterEmailCodeApi(email, turnstileToken)
  }

  async function sendResetPasswordEmailCode(email: string, turnstileToken?: string) {
    await sendResetPasswordEmailCodeApi(email, turnstileToken)
  }

  async function resetPasswordWithEmail(
    emailInput: string,
    passwordInput: string,
    emailCodeInput: string,
    turnstileToken?: string,
  ) {
    loading.value = true
    try {
      const payload = await resetPassword(emailInput, passwordInput, emailCodeInput, turnstileToken)
      applyAuthPayload(payload)
      if (!payload.username || !payload.role) {
        await initializeSession(true)
      }
    } finally {
      loading.value = false
    }
  }

  async function registerWithEmail(
    usernameInput: string,
    passwordInput: string,
    emailInput: string,
    emailCodeInput: string,
    inviteCodeInput?: string,
    shareTypeInput?: string,
    shareTargetIdInput?: string,
    turnstileToken?: string,
  ) {
    loading.value = true
    try {
      const payload = await authRequest(
        '/auth/register',
        usernameInput,
        passwordInput,
        emailInput,
        emailCodeInput,
        undefined,
        undefined,
        inviteCodeInput?.trim() || undefined,
        shareTypeInput?.trim() || undefined,
        shareTargetIdInput?.trim() || undefined,
        turnstileToken,
      )
      if (isTwoFactorRequiredPayload(payload)) {
        throw new Error('注册流程不需要两步验证')
      }
      applyAuthPayload(payload)
      if (!payload.username || !payload.role) {
        await initializeSession(true)
      }
    } finally {
      loading.value = false
    }
  }

  return {
    ensureDevAccess,
    login,
    register,
    sendRegisterEmailCode,
    sendResetPasswordEmailCode,
    resetPasswordWithEmail,
    registerWithEmail,
  }
}
