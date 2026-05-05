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

export function restorePersistedAuthProfile(state: AuthProfileState): boolean {
  const profile = readPersistedAuthProfile()
  if (!profile) {
    return false
  }

  state.username.value = profile.username
  state.role.value = profile.role
  state.profileLoaded.value = true
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
