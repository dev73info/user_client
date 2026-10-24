import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * BUG-020：接口资源不能被平台内的常规购买入口下单。
 *
 * 后端两条平台内入口（现金购 / 积分购）都会以 409 拒掉接口资源——
 * 接口资源只认「开发者自有站点的服务端 + 指定来源 + 接口密钥」这一条入口。
 * 前端因此不能在详情页给出平台内购买入口，只给一条「到开发者站点下单」的引导。
 *
 * 盯的是资源详情面板（ResourceDetailPanel）：它是 user_client 里唯一调用
 * `POST /api/resources/resources/{id}/purchase` 的地方。
 * 场景取「团队成员看接口资源」——这类人能看到详情（后端放行团队成员），
 * 但不是作者，`needsPurchase` 本来会算出「要买」，正是修复前会露出购买按钮的那一档。
 */

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  getResource: vi.fn(),
  listVersions: vi.fn(),
  listComments: vi.fn(),
  createPurchase: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useRoute: () => ({ query: {}, params: {}, fullPath: '/' }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    token: 'test-token',
    username: 'team_member',
    isAuthed: true,
    hydrate: vi.fn(),
  }),
}))

vi.mock('@/stores/download', () => ({
  useDownloadStore: () => ({ state: { active: false, percent: 0, fileName: '' } }),
}))

vi.mock('@/composables/useResourceDownload', () => ({
  useResourceDownload: () => ({ triggerDownload: vi.fn() }),
}))

vi.mock('@/composables/useCodeBlockCopy', () => ({
  useCodeBlockCopy: () => ({}),
}))

vi.mock('@/composables/useResourcePayment', async () => {
  const { ref } = await import('vue')
  return {
    useResourcePayment: () => ({
      order: ref(null),
      qrDataUrl: ref(''),
      generation: ref(0),
      stopPoll: vi.fn(),
      invalidateSurface: vi.fn(),
      renderQr: vi.fn(),
      startPoll: vi.fn(),
      pollOnce: vi.fn(),
    }),
  }
})

vi.mock('@/api/resources', () => ({
  getPublicMcResource: mocks.getResource,
  listPublicMcResourceVersions: mocks.listVersions,
  listPublicMcResourceComments: mocks.listComments,
  likePublicMcResource: vi.fn(),
  unlikePublicMcResource: vi.fn(),
  createPublicMcResourceComment: vi.fn(),
  downloadPublicMcResourceVersionFile: vi.fn(),
  invalidateResourceListCache: vi.fn(),
  extractResourceFileNameFromUrl: (url: string) => url.split('/').pop() ?? '',
  resolveResourceDownloadFileName: (fallback: string) => fallback,
  with73Extension: (name: string) => name,
}))

vi.mock('@/api/resourcePurchase', () => ({
  createResourcePurchase: mocks.createPurchase,
}))

vi.mock('@/api/adapay', () => ({
  getAdapayClientPlatform: () => 'pc',
}))

vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast =
    (type: 'success' | 'error' | 'warning' | 'info') =>
    (message: string): void => {
      mocks.toast(message, type)
    }
  return {
    ...actual,
    // TLoading 换成直通组件：默认实现会把内容包在自己的 loading 容器里，断言按钮不方便。
    TLoading: {
      name: 'TLoading',
      props: ['loading', 'tag'],
      template: '<component :is="tag || \'div\'"><slot /></component>',
    },
    TMessage: {
      ...actual.TMessage,
      success: toast('success'),
      error: toast('error'),
      warning: toast('warning'),
      info: toast('info'),
    },
  }
})

import type { PublicMcResourceItem } from '@/api/resources'
import ResourceDetailPanel from '@/components/ResourceDetailPanel.vue'

/** 只带详情页要看的字段。 */
function resourceFixture(part: Record<string, unknown> = {}): PublicMcResourceItem {
  return {
    id: 158089,
    creator: 'dev_api_owner',
    author: 'dev_api_owner',
    platform: 'minecraft',
    title: '接口资源',
    description: '接口资源',
    tag_selections: [],
    file_name: '',
    source_url: '',
    cover_url: null,
    docs_url: null,
    visibility: 'published',
    release_note: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    like_count: 0,
    download_count: 0,
    view_count: 0,
    liked_by_me: false,
    ownership_type: 'individual',
    team_id: null,
    team_name: null,
    team_avatar_url: null,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    // 售卖判定只认买断价 `buyout_price_fen`（`price_fen` 是冻结的历史值）
    buyout_price_fen: 9900,
    price_fen: 9900,
    price_points: 0,
    copyright_declared: true,
    copyright_declared_at: null,
    purchased_by_me: false,
    promo_share_bps: 0,
    ...part,
  } as unknown as PublicMcResourceItem
}

async function mountPanel(resource: PublicMcResourceItem) {
  mocks.getResource.mockResolvedValue(resource)
  const wrapper = mount(ResourceDetailPanel, { props: { resourceId: resource.id } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  mocks.toast.mockReset()
  mocks.push.mockReset()
  mocks.replace.mockReset()
  mocks.getResource.mockReset()
  mocks.listVersions.mockReset()
  mocks.listComments.mockReset()
  mocks.createPurchase.mockReset()
  mocks.listVersions.mockResolvedValue([])
  mocks.listComments.mockResolvedValue([])
})

describe('ResourceDetailPanel · 接口资源的平台内购买入口', () => {
  it('接口资源不给平台内购买入口，只留到开发者站点下单的引导', async () => {
    const wrapper = await mountPanel(resourceFixture({ resource_kind: 'api' }))

    // 平台内购买按钮不渲染
    expect(wrapper.find('.resource-detail-page__primary-btn').exists()).toBe(false)
    // 改成一句引导
    expect(wrapper.find('.resource-detail-page__api-hint').text()).toBe(
      '接口资源不在平台内售卖，请到开发者站点下单',
    )
    // 一次平台内下单请求都不该发出去
    expect(mocks.createPurchase).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('普通资源照旧给平台内购买入口（对照组：闸门只针对接口资源）', async () => {
    const wrapper = await mountPanel(resourceFixture({ resource_kind: 'normal' }))

    const cta = wrapper.find('.resource-detail-page__primary-btn')
    expect(cta.exists()).toBe(true)
    expect(cta.text()).toBe('购买 ¥99.00')
    expect(wrapper.find('.resource-detail-page__api-hint').exists()).toBe(false)

    wrapper.unmount()
  })
})
