import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { McResourcePayload, McResourceVersionPayload } from '@/api/mcResources'
import type { RequirementItem } from '@/api/requirements'
import { useDevResourcePublishVersion } from '@/composables/useDevResourcePublishVersion'
import { useResourceVersionDialogs } from '@/composables/useResourceVersionDialogs'

const mocks = vi.hoisted(() => ({
  createVersion: vi.fn(),
  updateVersion: vi.fn(),
  deleteVersion: vi.fn(),
  deliver: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@/api/mcResources', () => ({
  createMcResourceVersion: mocks.createVersion,
  updateMcResourceVersion: mocks.updateVersion,
  deleteMcResourceVersion: mocks.deleteVersion,
}))
vi.mock('@/api/requirements', () => ({ submitRequirementDelivery: mocks.deliver }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ token: 'test-token' }) }))
vi.mock('ui_73info', () => ({
  TMessage: {
    success: mocks.success,
    error: mocks.error,
    warning: mocks.warning,
  },
}))

function resource(requirementId: string | null): McResourcePayload {
  return {
    id: 17,
    requirement_id: requirementId,
    requirement_archive_locked: false,
  } as McResourcePayload
}

function setupEntry(kind: string, requirementId: string | null) {
  if (kind === '资源列表') {
    const composable = useDevResourcePublishVersion()
    composable.openPublishVersionDialog(resource(requirementId))
    return {
      submit: composable.submitVersion,
      visible: composable.publishDialogVisible,
      reload: vi.fn(),
    }
  }

  const reload = vi.fn().mockResolvedValue(undefined)
  const composable = useResourceVersionDialogs({
    resource: ref(resource(requirementId)),
    versionRows: ref([]),
    loadPage: reload,
  })
  composable.openCreateVersionDialog()
  return {
    submit: composable.submitVersion,
    visible: composable.createVersionDialogVisible,
    reload,
  }
}

const entries = ['资源列表', '版本管理']

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createVersion.mockResolvedValue({ id: 10, version: 'v1.0.1' } as McResourceVersionPayload)
  mocks.deliver.mockResolvedValue({ requirement_id: 'REQ-3' } as RequirementItem)
})

describe('资源版本发布后的需求交付登记', () => {
  it.each(entries)('%s：绑定需求的版本发布成功后登记交付', async (kind) => {
    const entry = setupEntry(kind, 'REQ-3')

    await entry.submit({
      version: 'v1.0.1',
      note: '',
      file: new File(['delivery'], 'delivery.zip'),
    })

    expect(mocks.createVersion).toHaveBeenCalledWith(
      'test-token',
      17,
      expect.objectContaining({ version: 'v1.0.1' }),
    )
    expect(mocks.deliver).toHaveBeenCalledWith('test-token', 'REQ-3')
    expect(mocks.createVersion.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deliver.mock.invocationCallOrder[0],
    )
    expect(entry.visible.value).toBe(false)
    expect(mocks.success).toHaveBeenCalledWith('交付版本已提交，等待客户验收')
  })

  it.each(entries)('%s：未绑定需求的普通发布不登记交付', async (kind) => {
    const entry = setupEntry(kind, null)

    await entry.submit({
      version: 'v1.0.1',
      note: '',
      file: new File(['delivery'], 'delivery.zip'),
    })

    expect(mocks.deliver).not.toHaveBeenCalled()
    expect(entry.visible.value).toBe(false)
    expect(mocks.success).toHaveBeenCalledWith('新版本已发布')
  })

  it.each(entries)('%s：交付登记失败不显示成功', async (kind) => {
    const entry = setupEntry(kind, 'REQ-3')
    mocks.deliver.mockRejectedValue(new Error('交付登记失败'))

    await entry.submit({
      version: 'v1.0.1',
      note: '',
      file: new File(['delivery'], 'delivery.zip'),
    })

    expect(entry.visible.value).toBe(true)
    expect(entry.reload).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith('交付登记失败')
  })
})
