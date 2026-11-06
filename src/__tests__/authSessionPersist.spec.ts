import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import { AUTH_TOKEN_STORAGE_KEY } from '@/shared/auth/storage'

/**
 * 持久化档案只是首屏快照，不是已校验的会话。
 *
 * 后台登录残留的 `auth_profile_73hub`（管理员 / 作者用户名与角色）以前会被
 * `restorePersistedAuthProfile()` 标成 `profileLoaded = true`，`initializeSession()`
 * 于是直接返回本地值、不再向服务端校验，残留身份被当成真实会话。
 * 这里钉住：恢复后 `profileLoaded` 必须是 false，且 `initializeSession()` 会打
 * `/auth/refresh` + `/auth/privileges`，用服务端角色覆盖本地快照。
 */

const mocks = vi.hoisted(() => ({
  refreshToken: vi.fn(),
  getPrivileges: vi.fn(),
}))

vi.mock('@/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth')>()),
  refreshToken: mocks.refreshToken,
  getPrivileges: mocks.getPrivileges,
}))

const PROFILE_STORAGE_KEY = 'auth_profile_73hub'

describe('持久化档案未校验', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    localStorage.removeItem(PROFILE_STORAGE_KEY)
    mocks.refreshToken.mockReset()
    mocks.getPrivileges.mockReset()
    mocks.getPrivileges.mockResolvedValue({
      username: 'normal_user',
      role: 'user',
      roles: ['user'],
      permissions: [],
      is_super_admin: false,
    })
  })

  it('恢复档案后 profileLoaded 为 false，但用户名 / 角色仍可用于首屏展示', () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'stale-token')
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ username: 'admin_residue', role: 'admin' }),
    )

    const auth = useAuthStore()
    auth.hydrate()

    expect(auth.token).toBe('stale-token')
    expect(auth.username).toBe('admin_residue')
    expect(auth.role).toBe('admin')
    expect(auth.profileLoaded).toBe(false)
  })

  it('initializeSession 会向服务端校验，并用返回的角色覆盖本地残留', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'stale-token')
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ username: 'admin_residue', role: 'admin' }),
    )
    mocks.refreshToken.mockResolvedValue({
      token: 'fresh-token',
      username: 'normal_user',
      role: 'user',
      roles: ['user'],
    })

    const auth = useAuthStore()
    const profile = await auth.initializeSession()

    expect(mocks.refreshToken).toHaveBeenCalledTimes(1)
    expect(mocks.getPrivileges).toHaveBeenCalledTimes(1)
    expect(profile).toEqual({ username: 'normal_user', role: 'user' })
    expect(auth.username).toBe('normal_user')
    expect(auth.role).toBe('user')
    expect(auth.profileLoaded).toBe(true)
    expect(auth.isSuperAdmin).toBe(false)
    expect(JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) ?? '{}')).toEqual({
      username: 'normal_user',
      role: 'user',
    })
  })

  it('服务端校验失败时不会被当作已登录的管理员继续使用', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'stale-token')
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ username: 'admin_residue', role: 'admin' }),
    )
    mocks.refreshToken.mockRejectedValue(new Error('网络异常'))

    const auth = useAuthStore()
    await expect(auth.initializeSession()).rejects.toThrow('网络异常')

    // 档案值只用于展示；错误分支不清态，但 profileLoaded 仍是 false，调用方会重新校验
    expect(auth.profileLoaded).toBe(false)
  })
})
