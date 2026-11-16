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
  getPrivileges,
  isTwoFactorRequiredPayload,
  refreshSession as refreshSessionApi,
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
import {
  clearSessionTokens,
  createRetryRefresher,
  createSessionTokenExchanger,
  restoreSessionTokens,
  setStoredRefreshToken,
  storeSessionTokens,
  type SessionTokenState,
} from '@/shared/auth/sessionTokens'
import { setSessionRefreshHandler } from '@/shared/auth/sessionRefresh'
import { isTokenExpired } from '@/shared/auth/token'
import { createTokenRefreshController } from '@/shared/auth/tokenLifecycle'
import { isAuthRejected } from '@/stores/auth/types'

export function createAuthSession() {
  const token = ref('')
  const refreshToken = ref('')
  const tokenState: SessionTokenState = { token, refreshToken }
  const username = ref('')
  const role = ref('')
  const loading = ref(false)
  const profileLoaded = ref(false)
  const hydrated = ref(false)
  const profileRequest = ref<Promise<AuthProfile> | null>(null)
  const devAccessError = ref('')
  const developerAgreementSigned = ref(false)
  const apiUsageAgreementSigned = ref(false)
  const permissions = ref<string[]>([])
  const privilegesLoaded = ref(false)
  const isSuperAdmin = ref(false)

  const isAuthed = computed(() => token.value.length > 0)
  const isDev = computed(() => isSuperAdmin.value || permissions.value.includes('scope.dev.access'))
  const profileState = {
    username,
    role,
    profileLoaded,
    profileRequest,
  }

  const tokenLifecycle = createTokenRefreshController({
    getToken: () => token.value,
    getRefreshToken: () => refreshToken.value,
    refreshToken: refreshTokenApi,
    refreshSession: refreshSessionApi,
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
  function hasPermission(permission: string): boolean {
    return isSuperAdmin.value || permissions.value.includes(permission)
  }
  function resetProfile() {
    resetAuthProfileState(profileState)
    permissions.value = []
    privilegesLoaded.value = false
    isSuperAdmin.value = false
  }

  function resetAuthState() {
    tokenLifecycle.dispose()
    token.value = ''
    refreshToken.value = ''
    resetProfile()
  }
  function hydrate(force = false) {
    if (hydrated.value && !force) {
      return
    }

    hydrated.value = true
    if (!restoreSessionTokens(tokenState)) {
      resetAuthState()
      clearPersistedAuthProfile()
      return
    }

    resetProfile()
    restorePersistedAuthProfile(profileState)
    tokenLifecycle.schedule(token.value)
    tokenLifecycle.setupVisibility()
  }

  function persist(newToken: string, preserveProfile = false, nextRefreshToken?: string) {
    storeSessionTokens(tokenState, newToken, nextRefreshToken)
    if (!preserveProfile) {
      resetProfile()
      clearPersistedAuthProfile()
    } else if (profileLoaded.value) {
      applyAuthPayloadToState(
        profileState,
        { token: newToken, username: username.value, role: role.value },
        (nextToken) => {
          storeSessionTokens(tokenState, nextToken)
          tokenLifecycle.schedule(nextToken)
          tokenLifecycle.setupVisibility()
        },
        true,
      )
      return
    }
    tokenLifecycle.schedule(newToken)
    tokenLifecycle.setupVisibility()
  }

  function applyAuthPayload(payload: AuthPayload, preserveProfile = false) {
    // 新登录的响应没有刷新令牌（旧后端）时清掉上一份，避免留下无法使用的旧凭证；
    // 续期场景没有新刷新令牌则保留原值。
    const nextRefreshToken = payload.refresh_token ?? (preserveProfile ? undefined : '')
    applyAuthPayloadToState(
      profileState,
      payload,
      (newToken, keepProfile) => persist(newToken, keepProfile, nextRefreshToken),
      preserveProfile,
    )
  }

  /**
   * 拉取当前登录人的**生效**权限码；`permissions` 是最终结果，前端一律按它判断。
   * 请求失败原样抛出：权限拿不到就当作没有，绝不放行。
   */
  async function fetchPrivileges(): Promise<void> {
    const sourceToken = token.value
    if (!sourceToken) {
      resetProfile()
      return
    }

    const payload = await getPrivileges(sourceToken)
    if (token.value !== sourceToken) {
      throw new Error('会话已更新')
    }
    permissions.value = payload.permissions
    isSuperAdmin.value = payload.is_super_admin
    // 角色以服务端为准：角色被收回 / 补授后，刷新即生效，不用重新登录。
    if (payload.role) {
      role.value = payload.role
    }
    privilegesLoaded.value = true
  }

  const exchangeSessionTokens = createSessionTokenExchanger({
    getToken: () => token.value,
    getRefreshToken: () => refreshToken.value,
    refreshToken: refreshTokenApi,
    refreshSession: refreshSessionApi,
    isAuthRejected,
  })
  const persistRefreshed = (nextToken: string, nextRefreshToken?: string) =>
    persist(nextToken, true, nextRefreshToken)
  setSessionRefreshHandler(createRetryRefresher(exchangeSessionTokens, persistRefreshed))

  async function fetchProfile(force = false): Promise<AuthProfile> {
    return fetchAuthProfile({
      token: token.value,
      force,
      state: profileState,
      loadProfile: async () => {
        const sourceToken = token.value
        const payload = await exchangeSessionTokens()
        if (token.value !== sourceToken) {
          throw new Error('会话已更新')
        }
        persist(payload.token, true, payload.refresh_token)
        await fetchPrivileges()

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
    clearSessionTokens(tokenState)
  }

  function setToken(newToken: string) {
    // 外部登录拿到的是新账号的令牌：先清掉上一份刷新令牌，避免随后用旧刷新令牌把账号换回去。
    persist(newToken, false, '')
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
    refreshToken,
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
    permissions,
    privilegesLoaded,
    isSuperAdmin,
    hasPermission,
    authHeaders,
    hydrate,
    fetchProfile,
    fetchPrivileges,
    initializeSession,
    setToken,
    setRefreshToken: (value: string) => setStoredRefreshToken(tokenState, value),
    applyExternalSession,
    logout,
    applyAuthPayload,
  }
}

export type AuthSession = ReturnType<typeof createAuthSession>
