import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiUrl } from '@/api/http'
import { useAuthStore } from '@/stores/auth'

const mocks = vi.hoisted(() => ({ getProfile: vi.fn() }))
vi.mock('@/api/settings/profile', () => ({ getProfile: mocks.getProfile }))

// 模块级缓存整站共用，所以每个用例用不同 token，靠 token 切换触发重新拉取
import { useUserAvatar } from '@/composables/useUserAvatar'

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.getProfile.mockReset()
})

describe('useUserAvatar', () => {
  it('ensureLoaded 拉取头像并拼完整地址；同 token 不重复请求', async () => {
    const auth = useAuthStore()
    auth.token = 'token-a'
    mocks.getProfile.mockResolvedValue({ avatar_url: '/uploads/user-avatars/alice/a.png' })

    const { avatarSrc, ensureLoaded } = useUserAvatar()
    expect(avatarSrc.value).toBe('')

    await ensureLoaded()
    expect(mocks.getProfile).toHaveBeenCalledTimes(1)
    expect(avatarSrc.value).toBe(apiUrl('/uploads/user-avatars/alice/a.png'))

    await ensureLoaded()
    expect(mocks.getProfile).toHaveBeenCalledTimes(1)
  })

  it('未登录直接跳过，不请求接口', async () => {
    const auth = useAuthStore()
    auth.token = ''

    const { ensureLoaded } = useUserAvatar()
    await ensureLoaded()
    expect(mocks.getProfile).not.toHaveBeenCalled()
  })

  it('图片失败回退空串，refresh 后恢复；接口失败静默回退', async () => {
    const auth = useAuthStore()
    auth.token = 'token-b'
    mocks.getProfile.mockResolvedValue({ avatar_url: '/uploads/user-avatars/alice/b.png' })

    const { avatarSrc, ensureLoaded, refresh, markFailed } = useUserAvatar()
    await ensureLoaded()
    expect(avatarSrc.value).toBe(apiUrl('/uploads/user-avatars/alice/b.png'))

    markFailed()
    expect(avatarSrc.value).toBe('')

    mocks.getProfile.mockResolvedValueOnce({ avatar_url: '/uploads/user-avatars/alice/c.png' })
    await refresh()
    expect(avatarSrc.value).toBe(apiUrl('/uploads/user-avatars/alice/c.png'))

    mocks.getProfile.mockRejectedValueOnce(new Error('offline'))
    auth.token = 'token-c'
    await ensureLoaded()
    expect(avatarSrc.value).toBe('')
  })
})
