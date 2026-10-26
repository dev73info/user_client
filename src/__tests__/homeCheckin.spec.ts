import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, reactive, type EffectScope } from 'vue'

import { useHomeCheckin } from '@/composables/useHomeCheckin'

const mocks = vi.hoisted(() => ({ status: vi.fn(), checkin: vi.fn() }))
const auth = reactive({ isAuthed: false, token: '' })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/api/points', () => ({
  getCheckinStatus: mocks.status,
  doCheckin: mocks.checkin,
}))
vi.mock('ui_73info', () => ({
  TMessage: { success: vi.fn(), error: vi.fn() },
}))

describe('首页签到会话时序', () => {
  let scope: EffectScope | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    auth.isAuthed = false
    auth.token = ''
    mocks.status.mockResolvedValue({
      username: 'tester',
      today_checked_in: false,
      streak_count: 1,
      today_potential: 10,
    })
    scope = effectScope()
  })

  it('登录态就绪后加载状态，退出登录后清空状态', async () => {
    const result = scope!.run(() => useHomeCheckin())!
    expect(mocks.status).not.toHaveBeenCalled()

    auth.isAuthed = true
    auth.token = 'user-token'
    await flushPromises()
    expect(mocks.status).toHaveBeenCalledWith('user-token')
    expect(result.status.value?.today_checked_in).toBe(false)

    auth.isAuthed = false
    auth.token = ''
    await flushPromises()
    expect(result.status.value).toBeNull()
    scope!.stop()
  })
})
