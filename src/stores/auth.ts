import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  authRequest,
  type AuthPayload,
  refreshToken as refreshTokenApi,
  resetPassword,
  sendRegisterEmailCode as sendRegisterEmailCodeApi,
  sendResetPasswordEmailCode as sendResetPasswordEmailCodeApi,
} from '@/api/auth'
import { authHeaders as createAuthHeaders } from '@/api/http'
import {
  applyAuthPayloadToState,
  clearPersistedAuthProfile,
  fetchAuthProfile,
  resetAuthProfileState,
  restorePersistedAuthProfile,
  type AuthProfile,
} from '@/shared/auth/session'

const TOKEN_KEY = 'auth_token_73hub'
const TOKEN_REFRESH_INTERVAL_MS = 5 * 60 * 1000

export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const username = ref('')
  const role = ref('')
  const loading = ref(false)
  const profileLoaded = ref(false)
  const hydrated = ref(false)
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  const profileRequest = ref<Promise<AuthProfile> | null>(null)

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

  function scheduleRefresh() {
    clearRefreshTimer()

    refreshTimer = setTimeout(async () => {
      if (!token.value) return
      try {
        const resp = await refreshTokenApi(token.value)
        persist(resp.token, true)
      } catch {
        logout()
      }
    }, TOKEN_REFRESH_INTERVAL_MS)
  }

  function resetProfile() {
    resetAuthProfileState(profileState)
  }

  function hydrate(force = false) {
    if (hydrated.value && !force) {
      return
    }

    hydrated.value = true
    const saved = localStorage.getItem(TOKEN_KEY)
    if (!saved) {
      token.value = ''
      resetProfile()
      clearPersistedAuthProfile()
      return
    }

    token.value = saved
    resetProfile()
    restorePersistedAuthProfile(profileState)
    scheduleRefresh()
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
          scheduleRefresh()
        },
        true,
      )
      return
    }
    localStorage.setItem(TOKEN_KEY, newToken)
    scheduleRefresh()
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
      logout()
      throw error
    }
  }

  async function login(usernameInput: string, passwordInput: string) {
    loading.value = true
    try {
      const payload = await authRequest('/auth/login', usernameInput, passwordInput)
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
      const payload = await authRequest('/auth/register', usernameInput, passwordInput)
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
  ) {
    loading.value = true
    try {
      const payload = await authRequest(
        '/auth/register',
        usernameInput,
        passwordInput,
        emailInput,
        emailCodeInput,
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
    clearRefreshTimer()
    hydrated.value = true
    token.value = ''
    resetProfile()
    clearPersistedAuthProfile()
    localStorage.removeItem(TOKEN_KEY)
  }

  function setToken(newToken: string) {
    persist(newToken)
    void initializeSession(true).catch(() => {
      logout()
    })
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
