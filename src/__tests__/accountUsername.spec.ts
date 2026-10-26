import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { useAccountUsername } from '@/composables/useAccountUsername'
import { HttpError } from '@/api/http'

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  applyExternalSession: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))

const auth = reactive({
  token: 'test-token',
  username: 'alice',
  isAuthed: true,
  applyExternalSession: mocks.applyExternalSession,
})

vi.mock('@/api/settings', () => ({ updateProfile: mocks.updateProfile }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('ui_73info', () => ({
  TMessage: {
    success: mocks.success,
    error: mocks.error,
    info: mocks.info,
    warning: vi.fn(),
  },
}))

describe('账户用户名设置', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.username = 'alice'
    auth.token = 'test-token'
    auth.isAuthed = true
  })

  it('改名成功后使用新会话并关闭弹窗', async () => {
    mocks.updateProfile.mockResolvedValue({
      username: 'alice2',
      token: 'new-session-token',
      profile_description: '',
    })
    const result = useAccountUsername()
    result.openUsernameDialog()
    result.newUsername.value = 'alice2'

    await result.updateUsername()

    expect(mocks.updateProfile).toHaveBeenCalledWith('test-token', { new_username: 'alice2' })
    expect(mocks.applyExternalSession).toHaveBeenCalledWith({
      token: 'new-session-token',
      username: 'alice2',
    })
    expect(result.newUsername.value).toBe('alice2')
    expect(result.usernameDialogVisible.value).toBe(false)
  })

  it('重名时保留弹窗并展示后端原因', async () => {
    mocks.updateProfile.mockRejectedValue(new HttpError(409, '用户名已存在'))
    const result = useAccountUsername()
    result.openUsernameDialog()
    result.newUsername.value = 'bob'

    await result.updateUsername()

    expect(mocks.applyExternalSession).not.toHaveBeenCalled()
    expect(result.usernameDialogVisible.value).toBe(true)
    expect(result.usernameError.value).toBe('用户名已存在')
    expect(mocks.error).toHaveBeenCalledWith('用户名已存在')
  })

  it('改名响应缺少新会话时不冒充成功', async () => {
    mocks.updateProfile.mockResolvedValue({ username: 'alice2' })
    const result = useAccountUsername()
    result.openUsernameDialog()
    result.newUsername.value = 'alice2'

    await result.updateUsername()

    expect(mocks.applyExternalSession).not.toHaveBeenCalled()
    expect(result.usernameDialogVisible.value).toBe(true)
    expect(mocks.error).toHaveBeenCalled()
  })
})
