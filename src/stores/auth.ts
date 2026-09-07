import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  authRequest,
  type AuthPayload,
  isTwoFactorRequiredPayload,
  refreshToken as refreshTokenApi,
  resetPassword,
  sendRegisterEmailCode as sendRegisterEmailCodeApi,
  sendResetPasswordEmailCode as sendResetPasswordEmailCodeApi,
} from '@/api/auth'
import { HttpError, authHeaders as createAuthHeaders } from '@/api/http'
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

export type LoginResult = {
  requiresTwoFactor: boolean
  username?: string
}

const TOKEN_KEY = 'auth_token_73hub'

function isAuthRejected(error: unknown): boolean {
  return error instanceof HttpError && (error.status === 401 || error.status === 403)
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const username = ref('')
  const role = ref('')
  const loading = ref(false)
  const profileLoaded = ref(false)
  const hydrated = ref(false)
  const profileRequest = ref<Promise<AuthProfile> | null>(null)

  const isAuthed = computed(() => token.value.length > 0)
  const profileState = {
    username,
    role,
    profileLoaded,
    profileRequest,
  }

  const tokenLifecycle = createTokenRefreshController({
    getToken: () => token.value,
    refreshToken: refreshTokenApi,
    applyRefreshedToken: (payload) => applyAuthPayload(payload, true),
    logout,
    isAuthRejected,
  })

  function authHeaders(headers: HeadersInit = {}) {
    return createAuthHeaders(token.value, headers)
  }

  function resetProfile() {
    resetAuthProfileState(profileState)
  }

  function resetAuthState() {
    tokenLifecycle.dispose()
    token.value = ''
    resetProfile()
  }

  function hydrate(force = false) {
    if (hydrated.value && !force) {
      return
    }

    hydrated.value = true
    const saved = localStorage.getItem(TOKEN_KEY)
    if (!saved) {
      resetAuthState()
      clearPersistedAuthProfile()
      return
    }

    token.value = saved
    resetProfile()
    restorePersistedAuthProfile(profileState)
    tokenLifecycle.schedule(saved)
    tokenLifecycle.setupVisibility()
  }

  function persist(newToken: string, preserveProfile = false) {
    token.value = newToken
    if (!preserveProfile) {
      resetProfile()
      clearPersistedAuthProfile()
    } else if (profileLoaded.value) {
      applyAuthPayloadToState(
        profileState,
        { token: newToken, username: username.value, role: role.value },
        (nextToken) => {
          token.value = nextToken
          localStorage.setItem(TOKEN_KEY, nextToken)
          tokenLifecycle.schedule(nextToken)
          tokenLifecycle.setupVisibility()
        },
        true,
      )
      return
    }
    localStorage.setItem(TOKEN_KEY, newToken)
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
        const payload = await refreshTokenApi(token.value)
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
      // 始终向服务端校验最新角色，避免复用本地持久化的过期角色（例如开发者权限已被收回）。
      return await fetchProfile(true)
    } catch (error) {
      if (isTokenExpired(token.value) || isAuthRejected(error)) {
        logout()
      }
      throw error
    }
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
        undefined,
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

  async function sendRegisterEmailCode(email: string) {
    await sendRegisterEmailCodeApi(email)
  }

  async function sendResetPasswordEmailCode(email: string) {
    await sendResetPasswordEmailCodeApi(email)
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
    inviteCodeInput?: string,
    shareTypeInput?: string,
    shareTargetIdInput?: string,
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
  }

  function setToken(newToken: string) {
    persist(newToken)
    void initializeSession(true).catch(() => undefined)
  }

  return {
    token,
    username,
    role,
    loading,
    profileLoaded,
    hydrated,
    isAuthed,
    authHeaders,
    hydrate,
    fetchProfile,
    initializeSession,
    login,
    register,
    sendRegisterEmailCode,
    sendResetPasswordEmailCode,
    resetPasswordWithEmail,
    registerWithEmail,
    setToken,
    logout,
  }
})
