import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 按版本售卖资源（资源级价格全 0、版本有价）：标价「¥x 起」、主按钮购买（0 价版本不单卖）、
 * 下单带 `version_id`；403 转购买时 0 价版本要换到可购版本。
 */

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  getResource: vi.fn(),
  listVersions: vi.fn(),
  listComments: vi.fn(),
  createPurchase: vi.fn(),
  triggerDownload: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useRoute: () => ({ query: {}, params: {}, fullPath: '/' }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    token: 'test-token',
    username: 'buyer',
    isAuthed: true,
    hydrate: vi.fn(),
  }),
}))

vi.mock('@/stores/download', () => ({
  useDownloadStore: () => ({ state: { active: false, percent: 0, fileName: '' } }),
}))

vi.mock('@/composables/useResourceDownload', () => ({
  useResourceDownload: () => ({ triggerDownload: mocks.triggerDownload }),
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

import { HttpError } from '@/api/http'
import type { PublicMcResourceItem, PublicMcResourceVersionItem } from '@/api/resources'
import ResourceDetailPanel from '@/components/ResourceDetailPanel.vue'

/** 资源级价格全为 0（生产缺陷的形态），售卖只落在版本上。 */
function resourceFixture(part: Record<string, unknown> = {}): PublicMcResourceItem {
  return {
    id: 158089,
    creator: 'dev_api_owner',
    author: 'dev_api_owner',
    platform: 'minecraft',
    title: '单版本付费资源',
    description: '单版本付费资源',
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
    buyout_price_fen: 0,
    price_fen: 0,
    price_points: 0,
    copyright_declared: true,
    copyright_declared_at: null,
    purchased_by_me: false,
    promo_share_bps: 0,
    ...part,
  } as unknown as PublicMcResourceItem
}

function versionFixture(part: Record<string, unknown> = {}): PublicMcResourceVersionItem {
  return {
    id: 501,
    resource_id: 158089,
    version: '1.0.0',
    resource: '/uploads/version-1.0.0.zip',
    note: null,
    creator: 'dev_api_owner',
    created_at: '2026-10-01T00:00:00Z',
    is_current: true,
    price_fen: 1,
    purchasable: true,
    ...part,
  } as unknown as PublicMcResourceVersionItem
}

/** 非当前版本（0.9.0）：几个用例共用的版本形态，差异只落在 id 与价格上。 */
function olderVersionFixture(part: Record<string, unknown>) {
  return versionFixture({
    version: '0.9.0',
    is_current: false,
    created_at: '2026-09-01T00:00:00Z',
    ...part,
  })
}

async function mountPanel(resource: PublicMcResourceItem, versions: PublicMcResourceVersionItem[]) {
  mocks.getResource.mockResolvedValue(resource)
  mocks.listVersions.mockResolvedValue(versions)
  const wrapper = mount(ResourceDetailPanel, {
    props: { resourceId: resource.id },
    global: { stubs: { teleport: true } },
  })
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
  mocks.triggerDownload.mockReset()
  mocks.listComments.mockResolvedValue([])
  mocks.createPurchase.mockResolvedValue({
    order_no: 'RPO-TEST',
    status: 'pending',
    resource_id: 158089,
    pay_channel: 'alipay',
    pay_url: '',
    amount_fen: 1,
    amount_points: 0,
  })
})

describe('ResourceDetailPanel · 按版本售卖', () => {
  it('资源级价格为 0、版本有价：标价显示「¥x 起」，主按钮购买，下单带 version_id', async () => {
    const wrapper = await mountPanel(resourceFixture(), [versionFixture()])

    // 不再显示「免费」，价格徽标按付费着色
    const pricePill = wrapper.get('.resource-detail-page__price-pill')
    expect(pricePill.text()).toBe('¥0.01 起')
    expect(pricePill.classes()).toContain('is-paid')

    const cta = wrapper.get('.resource-detail-page__primary-btn')
    expect(cta.text()).toBe('购买 ¥0.01 起')

    await cta.trigger('click')
    await flushPromises()

    expect(mocks.createPurchase).toHaveBeenCalledTimes(1)
    const [token, resourceId, payload] = mocks.createPurchase.mock.calls[0] ?? []
    expect(token).toBe('test-token')
    expect(resourceId).toBe(158089)
    expect(payload).toMatchObject({ version_id: 501, pay_channel: 'alipay' })
    // 金额由服务端按版本价取，前端不传 amount_fen
    expect(payload).not.toHaveProperty('amount_fen')
    // 购买面板金额显示目标版本价
    expect(wrapper.get('.resource-purchase-modal__amount').text()).toContain('¥0.01')

    wrapper.unmount()
  })

  it('已买过某个版本：主按钮回到下载，版本按钮先试下载；403 时按该版本打开购买', async () => {
    const latest = versionFixture({ id: 501, version: '1.0.0', price_fen: 100 })
    const older = olderVersionFixture({ id: 502, price_fen: 200 })
    const wrapper = await mountPanel(resourceFixture({ purchased_by_me: true }), [latest, older])

    // 已持有权益：主按钮不再要求购买，标价仍按版本最低价展示
    expect(wrapper.get('.resource-detail-page__price-pill').text()).toBe('¥1.00 起')
    expect(wrapper.get('.resource-detail-page__primary-btn').text()).toBe('下载最新版本')
    // 版本列表按钮保持「下载」（不在点击前拦截，由后端按版本判定权益）
    expect(
      wrapper.findAll('.resource-detail-page__version-download').map((button) => button.text()),
    ).toEqual(['下载', '下载'])

    // 下载另一版本被后端 403：购买面板带上这条版本的上下文
    mocks.triggerDownload.mockRejectedValueOnce(new HttpError(403, '请先购买该资源后再下载'))
    await wrapper.findAll('.resource-detail-page__version-download')[1]?.trigger('click')
    await flushPromises()

    expect(mocks.createPurchase).toHaveBeenCalledTimes(1)
    const payload = mocks.createPurchase.mock.calls[0]?.[2] as Record<string, unknown>
    expect(payload).toMatchObject({ version_id: 502 })
    expect(wrapper.get('.resource-purchase-modal__amount').text()).toContain('¥2.00')

    wrapper.unmount()
  })

  it('最新版本 0 价也不当免费：主按钮购买，403 后落到最低价可购版本', async () => {
    const freeLatest = versionFixture({ id: 503, price_fen: 0, purchasable: false })
    const paidOlder = olderVersionFixture({ id: 504, price_fen: 100 })
    const wrapper = await mountPanel(resourceFixture(), [freeLatest, paidOlder])

    expect(wrapper.get('.resource-detail-page__price-pill').text()).toBe('¥1.00 起')
    expect(wrapper.get('.resource-detail-page__primary-btn').text()).toBe('购买 ¥1.00 起')
    // 版本列表按钮仍先试下载；被后端 403 后购买面板必须换到可购版本
    mocks.triggerDownload.mockRejectedValueOnce(new HttpError(403, '请先购买该资源后再下载'))
    await wrapper.findAll('.resource-detail-page__version-download')[0]?.trigger('click')
    await flushPromises()

    expect(mocks.createPurchase).toHaveBeenCalledTimes(1)
    const payload = mocks.createPurchase.mock.calls[0]?.[2] as Record<string, unknown>
    expect(payload).toMatchObject({ version_id: 504 })
    expect(wrapper.get('.resource-purchase-modal__amount').text()).toContain('¥1.00')
  })

  it('全免费资源（没有任何可购版本）主按钮仍是下载', async () => {
    const wrapper = await mountPanel(resourceFixture(), [
      versionFixture({ id: 505, price_fen: 0, purchasable: false }),
      olderVersionFixture({ id: 506, price_fen: 0, purchasable: false }),
    ])

    expect(wrapper.get('.resource-detail-page__price-pill').text()).toBe('免费')
    expect(wrapper.get('.resource-detail-page__primary-btn').text()).toBe('下载最新版本')
    await wrapper.get('.resource-detail-page__primary-btn').trigger('click')
    await flushPromises()
    expect(mocks.triggerDownload).toHaveBeenCalledTimes(1)
    expect(mocks.createPurchase).not.toHaveBeenCalled()
  })
})
