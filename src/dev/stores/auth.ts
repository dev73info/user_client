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

const TOKEN_KEY = 'auth_token_73hub'
const LEGACY_TOKEN_KEY = 'dev_auth_token_73hub'
// 提前多少毫秒刷新 token
const REFRESH_BEFORE_EXPIRY_MS = 2 * 60 * 1000
// 最短到15秒后刷新（防止立即刷新死循环）
const MIN_REFRESH_DELAY_MS = 15_000
// 刷新失败重试间隔
const RETRY_AFTER_FAILURE_MS = 30_000

/** 解析 JWT payload 中的 exp（秒），不验证签名 */
function getTokenExpMs(jwt: string): number {
  try {
    const payload = jwt.split('.')[1]
    if (!payload) return NaN
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json.exp === 'number' ? json.exp * 1000 : NaN
  } catch {
    return NaN
  }
}

/** token 是否已经过期 */
function isTokenExpired(jwt: string): boolean {
  const exp = getTokenExpMs(jwt)
  return Number.isFinite(exp) && Date.now() >= exp
}

export const useAuthStore = defineStore('dev-auth', () => {
  const token = ref('')
  const username = ref('')
  const role = ref('')
  const loading = ref(false)
  const devAccessError = ref('')
  const profileLoaded = ref(false)
  const hydrated = ref(false)
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  const profileRequest = ref<Promise<AuthProfile> | null>(null)
  let visibilityHandler: (() => void) | null = null

  const isAuthed = computed(() => token.value.length > 0)
  const isDev = computed(() => role.value === 'dev' || role.value === 'super_admin')
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

  /** 根据 token 自身的 exp 计算延迟，在过期前 2 分钟刷新 */
  function scheduleRefresh(currentToken?: string) {
    clearRefreshTimer()
    const jwt = currentToken ?? token.value
    if (!jwt) return

    const expMs = getTokenExpMs(jwt)
    let delay: number
    if (Number.isFinite(expMs)) {
      delay = Math.max(MIN_REFRESH_DELAY_MS, expMs - Date.now() - REFRESH_BEFORE_EXPIRY_MS)
    } else {
      // 无法解析 exp，默认 5 分钟
      delay = 5 * 60 * 1000
    }

    refreshTimer = setTimeout(async () => {
      if (!token.value) return
      try {
        const resp = await refreshToken(token.value)
        persist(resp.token, true)
      } catch {
        // 刻意已过期才 logout，短暂网络错误则重试
        if (isTokenExpired(token.value)) {
          logout()
        } else {
          // 网络临时出错，稍后重试
          refreshTimer = setTimeout(() => scheduleRefresh(), RETRY_AFTER_FAILURE_MS)
        }
      }
    }, delay)
  }

  function setupVisibilityRefresh() {
    if (visibilityHandler) return // 已经注册过
    visibilityHandler = () => {
      if (document.visibilityState !== 'visible' || !token.value) return
      const expMs = getTokenExpMs(token.value)
      // 标签页重新可见时：如果已过期就 logout，即将过期就立即刷新
      if (isTokenExpired(token.value)) {
        logout()
        return
      }
      if (Number.isFinite(expMs) && expMs - Date.now() < REFRESH_BEFORE_EXPIRY_MS + 60_000) {
        clearRefreshTimer()
        void refreshToken(token.value)
          .then((resp) => {
            persist(resp.token, true)
          })
          .catch(() => {
            if (isTokenExpired(token.value)) logout()
          })
      }
    }
    document.addEventListener('visibilitychange', visibilityHandler)
  }

  function resetAuthState() {
    clearRefreshTimer()
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
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
    scheduleRefresh(saved)
    setupVisibilityRefresh()
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
          scheduleRefresh(nextToken)
          setupVisibilityRefresh()
        },
        true,
      )
      return
    }
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(LEGACY_TOKEN_KEY, newToken)
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

  async function login(usernameInput: string, passwordInput: string) {
    loading.value = true
    try {
      const payload = await authRequest(
        '/auth/login',
        usernameInput,
        passwordInput,
        undefined,
        undefined,
        false,
      )
      applyAuthPayload(payload)
      if (!payload.username || !payload.role) {
        await initializeSession(true)
      }
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
