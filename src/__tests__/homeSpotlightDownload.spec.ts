import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { HttpError } from '@/api/http'
import { useSpotlightDownload } from '@/composables/useSpotlightDownload'
import type { SpotlightCard } from '@/composables/useSpotlightCards'
import { publicResourceFixture as resourceFixture } from './homeSpotlightFixtures'

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  listVersions: vi.fn(),
  downloadVersion: vi.fn(),
  openSpotlight: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'home', path: '/', query: {}, fullPath: '/' }),
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessage: {
      info: (message: string) => mocks.toast('info', message),
      warning: (message: string) => mocks.toast('warning', message),
      success: vi.fn(),
      error: vi.fn(),
    },
  }
})

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ isAuthed: true, token: 'token' }),
}))

vi.mock('@/api/resources', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/resources')>()),
  listPublicMcResourceVersions: mocks.listVersions,
}))

vi.mock('@/composables/useResourceDownload', () => ({
  useResourceDownload: () => ({ downloadResourceVersion: mocks.downloadVersion }),
}))

function card(id: number): SpotlightCard {
  return {
    kind: 'resource',
    title: `资源 ${id}`,
    summary: '',
    tags: [],
    badge: '',
    mark: '',
    viewCount: 0,
    downloadCount: 0,
    free: true,
    likeCount: 0,
    likedByMe: false,
    accent: 'nebula',
    resourceId: id,
  }
}

const currentVersion = {
  id: 21,
  resource_id: 1,
  version: 'v1.1',
  resource: '/uploads/resource-versions/1/uuid-tool.zip',
  note: null,
  creator: 'dev',
  created_at: '2026-01-01 00:00:00',
  is_current: true,
  price_fen: 0,
  purchasable: false,
}

function setup(resource = resourceFixture({ id: 1 })) {
  return useSpotlightDownload({
    publicResources: ref([resource]),
    openSpotlight: mocks.openSpotlight,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listVersions.mockResolvedValue([currentVersion])
  mocks.downloadVersion.mockResolvedValue(undefined)
})

describe('useSpotlightDownload', () => {
  it('免费资源选当前版本并走统一下载入口', async () => {
    const { downloadSpotlight } = setup()

    await downloadSpotlight(card(1))

    expect(mocks.listVersions).toHaveBeenCalledWith(1, 'token')
    expect(mocks.downloadVersion).toHaveBeenCalledWith(1, currentVersion, 'token')
    expect(mocks.openSpotlight).not.toHaveBeenCalled()
  })

  it('付费或积分资源不直下，回到详情购买', async () => {
    const { downloadSpotlight } = setup(
      resourceFixture({ id: 1, buyout_price_fen: 0, price_points: 50 }),
    )

    await downloadSpotlight(card(1))

    expect(mocks.listVersions).not.toHaveBeenCalled()
    expect(mocks.openSpotlight).toHaveBeenCalledWith(card(1))
  })

  it('下载被 403 拦截时提示并回到详情购买', async () => {
    mocks.downloadVersion.mockRejectedValue(new HttpError(403, '请先购买该资源后再下载'))
    const { downloadSpotlight } = setup()
    const target = card(1)

    await downloadSpotlight(target)

    expect(mocks.toast).toHaveBeenCalledWith('warning', '请先购买该资源后再下载')
    expect(mocks.openSpotlight).toHaveBeenCalledWith(target)
  })
})
