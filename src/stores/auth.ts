import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authRequest, sendRegisterEmailCode as sendRegisterEmailCodeApi } from '@/api/auth'

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

  const isAuthed = computed(() => token.value.length > 0)

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
  }

  function persist(newToken: string) {
    token.value = newToken
    username.value = parseJwtSubject(newToken)
    localStorage.setItem(TOKEN_KEY, newToken)
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
    registerWithEmail,
    setToken,
    logout,
  }
})
