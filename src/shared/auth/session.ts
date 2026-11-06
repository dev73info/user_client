import type { Ref } from 'vue'

import type { AuthPayload } from '@/shared/auth/client'

export type AuthProfile = {
  username: string
  role: string
}
const AUTH_PROFILE_STORAGE_KEY = 'auth_profile_73hub'

type AuthProfileState = {
  username: Ref<string>
  role: Ref<string>
  profileLoaded: Ref<boolean>
  profileRequest: Ref<Promise<AuthProfile> | null>
}

type FetchProfileOptions = {
  token: string
  force?: boolean
  state: AuthProfileState
  loadProfile: () => Promise<AuthProfile>
}

export function resetAuthProfileState(state: AuthProfileState, afterReset?: () => void): void {
  state.username.value = ''
  state.role.value = ''
  state.profileLoaded.value = false
  state.profileRequest.value = null
  afterReset?.()
}
function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function readPersistedAuthProfile(): AuthProfile | null {
  if (!canUseStorage()) {
    return null
  }

  const raw = localStorage.getItem(AUTH_PROFILE_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthProfile>
    if (typeof parsed.username === 'string' && typeof parsed.role === 'string') {
      return {
        username: parsed.username,
        role: parsed.role,
      }
    }
  } catch {
    // Ignore invalid cached payloads.
  }

  localStorage.removeItem(AUTH_PROFILE_STORAGE_KEY)
  return null
}

export function writePersistedAuthProfile(profile: AuthProfile): void {
  if (!canUseStorage()) {
    return
  }

  localStorage.setItem(AUTH_PROFILE_STORAGE_KEY, JSON.stringify(profile))
}

export function clearPersistedAuthProfile(): void {
  if (!canUseStorage()) {
    return
  }

  localStorage.removeItem(AUTH_PROFILE_STORAGE_KEY)
}

/**
 * 用本地持久化档案先填上首屏展示用的用户名 / 角色。
 *
 * **这不代表会话已经过服务端校验**：`auth_profile_73hub` 是上一次会话留下的快照，
 * 令牌可能已过期、角色可能已被收回（例如管理员 / 作者身份残留）。所以这里刻意把
 * `profileLoaded` 置为 `false`，让 `initializeSession()` / 路由守卫 / `ensureDevAccess()`
 * 走一次 `fetchProfile()`（`/auth/refresh` + `/auth/privileges`）覆盖本地值；
 * 只有服务端返回后 `profileLoaded` 才会变真。
 */
export function restorePersistedAuthProfile(state: AuthProfileState): boolean {
  const profile = readPersistedAuthProfile()
  if (!profile) {
    return false
  }

  state.username.value = profile.username
  state.role.value = profile.role
  state.profileLoaded.value = false
  state.profileRequest.value = null
  return true
}

export function applyAuthPayloadToState(
  state: AuthProfileState,
  payload: AuthPayload,
  persist: (token: string, preserveProfile?: boolean) => void,
  preserveProfile = false,
): void {
  persist(payload.token, preserveProfile)
  if (payload.username && payload.role) {
    state.username.value = payload.username
    state.role.value = payload.role
    state.profileLoaded.value = true
    state.profileRequest.value = null
    writePersistedAuthProfile({
      username: payload.username,
      role: payload.role,
    })
  }
}

export async function fetchAuthProfile(options: FetchProfileOptions): Promise<AuthProfile> {
  const { token, force = false, state, loadProfile } = options

  if (!token) {
    throw new Error('未登录')
  }

  if (state.profileLoaded.value && !force) {
    return {
      username: state.username.value,
      role: state.role.value,
    }
  }

  if (state.profileRequest.value && !force) {
    return state.profileRequest.value
  }

  const request = (async () => {
    const payload = await loadProfile()
    state.username.value = payload.username
    state.role.value = payload.role
    state.profileLoaded.value = true
    writePersistedAuthProfile(payload)
    return payload
  })()

  state.profileRequest.value = request

  try {
    return await request
  } finally {
    if (state.profileRequest.value === request) {
      state.profileRequest.value = null
    }
  }
}
