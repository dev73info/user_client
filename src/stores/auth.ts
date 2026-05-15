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

export type LoginResult = {
  requiresTwoFactor: boolean
  username?: string
}

const TOKEN_KEY = 'auth_token_73hub'
const REFRESH_BEFORE_EXPIRY_MS = 2 * 60 * 1000
const MIN_REFRESH_DELAY_MS = 15_000
const RETRY_AFTER_FAILURE_MS = 30_000

function getTokenExpMs(jwt: string): number {
  try {
    const payload = jwt.split('.')[1]
    if (!payload) return NaN
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const json = JSON.parse(atob(padded)) as { exp?: unknown }
    return typeof json.exp === 'number' ? json.exp * 1000 : NaN
  } catch {
    return NaN
  }
}

function isTokenExpired(jwt: string): boolean {
  const exp = getTokenExpMs(jwt)
  return Number.isFinite(exp) && Date.now() >= exp
}

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
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  const profileRequest = ref<Promise<AuthProfile> | null>(null)
  let visibilityHandler: (() => void) | null = null

  const isAuthed = computed(() => token.value.length > 0)
  const profileState = {
    username,
    role,
    profileLoaded,
    profileRequest,
  }

  function authHeaders(headers: HeadersInit = {}) {
    return createAuthHeaders(token.value, headers)
  }

  function clearRefreshTimer() {
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  function scheduleRefresh(currentToken?: string) {
    clearRefreshTimer()
    const jwt = currentToken ?? token.value
    if (!jwt) return

    const expMs = getTokenExpMs(jwt)
    const delay = Number.isFinite(expMs)
      ? Math.max(MIN_REFRESH_DELAY_MS, expMs - Date.now() - REFRESH_BEFORE_EXPIRY_MS)
      : 5 * 60 * 1000

    refreshTimer = setTimeout(async () => {
      if (!token.value) return
      try {
        const resp = await refreshTokenApi(token.value)
        persist(resp.token, true)
      } catch (error) {
        if (isTokenExpired(token.value) || isAuthRejected(error)) {
          logout()
          return
        }

        refreshTimer = setTimeout(() => scheduleRefresh(), RETRY_AFTER_FAILURE_MS)
      }
    }, delay)
  }

  function setupVisibilityRefresh() {
    if (visibilityHandler || typeof document === 'undefined') return

    visibilityHandler = () => {
      if (document.visibilityState !== 'visible' || !token.value) return

      const expMs = getTokenExpMs(token.value)
      if (isTokenExpired(token.value)) {
        logout()
        return
      }

      if (Number.isFinite(expMs) && expMs - Date.now() < REFRESH_BEFORE_EXPIRY_MS + 60_000) {
        clearRefreshTimer()
        void refreshTokenApi(token.value)
          .then((resp) => {
            persist(resp.token, true)
          })
          .catch((error) => {
            if (isTokenExpired(token.value) || isAuthRejected(error)) {
              logout()
            } else {
              scheduleRefresh()
            }
          })
      }
    }

    document.addEventListener('visibilitychange', visibilityHandler)
  }

  function resetProfile() {
    resetAuthProfileState(profileState)
  }

  function resetAuthState() {
    clearRefreshTimer()
    if (visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
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
    scheduleRefresh(saved)
    setupVisibilityRefresh()
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
          scheduleRefresh(nextToken)
          setupVisibilityRefresh()
        },
        true,
      )
      return
    }
    localStorage.setItem(TOKEN_KEY, newToken)
    scheduleRefresh(newToken)
    setupVisibilityRefresh()
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
      return await fetchProfile(force)
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
