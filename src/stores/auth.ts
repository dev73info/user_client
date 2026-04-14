import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  authRequest,
  refreshToken as refreshTokenApi,
  resetPassword,
  sendRegisterEmailCode as sendRegisterEmailCodeApi,
  sendResetPasswordEmailCode as sendResetPasswordEmailCodeApi,
} from '@/api/auth'

const TOKEN_KEY = 'auth_token_73hub'

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  const payloadPart = parts[1]
  if (!payloadPart) {
    return null
  }

  try {
    const raw = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const padded = raw.padEnd(Math.ceil(raw.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

function parseJwtSubject(token: string): string {
  const payload = parseJwtPayload(token)
  if (!payload) {
    return ''
  }
  return typeof payload.sub === 'string' ? payload.sub : ''
}

function isJwtExpired(token: string): boolean {
  const payload = parseJwtPayload(token)
  if (!payload) {
    return true
  }
  const exp = payload.exp
  if (typeof exp !== 'number') {
    return true
  }
  return Math.floor(Date.now() / 1000) >= exp
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const username = ref('')
  const loading = ref(false)
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  const isAuthed = computed(() => token.value.length > 0)

  function clearRefreshTimer() {
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  function scheduleRefresh(jwt: string) {
    clearRefreshTimer()
    const payload = parseJwtPayload(jwt)
    if (!payload || typeof payload.exp !== 'number') return

    const nowSec = Math.floor(Date.now() / 1000)
    const expiresIn = payload.exp - nowSec
    // 在过期前 5 分钟刷新，若剩余不足 5 分钟则立即刷新
    const delayMs = Math.max((expiresIn - 300) * 1000, 0)

    refreshTimer = setTimeout(async () => {
      if (!token.value) return
      try {
        const resp = await refreshTokenApi(token.value)
        persist(resp.token)
      } catch {
        logout()
      }
    }, delayMs)
  }

  function hydrate() {
    const saved = localStorage.getItem(TOKEN_KEY)
    if (!saved) {
      return
    }

    if (isJwtExpired(saved)) {
      localStorage.removeItem(TOKEN_KEY)
      token.value = ''
      username.value = ''
      return
    }

    const subject = parseJwtSubject(saved)
    if (!subject) {
      localStorage.removeItem(TOKEN_KEY)
      token.value = ''
      username.value = ''
      return
    }

    token.value = saved
    username.value = subject
    scheduleRefresh(saved)
  }

  function persist(newToken: string) {
    token.value = newToken
    username.value = parseJwtSubject(newToken)
    localStorage.setItem(TOKEN_KEY, newToken)
    scheduleRefresh(newToken)
  }

  async function login(usernameInput: string, passwordInput: string) {
    loading.value = true
    try {
      const payload = await authRequest('/auth/login', usernameInput, passwordInput)
      persist(payload.token)
    } finally {
      loading.value = false
    }
  }

  async function register(usernameInput: string, passwordInput: string) {
    loading.value = true
    try {
      const payload = await authRequest('/auth/register', usernameInput, passwordInput)
      persist(payload.token)
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
    } finally {
      loading.value = false
    }
  }

  function logout() {
    clearRefreshTimer()
    token.value = ''
    username.value = ''
    localStorage.removeItem(TOKEN_KEY)
  }

  function setToken(newToken: string) {
    persist(newToken)
  }

  return {
    token,
    username,
    loading,
    isAuthed,
    hydrate,
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
