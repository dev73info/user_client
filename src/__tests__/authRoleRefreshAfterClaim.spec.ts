import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import { AUTH_TOKEN_STORAGE_KEY } from '@/shared/auth/storage'

/* 「转为我的资源」成功后页面会调 `auth.fetchProfile(true)`：后端 `/auth/refresh` 按库里最新角色重新签发，
   需求方刚被补上的 `dev` 角色要立刻反映到 store 里，「切换工作台」才不用重新登录。
   这里把刷新接口 mock 成「返回新增的 dev 角色」，断言 role / isDev / 持久化都跟着更新。 */

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

describe('转换后刷新账号角色', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    localStorage.removeItem(PROFILE_STORAGE_KEY)
    mocks.refreshToken.mockReset()
    mocks.getPrivileges.mockReset()
    // 刷新会话时会顺带拉一次生效权限（契约 `PrivilegesResponse`）
    mocks.getPrivileges.mockResolvedValue({
      username: 'client_flow',
      role: 'dev',
      roles: ['dev', 'user'],
      permissions: ['scope.dev.access'],
      is_super_admin: false,
    })
  })

  function clientWithoutDevRole() {
    const auth = useAuthStore()
    auth.token = 'client-token'
    auth.username = 'client_flow'
    auth.role = 'user'
    auth.profileLoaded = true
    vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
    return auth
  }

  it('强制刷新后 store 里的角色变成 dev，不需要重新登录', async () => {
    const auth = clientWithoutDevRole()
    expect(auth.isDev).toBe(false)
    mocks.refreshToken.mockResolvedValue({
      token: 'client-token-2',
      username: 'client_flow',
      role: 'dev',
      roles: ['dev', 'user'],
    })

    const profile = await auth.fetchProfile(true)

    expect(mocks.refreshToken).toHaveBeenCalledWith('client-token')
    expect(profile).toEqual({ username: 'client_flow', role: 'dev' })
    expect(auth.role).toBe('dev')
    expect(auth.isDev).toBe(true)
    // 新令牌与新角色都要落到本地，刷新页面后仍是开发者
    expect(auth.token).toBe('client-token-2')
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('client-token-2')
    expect(JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) ?? '{}')).toEqual({
      username: 'client_flow',
      role: 'dev',
    })
  })

  it('不带 force 时沿用已加载的旧角色，所以转换后必须传 force=true', async () => {
    const auth = clientWithoutDevRole()
    mocks.refreshToken.mockResolvedValue({
      token: 'client-token-2',
      username: 'client_flow',
      role: 'dev',
    })

    const profile = await auth.fetchProfile()

    expect(mocks.refreshToken).not.toHaveBeenCalled()
    expect(profile.role).toBe('user')
    expect(auth.isDev).toBe(false)
  })

  it('本来就有 dev 角色的需求方刷新后仍是 dev，不受影响', async () => {
    const auth = clientWithoutDevRole()
    auth.role = 'dev'
    mocks.refreshToken.mockResolvedValue({
      token: 'client-token-2',
      username: 'client_flow',
      role: 'dev',
      roles: ['dev', 'user'],
    })

    await auth.fetchProfile(true)

    expect(auth.role).toBe('dev')
    expect(auth.isDev).toBe(true)
  })

  it('刷新接口失败时抛出错误、旧角色保留，页面据此只提示而不回滚转换结果', async () => {
    const auth = clientWithoutDevRole()
    mocks.refreshToken.mockRejectedValue(new Error('网络异常'))

    await expect(auth.fetchProfile(true)).rejects.toThrow('网络异常')
    expect(auth.role).toBe('user')
    expect(auth.token).toBe('client-token')
  })
})
