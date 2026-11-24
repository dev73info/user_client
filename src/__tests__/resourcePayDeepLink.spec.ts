import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PublicMcResourceVersionItem } from '@/api/resources'
import { publicResourceFixture } from '@/__tests__/homeSpotlightFixtures'

/**
 * 支付深链 `?pay=wechat|alipay`。钉两件事：
 * 1. **只认渠道，不认身份**：地址里的 `token` / `open_id` / `ticket` 不参与判定，
 *    下单令牌只取当前登录会话（防「开发者把别人的认证塞进链接」）。
 * 2. **只在确实要买时拉起**：免费 / 已购 / 积分 / 接口资源只摘参数不弹窗；
 *    未登录先弹登录并保留参数，登录回来继续；拉起后参数从地址上摘掉，刷新不重复下单。
 */

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  toast: vi.fn(),
  getResource: vi.fn(),
  listVersions: vi.fn(),
  listComments: vi.fn(),
  createPurchase: vi.fn(),
}))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive({
    name: 'resource-catalog',
    path: '/resources',
    fullPath: '/resources?resource=7',
    hash: '',
    params: {},
    query: {} as Record<string, unknown>,
  })
  return { useRoute: () => route, useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }
})

vi.mock('@/stores/auth', async () => {
  const { reactive } = await import('vue')
  const auth = reactive({
    token: '',
    username: '',
    isAuthed: false,
    hydrate: vi.fn(),
    logout: vi.fn(),
  })
  return { useAuthStore: () => auth }
})

vi.mock('@/stores/download', () => ({
  useDownloadStore: () => ({ state: { active: false, percent: 0, fileName: '' } }),
}))
vi.mock('@/composables/useResourceDownload', () => ({
  useResourceDownload: () => ({ triggerDownload: vi.fn() }),
}))
vi.mock('@/composables/useCodeBlockCopy', () => ({ useCodeBlockCopy: () => ({}) }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn() } }))

vi.mock('@/composables/useResourcePayment', async () => {
  const { ref } = await import('vue')
  return {
    useResourcePayment: () => ({
      order: ref(null),
      qrDataUrl: ref(''),
      countdownText: ref(''),
      generation: ref(0),
      stopPoll: vi.fn(),
      invalidateSurface: vi.fn(),
      markSurfaceShown: vi.fn(),
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
  getResourceWechatAuthUrl: vi.fn(),
}))
vi.mock('@/api/adapay', () => ({ getAdapayClientPlatform: () => 'pc' }))

vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast =
    (type: string) =>
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

import { useRoute } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import ResourceDetailPanel from '@/components/ResourceDetailPanel.vue'

const route = useRoute() as unknown as { fullPath: string; query: Record<string, unknown> }
const auth = useAuthStore() as unknown as { token: string; username: string; isAuthed: boolean }

async function mountWith(options: {
  query: Record<string, unknown>
  resource?: Record<string, unknown>
  versions?: PublicMcResourceVersionItem[]
  authed?: boolean
}) {
  route.query = options.query
  route.fullPath = `/resources?${new URLSearchParams(
    Object.entries(options.query).map(([key, value]) => [key, String(value)]),
  ).toString()}`
  auth.token = options.authed ? 'session-token' : ''
  auth.username = options.authed ? 'buyer' : ''
  auth.isAuthed = Boolean(options.authed)
  mocks.getResource.mockResolvedValue(publicResourceFixture({ id: 7, ...options.resource }))
  mocks.listVersions.mockResolvedValue(options.versions ?? [])
  const wrapper = mount(ResourceDetailPanel, {
    props: { resourceId: 7 },
    global: { stubs: { teleport: true, 'router-link': { template: '<a><slot /></a>' } } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  mocks.push.mockReset()
  mocks.replace.mockReset()
  mocks.toast.mockReset()
  mocks.getResource.mockReset()
  mocks.listVersions.mockReset().mockResolvedValue([])
  mocks.listComments.mockReset().mockResolvedValue([])
  mocks.createPurchase.mockReset().mockResolvedValue({
    order_no: 'RPO-DEEP',
    status: 'pending',
    resource_id: 7,
    pay_channel: 'alipay',
    pay_url: 'https://pay.example/qr',
    amount_fen: 9900,
    amount_points: 0,
  })
})

describe('资源详情面板的 ?pay= 支付深链', () => {
  it('已登录点开支付宝深链：按 alipay 下单，并把 pay 从地址上摘掉', async () => {
    const wrapper = await mountWith({
      query: { resource: '7', sale: 'paid', pay: 'alipay' },
      resource: { buyout_price_fen: 9900, price_fen: 9900 },
      authed: true,
    })

    expect(mocks.createPurchase).toHaveBeenCalledTimes(1)
    expect(mocks.createPurchase.mock.calls[0]?.[0]).toBe('session-token')
    expect(mocks.createPurchase.mock.calls[0]?.[2]).toMatchObject({ pay_channel: 'alipay' })
    expect(mocks.replace).toHaveBeenCalledWith({ query: { resource: '7', sale: 'paid' } })
    wrapper.unmount()
  })

  it('未登录：只弹登录并保留 pay（回跳继续），不下单、不摘参数', async () => {
    const wrapper = await mountWith({
      query: { resource: '7', pay: 'wechat' },
      resource: { buyout_price_fen: 9900, price_fen: 9900 },
      authed: false,
    })

    expect(mocks.createPurchase).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push.mock.calls[0]?.[0]).toMatchObject({
      query: {
        resource: '7',
        pay: 'wechat',
        modal: 'auth',
        mode: 'login',
        redirect_to: '/resources?resource=7&pay=wechat',
      },
    })
    wrapper.unmount()
  })

  it('登录回跳后继续这次意图：令牌变可用就按原渠道下单', async () => {
    const wrapper = await mountWith({
      query: { resource: '7', pay: 'alipay' },
      resource: { buyout_price_fen: 9900, price_fen: 9900 },
      authed: false,
    })
    expect(mocks.createPurchase).not.toHaveBeenCalled()

    auth.token = 'session-token'
    auth.isAuthed = true
    await flushPromises()

    expect(mocks.createPurchase).toHaveBeenCalledTimes(1)
    expect(mocks.createPurchase.mock.calls[0]?.[2]).toMatchObject({ pay_channel: 'alipay' })
    expect(mocks.replace).toHaveBeenCalledWith({ query: { resource: '7' } })
    wrapper.unmount()
  })

  it.each([
    ['免费资源', { buyout_price_fen: 0, price_fen: 0 }],
    ['已购资源', { buyout_price_fen: 9900, price_fen: 9900, purchased_by_me: true }],
    ['积分资源', { buyout_price_fen: 0, price_fen: 0, price_points: 500 }],
    ['接口资源', { buyout_price_fen: 9900, price_fen: 9900, resource_kind: 'api' }],
  ])('%s：不弹窗、不下单，只把 pay 摘掉', async (_label, resource) => {
    const wrapper = await mountWith({
      query: { resource: '7', pay: 'alipay' },
      resource,
      authed: true,
    })

    expect(mocks.createPurchase).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith({ query: { resource: '7' } })
    wrapper.unmount()
  })

  it('按版本售卖：用最低价可购版本下单，渠道仍按地址偏好', async () => {
    const versions = [
      {
        id: 11,
        resource_id: 7,
        version: 'v1.0',
        resource: '/a.zip',
        note: '',
        creator: 'alice',
        created_at: '2026-01-01 00:00:00',
        is_current: true,
        price_fen: 500,
        purchasable: true,
      },
    ] as unknown as PublicMcResourceVersionItem[]
    const wrapper = await mountWith({
      query: { resource: '7', pay: 'alipay' },
      resource: { buyout_price_fen: 0, price_fen: 0 },
      versions,
      authed: true,
    })

    expect(mocks.createPurchase.mock.calls[0]?.[2]).toMatchObject({
      pay_channel: 'alipay',
      version_id: 11,
    })
    wrapper.unmount()
  })

  it('地址里塞身份参数一律不认：下单令牌只取当前登录会话', async () => {
    const wrapper = await mountWith({
      query: {
        resource: '7',
        pay: 'alipay',
        open_id: 'attacker-open-id',
        ticket: 'attacker-ticket',
      },
      resource: { buyout_price_fen: 9900, price_fen: 9900 },
      authed: true,
    })

    expect(mocks.createPurchase.mock.calls[0]?.[0]).toBe('session-token')
    wrapper.unmount()
  })

  it('非法渠道值不触发任何支付动作', async () => {
    const wrapper = await mountWith({
      query: { resource: '7', pay: 'points' },
      resource: { buyout_price_fen: 9900, price_fen: 9900 },
      authed: true,
    })

    expect(mocks.createPurchase).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
