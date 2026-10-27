import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useConversationCardActions } from '@/composables/useConversationCardActions'

const mocks = vi.hoisted(() => ({
  requirements: vi.fn(),
  versions: vi.fn(),
  download: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@/api/requirements', () => ({ listRequirements: mocks.requirements }))
vi.mock('@/api/resources', () => ({ listPublicMcResourceVersions: mocks.versions }))
vi.mock('@/api/contracts', () => ({ fetchAsignRequirementPreviewUrl: vi.fn() }))
vi.mock('@/composables/useResourceDownload', () => ({
  useResourceDownload: () => ({ downloadResourceVersion: mocks.download }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('ui_73info', () => ({ TMessage: { warning: mocks.warning } }))

describe('会话交付物下载', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(window, 'open').mockImplementation(() => null)
    mocks.requirements.mockResolvedValue([{ requirement_id: 'REQ-3', bound_resource_id: 17 }])
    mocks.versions.mockResolvedValue([
      {
        id: 11,
        resource_id: 17,
        version: 'v1.0.1',
        resource: 'resource-files/17/delivery.jpg',
      },
    ])
    mocks.download.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('按资源与版本走统一认证下载，不直接打开存储路径', async () => {
    const loadActions = vi.fn().mockResolvedValue(undefined)
    const applyVersionCount = vi.fn()
    const actions = useConversationCardActions(() => ({
      token: 'test-token',
      requirementId: 'REQ-3',
      canPay: false,
      actions: () => ({
        loadActions,
        applyPublishedVersionCount: applyVersionCount,
      }),
    }))

    await actions.downloadDeliveryArtifact('v1.0.1')

    expect(mocks.download).toHaveBeenCalledWith(
      17,
      expect.objectContaining({ id: 11, version: 'v1.0.1' }),
      'test-token',
    )
    expect(window.open).not.toHaveBeenCalled()
    expect(loadActions).toHaveBeenCalledTimes(1)
    expect(applyVersionCount).toHaveBeenCalledWith(1)
  })
})
