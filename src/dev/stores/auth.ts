import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  authRequest,
  refreshToken,
  requestDevRole,
  resetPassword,
  sendRegisterEmailCode,
  sendResetPasswordEmailCode,
  type AuthPayload,
  isTwoFactorRequiredPayload,
} from '@dev/api/auth'
import { HttpError, authHeaders as createAuthHeaders } from '@dev/api/http'
import {
  applyAuthPayloadToState,
  clearPersistedAuthProfile,
  fetchAuthProfile,
  resetAuthProfileState,
  restorePersistedAuthProfile,
  type AuthProfile,
} from '@/shared/auth/session'
import {
  getTokenExpMs,
  isTokenExpired,
  MIN_REFRESH_DELAY_MS,
  REFRESH_BEFORE_EXPIRY_MS,
  RETRY_AFTER_FAILURE_MS,
} from '@/shared/auth/token'
import { createTokenRefreshController } from '@/shared/auth/tokenLifecycle'

const TOKEN_KEY = 'auth_token_73hub'
const LEGACY_TOKEN_KEY = 'dev_auth_token_73hub'

export type LoginResult = {
  requiresTwoFactor: boolean
  username?: string
}

export const useAuthStore = defineStore('dev-auth', () => {
  const token = ref('')
  const username = ref('')
  const role = ref('')
  const loading = ref(false)
  const devAccessError = ref('')
  const profileLoaded = ref(false)
  const hydrated = ref(false)
  const profileRequest = ref<Promise<AuthProfile> | null>(null)

  const isAuthed = computed(() => token.value.length > 0)
  const isDev = computed(() => role.value === 'dev' || role.value === 'super_admin')
  const profileState = {
    username,
    role,
    profileLoaded,
    profileRequest,
  }

  const tokenLifecycle = createTokenRefreshController({
    getToken: () => token.value,
    refreshToken,
    applyRefreshedToken: (payload) => persist(payload.token, true),
    logout,
    retryOnVisibilityFailure: false,
  })

  function authHeaders(headers: HeadersInit = {}) {
    return createAuthHeaders(token.value, headers)
  }

  function resetAuthState() {
    tokenLifecycle.dispose()
    token.value = ''
    username.value = ''
    role.value = ''
    resetAuthProfileState(profileState)
  }

  function hydrate(force = false) {
    if (hydrated.value && !force) {
      return
    }

    hydrated.value = true
    const saved = localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY)
    if (!saved) {
      resetAuthState()
      clearPersistedAuthProfile()
      return
    }

    localStorage.setItem(TOKEN_KEY, saved)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
    token.value = saved
    resetAuthProfileState(profileState)
    restorePersistedAuthProfile(profileState)
    tokenLifecycle.schedule(saved)
    tokenLifecycle.setupVisibility()
  }

  function persist(newToken: string, preserveProfile = false) {
    token.value = newToken
    if (!preserveProfile) {
      resetAuthProfileState(profileState)
      clearPersistedAuthProfile()
    } else if (profileLoaded.value) {
      applyAuthPayloadToState(
        profileState,
        { token: newToken, username: username.value, role: role.value },
        (nextToken) => {
          token.value = nextToken
          localStorage.setItem(TOKEN_KEY, nextToken)
          localStorage.setItem(LEGACY_TOKEN_KEY, nextToken)
          tokenLifecycle.schedule(nextToken)
          tokenLifecycle.setupVisibility()
        },
        true,
      )
      return
    }
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(LEGACY_TOKEN_KEY, newToken)
    tokenLifecycle.schedule(newToken)
    tokenLifecycle.setupVisibility()
  }

  function applyAuthPayload(payload: AuthPayload, preserveProfile = false) {
    applyAuthPayloadToState(profileState, payload, persist, preserveProfile)
  }

  async function fetchProfile(force = false): Promise<AuthProfile> {
    return fetchAuthProfile({
      token: token.value,
      force,
      state: profileState,
      loadProfile: async () => {
        const payload = await refreshToken(token.value)
        persist(payload.token, true)

        if (payload.username && payload.role) {
          return {
            username: payload.username,
            role: payload.role,
          }
        }

        throw new Error('加载当前用户信息失败：刷新接口未返回完整会话信息')
      },
    })
  }

  async function initializeSession(force = false): Promise<AuthProfile | null> {
    hydrate()
    if (!token.value) {
      return null
    }

    try {
      return await fetchProfile(force)
    } catch (error) {
      logout()
      throw error
    }
  }

  async function ensureDevAccess(): Promise<boolean> {
    devAccessError.value = ''
    if (!token.value) {
      return false
    }

    if (!profileLoaded.value) {
      await fetchProfile()
    }

    if (!isDev.value) {
      try {
        await requestDevRole(token.value)
        await fetchProfile(true)
      } catch (error) {
        devAccessError.value = error instanceof Error ? error.message : '开发者权限申请失败'
        if (error instanceof HttpError && error.status === 403) {
          return false
        }
      }
    }

    return isDev.value
  }

  function setToken(newToken: string) {
    persist(newToken)
    void initializeSession(true).catch(() => {
      logout()
    })
  }

  async function login(
    usernameInput: string,
    passwordInput: string,
    twoFactorCode?: string,
  ): Promise<LoginResult> {
    loading.value = true
    try {
      const payload = await authRequest(
        '/auth/login',
        usernameInput,
        passwordInput,
        undefined,
        undefined,
        false,
        twoFactorCode,
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
      const payload = await authRequest(
        '/auth/register',
        usernameInput,
        passwordInput,
        undefined,
        undefined,
        false,
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

  async function sendRegisterEmailCodeAction(email: string) {
    await sendRegisterEmailCode(email)
  }

  async function sendResetPasswordEmailCodeAction(email: string) {
    await sendResetPasswordEmailCode(email)
  }

  async function resetPasswordWithEmail(
    emailInput: string,
    passwordInput: string,
    emailCodeInput: string,
  ) {
    loading.value = true
    try {
      const payload = await resetPassword(emailInput, passwordInput, emailCodeInput)
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
  ) {
    loading.value = true
    try {
      const payload = await authRequest(
        '/auth/register',
        usernameInput,
        passwordInput,
        emailInput,
        emailCodeInput,
        false,
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

  function logout() {
    hydrated.value = true
    resetAuthState()
    clearPersistedAuthProfile()
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  }

  return {
    token,
    username,
    role,
    loading,
    devAccessError,
    profileLoaded,
    hydrated,
    isAuthed,
    isDev,
    authHeaders,
    hydrate,
    initializeSession,
    setToken,
    fetchProfile,
    ensureDevAccess,
    login,
    register,
    sendRegisterEmailCode: sendRegisterEmailCodeAction,
    sendResetPasswordEmailCode: sendResetPasswordEmailCodeAction,
    resetPasswordWithEmail,
    registerWithEmail,
    logout,
  }
})
