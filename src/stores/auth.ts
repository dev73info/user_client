import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

type AuthPayload = {
  token: string
}

const TOKEN_KEY = 'auth_token_73hub'

function parseJwtSubject(token: string): string {
  const parts = token.split('.')
  const payloadPart = parts[1]
  if (!payloadPart) {
    return ''
  }

  try {
    const payload = JSON.parse(atob(payloadPart)) as { sub?: string }
    return payload.sub ?? ''
  } catch {
    return ''
  }
}

async function authRequest(
  path: '/auth/login' | '/auth/register',
  username: string,
  password: string,
) {
  const resp = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(text || '请求失败')
  }

  return (await resp.json()) as AuthPayload
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
    token.value = saved
    username.value = parseJwtSubject(saved)
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

  function logout() {
    token.value = ''
    username.value = ''
    localStorage.removeItem(TOKEN_KEY)
  }

  return {
    token,
    username,
    loading,
    isAuthed,
    hydrate,
    login,
    register,
    logout,
  }
})
