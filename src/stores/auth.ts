import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  authRequest,
  type AuthPayload,
  getDevAccessStatus,
  isTwoFactorRequiredPayload,
  refreshToken as refreshTokenApi,
  requestDevRole,
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
  AUTH_TOKEN_STORAGE_KEY,
  clearObsoleteAuthTokenStorage,
} from '@/shared/auth/storage'
import {
  isTokenExpired,
} from '@/shared/auth/token'
import { createTokenRefreshController } from '@/shared/auth/tokenLifecycle'

export type LoginResult = {
  requiresTwoFactor: boolean
  username?: string
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
  const profileRequest = ref<Promise<AuthProfile> | null>(null)
  const devAccessError = ref('')
  const developerAgreementSigned = ref(false)

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
    refreshToken: refreshTokenApi,
    applyRefreshedToken: (payload, sourceToken) => {
      if (token.value === sourceToken) {
        applyAuthPayload(payload, true)
      }
    },
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
    clearObsoleteAuthTokenStorage()
    const saved = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
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
          localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, nextToken)
          clearObsoleteAuthTokenStorage()
          tokenLifecycle.schedule(nextToken)
          tokenLifecycle.setupVisibility()
        },
        true,
      )
      return
    }
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, newToken)
    clearObsoleteAuthTokenStorage()
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
        const sourceToken = token.value
        const payload = await refreshTokenApi(sourceToken)
        if (token.value !== sourceToken) {
          throw new Error('会话已更新')
        }
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
      return await fetchProfile(force)
    } catch (error) {
      if (isTokenExpired(token.value) || isAuthRejected(error)) {
        logout()
      }
      throw error
    }
  }

  async function ensureDevAccess(): Promise<boolean> {
    devAccessError.value = ''
    developerAgreementSigned.value = false
    if (!token.value) {
      return false
    }

    if (!profileLoaded.value) {
      await fetchProfile()
    }

    if (role.value === 'super_admin') {
      return true
    }

    try {
      // 先只读查询开发者资格与签约状态：已签约与否不影响进入工作台。
      const status = await getDevAccessStatus(token.value).catch(() => null)
      if (status) {
        developerAgreementSigned.value = status.developer_agreement_signed
        if (status.is_dev || status.is_super_admin) {
          return true
        }
      }

      // 尚未成为开发者：申请开发者角色（后端仅要求实名认证与成年）。
      await requestDevRole(token.value)
      if (!isDev.value) {
        await fetchProfile(true)
      }
    } catch (error) {
      devAccessError.value = error instanceof Error ? error.message : '开发者权限校验失败'
      if (error instanceof HttpError && error.status === 403) {
        return false
      }
      throw error
    }

    return isDev.value
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
    devAccessError.value = ''
    developerAgreementSigned.value = false
    resetAuthState()
    clearPersistedAuthProfile()
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    clearObsoleteAuthTokenStorage()
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
    isDev,
    devAccessError,
    developerAgreementSigned,
    authHeaders,
    hydrate,
    fetchProfile,
    initializeSession,
    ensureDevAccess,
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
