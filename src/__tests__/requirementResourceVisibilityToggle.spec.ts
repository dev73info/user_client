import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requirement } from './helpers/requirementRowFixtures'

/**
 * 需求行「关联资源公开 / 私有」：未 claim 时公开入口前端先挡（状态提示），
 * 后端 409 兜底时同样按状态提示展示，不当系统错误吞掉。
 */
const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  toast: vi.fn(),
  reload: vi.fn(),
}))

vi.mock('@/api/requirements', () => ({
  updateRequirementResourceVisibility: mocks.update,
}))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast =
    (type: 'success' | 'error' | 'warning' | 'info') =>
    (message: string): void =>
      mocks.toast(message, type)
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: toast('success'),
      error: toast('error'),
      warning: toast('warning'),
      info: toast('info'),
    },
  }
})

import { HttpError } from '@/api/http'
import { useRequirementResourceVisibilityToggle } from '@/composables/useRequirementResourceVisibilityToggle'

function setup() {
  return useRequirementResourceVisibilityToggle({
    token: () => 'test-token',
    isAuthed: () => true,
    reload: mocks.reload,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.reload.mockResolvedValue(undefined)
})

describe('需求行：关联资源公开 / 私有', () => {
  it('未 claim 时点公开被前端挡下并给状态提示，不发请求', async () => {
    const toggle = setup()
    await toggle.toggleRequirementResourceVisibility(
      requirement({ status: 'completed', resource_visibility: 'private' }),
    )

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('转为我的资源后可设为公开', 'warning')
  })

  it('claim 后公开正常提交；后端 409 时按状态提示展示原文', async () => {
    mocks.update.mockRejectedValue(new HttpError(409, '交付资源尚未转为我的资源'))
    const toggle = setup()
    await toggle.toggleRequirementResourceVisibility(
      requirement({
        status: 'completed',
        resource_visibility: 'private',
        resource_claimed_at: '2026-10-09 11:20:00',
      }),
    )

    expect(mocks.update).toHaveBeenCalledWith('test-token', '2026-1', { visibility: 'public' })
    expect(mocks.toast).toHaveBeenCalledWith('交付资源尚未转为我的资源', 'warning')
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.any(String), 'error')
  })

  it('切回私有不看 claim，直接提交', async () => {
    const toggle = setup()
    await toggle.toggleRequirementResourceVisibility(
      requirement({ status: 'completed', resource_visibility: 'public' }),
    )

    expect(mocks.update).toHaveBeenCalledWith('test-token', '2026-1', { visibility: 'private' })
  })
})
