import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PublicMcResourceItem, PublicMcResourceVersionItem } from '@/api/resources'
import { useResourceFileDownload } from '@/composables/useResourceFileDownload'

/**
 * 版本售卖资源（资源级 buyout_price_fen / price_points 都是 0，但版本有价）的下载闸。
 *
 * 以前版本列表的按钮只看资源级 `needsPurchase`，点下去会先发一次必然 403 的下载请求。
 * 现在 `needsVersionPurchase` 命中时直接开购买面板，并按 `resolvePurchaseVersion` 换算出
 * 真正可下单的版本（0 价版本不可单卖）。
 */

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  downloadVersionFile: vi.fn(),
  triggerDownload: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, params: {}, fullPath: '/resources' }),
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessage: {
      info: (message: string) => mocks.toast('info', message),
      warning: (message: string) => mocks.toast('warning', message),
      success: (message: string) => mocks.toast('success', message),
      error: (message: string) => mocks.toast('error', message),
    },
  }
})

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: 'test-token', isAuthed: true }),
}))

vi.mock('@/composables/useResourceDownload', () => ({
  useResourceDownload: () => ({ triggerDownload: mocks.triggerDownload }),
}))

vi.mock('@/api/resources', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/resources')>()),
  downloadPublicMcResourceVersionFile: mocks.downloadVersionFile,
}))

const resource = {
  id: 58,
  file_name: 'tool.zip',
  buyout_price_fen: 0,
  price_points: 0,
} as PublicMcResourceItem

const freeVersion = {
  id: 501,
  resource_id: 58,
  version: 'v1.0',
  resource: '/uploads/resource-versions/58/uuid-tool.zip',
  note: null,
  creator: 'alice',
  created_at: '2026-01-01 00:00:00',
  is_current: true,
  price_fen: 0,
  purchasable: false,
} as PublicMcResourceVersionItem

const paidVersion = {
  ...freeVersion,
  id: 502,
  version: 'v2.0',
  price_fen: 990,
  purchasable: true,
} as PublicMcResourceVersionItem

type OpenPurchasePanelMock = (version?: PublicMcResourceVersionItem | null) => Promise<void>

function createComposable(overrides: {
  needsVersionPurchase?: () => boolean
  openPurchasePanel?: OpenPurchasePanelMock
  resolvePurchaseVersion?: (
    version: PublicMcResourceVersionItem | null,
  ) => PublicMcResourceVersionItem | null
}) {
  const openPurchasePanel: OpenPurchasePanelMock =
    overrides.openPurchasePanel ?? vi.fn().mockResolvedValue(undefined)
  const api = useResourceFileDownload({
    getResource: () => resource,
    getLatestVersion: () => freeVersion,
    needsPurchase: () => false,
    needsVersionPurchase: overrides.needsVersionPurchase,
    openPurchasePanel,
    resolvePurchaseVersion: overrides.resolvePurchaseVersion,
  })
  return { ...api, openPurchasePanel }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useResourceFileDownload 版本售卖闸', () => {
  it('needsVersionPurchase 命中时版本列表按钮直接开购买面板，不发下载请求', async () => {
    const { downloadVersion, openPurchasePanel } = createComposable({
      needsVersionPurchase: () => true,
    })

    await downloadVersion(freeVersion)

    expect(mocks.downloadVersionFile).not.toHaveBeenCalled()
    expect(mocks.triggerDownload).not.toHaveBeenCalled()
    expect(openPurchasePanel).toHaveBeenCalledTimes(1)
    expect(openPurchasePanel).toHaveBeenCalledWith(freeVersion)
  })

  it('拦截时按 resolvePurchaseVersion 换成可下单的版本（0 价换最低价可购版本）', async () => {
    const { downloadVersion, openPurchasePanel } = createComposable({
      needsVersionPurchase: () => true,
      resolvePurchaseVersion: () => paidVersion,
    })

    await downloadVersion(freeVersion)

    expect(openPurchasePanel).toHaveBeenCalledWith(paidVersion)
    expect(mocks.downloadVersionFile).not.toHaveBeenCalled()
  })

  it('主下载按钮同样命中版本售卖闸，目标版本按 resolvePurchaseVersion(null) 计算', async () => {
    const { openResourceFile, openPurchasePanel } = createComposable({
      needsVersionPurchase: () => true,
      resolvePurchaseVersion: () => paidVersion,
    })

    await openResourceFile()

    expect(mocks.downloadVersionFile).not.toHaveBeenCalled()
    expect(openPurchasePanel).toHaveBeenCalledWith(paidVersion)
  })

  it('未命中版本售卖闸时照常下载', async () => {
    mocks.triggerDownload.mockImplementation(async (run: () => Promise<unknown>) => {
      await run()
    })
    const { downloadVersion, openPurchasePanel } = createComposable({
      needsVersionPurchase: () => false,
    })

    await downloadVersion(freeVersion)

    expect(openPurchasePanel).not.toHaveBeenCalled()
    expect(mocks.downloadVersionFile).toHaveBeenCalledWith(
      58,
      freeVersion.id,
      'test-token',
      undefined,
    )
  })
})
