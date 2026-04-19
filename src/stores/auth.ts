import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  authRequest,
  refreshToken as refreshTokenApi,
  resetPassword,
  sendRegisterEmailCode as sendRegisterEmailCodeApi,
  sendResetPasswordEmailCode as sendResetPasswordEmailCodeApi,
} from '@/api/auth'
import { authHeaders as createAuthHeaders } from '@/api/http'

const TOKEN_KEY = 'auth_token_73hub'
const TOKEN_REFRESH_INTERVAL_MS = 1 * 60 * 1000

type AuthProfile = {
  username: string
  role: string
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const username = ref('')
  const role = ref('')
  const loading = ref(false)
  const profileLoaded = ref(false)
  const hydrated = ref(false)
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let profileRequest: Promise<AuthProfile> | null = null

  const isAuthed = computed(() => token.value.length > 0)

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
    username.value = ''
    role.value = ''
    profileLoaded.value = false
    profileRequest = null
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
      return
    }

    token.value = saved
    resetProfile()
    scheduleRefresh()
  }

  function persist(newToken: string, preserveProfile = false) {
    token.value = newToken
    if (!preserveProfile) {
      resetProfile()
    }
    localStorage.setItem(TOKEN_KEY, newToken)
    scheduleRefresh()
  }

  async function fetchProfile(force = false): Promise<AuthProfile> {
    if (!token.value) {
      throw new Error('未登录')
    }

    if (profileLoaded.value && !force) {
      return {
        username: username.value,
        role: role.value,
      }
    }

    if (profileRequest && !force) {
      return profileRequest
    }

    const request = (async () => {
      const resp = await fetch('/auth/me', {
        method: 'GET',
        headers: authHeaders(),
      })

      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || '加载当前用户信息失败')
      }

      const payload = (await resp.json()) as AuthProfile
      username.value = payload.username
      role.value = payload.role
      profileLoaded.value = true
      return payload
    })()

    profileRequest = request

    try {
      return await request
    } finally {
      if (profileRequest === request) {
        profileRequest = null
      }
    }
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
      persist(payload.token)
      await initializeSession(true)
    } finally {
      loading.value = false
    }
  }

  async function register(usernameInput: string, passwordInput: string) {
    loading.value = true
    try {
      const payload = await authRequest('/auth/register', usernameInput, passwordInput)
      persist(payload.token)
      await initializeSession(true)
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
      persist(payload.token)
      await initializeSession(true)
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
      persist(payload.token)
      await initializeSession(true)
    } finally {
      loading.value = false
    }
  }

  function logout() {
    clearRefreshTimer()
    hydrated.value = true
    token.value = ''
    resetProfile()
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
