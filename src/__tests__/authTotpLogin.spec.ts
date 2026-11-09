/**
 * 登录表单的两条 TOTP 路径：
 * - 密码登录返回 202 `delivery:"totp"` 时不提示查收邮箱，第二次提交把动态码带上；
 * - 「Authenticator 免密登录」只提交登录名 + 动态码，不再要求密码。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, type Ref } from 'vue'

import { useAuthFormState } from '@/composables/authForm/state'
import type { AuthMode } from '@/composables/authForm/state'
import { useAuthSubmit } from '@/composables/authForm/submit'
import type { useAuthStore } from '@/stores/auth'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  loginWithAuthenticator: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({}) }))
vi.mock('ui_73info', () => ({
  TMessage: {
    success: mocks.success,
    error: mocks.error,
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

type AuthStoreShape = ReturnType<typeof useAuthStore>

describe('登录表单：TOTP 两步验证与免密登录', () => {
  let mode: Ref<AuthMode>
  let state: ReturnType<typeof useAuthFormState>
  let submit: ReturnType<typeof useAuthSubmit>

  beforeEach(() => {
    vi.clearAllMocks()
    mode = ref<AuthMode>('login')
    state = useAuthFormState()
    state.acceptTerms.value = true
    state.authUsername.value = 'totp_smoke'
    state.authPassword.value = 'Test@123456'
    submit = useAuthSubmit({
      mode,
      auth: {
        login: mocks.login,
        loginWithAuthenticator: mocks.loginWithAuthenticator,
      } as unknown as AuthStoreShape,
      state,
    })
  })

  it('密码登录 202 delivery=totp 时切到动态码步骤', async () => {
    mocks.login.mockResolvedValue({
      requiresTwoFactor: true,
      username: 'totp_smoke',
      delivery: 'totp',
    })

    expect(await submit.submitAuth()).toBe(false)
    expect(state.loginRequiresTwoFactor.value).toBe(true)
    expect(state.loginTwoFactorDelivery.value).toBe('totp')
    expect(mocks.success).toHaveBeenCalledWith('请输入 Authenticator 动态码')

    state.authEmailCode.value = '123456'
    mocks.login.mockResolvedValue({ requiresTwoFactor: false })
    expect(await submit.submitAuth()).toBe(true)
    expect(mocks.login).toHaveBeenLastCalledWith('totp_smoke', 'Test@123456', '123456', undefined)
  })

  it('202 delivery=email 时沿用「请查收邮箱」提示', async () => {
    mocks.login.mockResolvedValue({
      requiresTwoFactor: true,
      username: 'totp_smoke',
      delivery: 'email',
    })

    expect(await submit.submitAuth()).toBe(false)
    expect(state.loginTwoFactorDelivery.value).toBe('email')
    expect(mocks.success).toHaveBeenCalledWith('验证码已发送，请查收邮箱')
  })

  it('免密登录模式只提交登录名与动态码，6 位校验在前端拦', async () => {
    state.loginAuthenticatorMode.value = true

    state.authAuthenticatorCode.value = '123'
    expect(await submit.submitAuth()).toBe(false)
    expect(mocks.loginWithAuthenticator).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith('请输入 6 位动态码')

    state.authAuthenticatorCode.value = '654321'
    mocks.loginWithAuthenticator.mockResolvedValue({ requiresTwoFactor: false })
    expect(await submit.submitAuth()).toBe(true)
    expect(mocks.loginWithAuthenticator).toHaveBeenCalledWith('totp_smoke', '654321', undefined)
  })
})
