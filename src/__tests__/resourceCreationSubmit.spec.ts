import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { McResourcePayload } from '@/api/mcResources'
import { useResourceInitForm } from '@/composables/useResourceInitForm'
import { useResourceInitSubmit } from '@/composables/useResourceInitSubmit'
import type { ResourceCreationType, ResourcePaidMode } from '@/shared/resourceCreation'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  submitReview: vi.fn(),
  updateChannel: vi.fn(),
  uploadCover: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: 'test-token', username: 'developer', hydrate: vi.fn() }),
}))
vi.mock('@/api/mcResources', () => ({
  createMcResource: mocks.create,
  getMcResource: mocks.get,
  submitMcResourceReview: mocks.submitReview,
  updateResourceApiChannel: mocks.updateChannel,
  uploadMcResourceCover: mocks.uploadCover,
}))
vi.mock('@/api/team', () => ({ listMyTeams: vi.fn() }))
vi.mock('ui_73info', () => ({
  TMessage: {
    warning: mocks.warning,
    error: mocks.error,
    success: mocks.success,
    info: mocks.info,
  },
}))

function setupSubmit(creationType: ResourceCreationType, paidMode: ResourcePaidMode) {
  const selectedTagCount = ref(1)
  const formState = useResourceInitForm({
    selectedTagCount,
    currentEntryKey: ref('hand'),
    currentEntryLabel: ref('手绘'),
    currentPlatform: ref('手绘'),
    currentPlatformLabel: ref('手绘'),
  })
  formState.creationType.value = creationType
  formState.paidMode.value = paidMode
  formState.form.title = '测试资源'
  formState.form.author = 'developer'
  formState.form.copyrightDeclared = creationType === 'paid'

  const tagCatalog = {
    platformTagGroups: ref([{ id: 28 }]),
    selectedTagCount,
    buildTagSelections: vi.fn(() => [{ group_id: 28, tag_ids: [210] }]),
    resetTagSelections: vi.fn(),
  }
  const channel = {
    needsApiAgreement: ref(false),
    validateApiChannel: vi.fn(() => true),
    apiOrigins: ref([]),
    revealedSecretPlain: ref(''),
    secretPlainDialogVisible: ref(false),
    resetChannelState: vi.fn(),
    applySavedApiChannel: vi.fn(),
  }
  const createdResource = ref<McResourcePayload | null>(null)
  const composable = useResourceInitSubmit({
    formState,
    tagCatalog: tagCatalog as never,
    channel: channel as never,
    createdResource,
  })
  return { formState, composable }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockResolvedValue({ id: 33 })
})

describe('资源创建类型提交', () => {
  it('免费资源始终提交零现金价与零积分价', async () => {
    const { composable } = setupSubmit('free', 'buyout')
    await composable.submitResource('private')

    expect(mocks.create).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({
        buyout_price_fen: 0,
        price_points: 0,
        resource_kind: 'normal',
      }),
    )
    expect(mocks.push).toHaveBeenCalledWith({ name: 'dev-resource-list' })
  })

  it('付费买断没有售价时不可提交', async () => {
    const { composable } = setupSubmit('paid', 'buyout')
    await composable.submitResource('private')

    expect(composable.canSubmit.value).toBe(false)
    expect(composable.submitBlockReason.value).toBe('请设置现金售价或积分售价')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('单版本主资源为零买断价，首版发布前不送审', async () => {
    const { composable } = setupSubmit('paid', 'version')
    await composable.submitResource('public')

    expect(mocks.create).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({
        buyout_price_fen: 0,
        price_points: 0,
        copyright_declared: true,
        resource_kind: 'normal',
      }),
    )
    expect(mocks.submitReview).not.toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith({
      name: 'dev-resource-versions',
      params: { resourceId: 33 },
      query: { create: '1', sale: 'version', review: '1' },
    })
  })
})
