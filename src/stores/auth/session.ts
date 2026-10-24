/**
 * 登录态的核心会话：令牌、持久化、刷新调度、档案拉取。
 *
 * 从 `stores/auth.ts` 拆出（行为逐行搬移）。store 只负责把这里的 `state` 与动作原样
 * 暴露出去，再拼上开发者资格校验与注册 / 登录表单动作。
 */
import { computed, ref } from 'vue'

import {
  authRequest,
  type AuthPayload,
  isTwoFactorRequiredPayload,
  refreshToken as refreshTokenApi,
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
import { AUTH_TOKEN_STORAGE_KEY, clearObsoleteAuthTokenStorage } from '@/shared/auth/storage'
import { isTokenExpired } from '@/shared/auth/token'
import { createTokenRefreshController } from '@/shared/auth/tokenLifecycle'
import { isAuthRejected } from '@/stores/auth/types'

export function createAuthSession() {
  const token = ref('')
  const username = ref('')
  const role = ref('')
  const loading = ref(false)
  const profileLoaded = ref(false)
  const hydrated = ref(false)
  const profileRequest = ref<Promise<AuthProfile> | null>(null)
  const devAccessError = ref('')
  const developerAgreementSigned = ref(false)
  const apiUsageAgreementSigned = ref(false)

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

  function logout() {
    hydrated.value = true
    devAccessError.value = ''
    developerAgreementSigned.value = false
    apiUsageAgreementSigned.value = false
    resetAuthState()
    clearPersistedAuthProfile()
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    clearObsoleteAuthTokenStorage()
  }

  function setToken(newToken: string) {
    persist(newToken)
    void initializeSession(true).catch(() => undefined)
  }

  /**
   * R034：接口资源收银台用一次性票据换到的会话落到本地。
   *
   * 复用登录链路的 `applyAuthPayload` / `persist`（令牌、持久化、刷新调度都在里面），
   * 不另写一份 localStorage 逻辑。换票响应只带用户名、不带角色，随后用
   * `initializeSession(true)` 向服务端补齐角色；补齐失败不影响已经落盘的令牌。
   */
  async function applyExternalSession(payload: {
    token: string
    username?: string
  }): Promise<void> {
    const nextToken = payload.token.trim()
    if (!nextToken) {
      throw new Error('登录凭证为空')
    }

    applyAuthPayload({ token: nextToken, username: payload.username })
    try {
      await initializeSession(true)
    } catch {
      // 角色信息留待后续鉴权请求补齐，收银台首屏不因此中断。
    }
  }

  return {
    token,
    username,
    role,
    loading,
    profileLoaded,
    hydrated,
    devAccessError,
    developerAgreementSigned,
    apiUsageAgreementSigned,
    isAuthed,
    isDev,
    authHeaders,
    hydrate,
    fetchProfile,
    initializeSession,
    setToken,
    applyExternalSession,
    logout,
    applyAuthPayload,
  }
}

export type AuthSession = ReturnType<typeof createAuthSession>
