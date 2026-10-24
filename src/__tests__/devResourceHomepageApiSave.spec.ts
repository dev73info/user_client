import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 接口资源（R028）的保存链路：**主页 PATCH → 渠道 PUT**。
 *
 * 这条链有三处容易坏：接口资源不该带标签、积分价必须恒为 0、来源类型固定原创；
 * 以及「主页存住之后才 PUT 渠道」这个顺序——渠道失败时下一次保存只重发渠道这一半
 * （重试口径见 `useResourceApiChannel`）。本文件盯前三条与 PUT 的载荷；
 * 主页载荷的通用口径在 `devResourceHomepageSave.spec.ts` 里逐字段断言过。
 */
const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  route: {
    params: {} as Record<string, string>,
    query: {} as Record<string, unknown>,
    fullPath: '',
  },
  getResource: vi.fn(),
  updateHomepage: vi.fn(),
  uploadCover: vi.fn(),
  getChannel: vi.fn(),
  updateChannel: vi.fn(),
  tagTree: vi.fn(),
  listMyTeams: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    back: mocks.back,
    resolve: () => ({ href: '/' }),
  }),
  useRoute: () => mocks.route,
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    token: 'test-token',
    username: 'dev_flow_03562487',
    // 接口资源要签过《接口使用协议》才允许保存（存量资源补签前的闸门）
    apiUsageAgreementSigned: true,
    hydrate: vi.fn(),
  }),
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
vi.mock('@/api/mcResources', () => ({
  getMcResource: mocks.getResource,
  getResourceApiChannel: mocks.getChannel,
  uploadMcResourceCover: mocks.uploadCover,
  updateMcResourceHomepage: mocks.updateHomepage,
  updateResourceApiChannel: mocks.updateChannel,
}))
vi.mock('@/api/resourceTags', () => ({
  getProcessedTagTree: mocks.tagTree,
  invalidateTagTreeCache: vi.fn(),
  getTagRouteSlug: (name: string) => (name.trim() ? `tag-${name.trim()}` : ''),
}))
vi.mock('@/api/team', () => ({
  listMyTeams: mocks.listMyTeams,
  getTeamDetail: vi.fn(),
}))
vi.mock('@/config/runtime', () => ({
  buildUnifiedAuthUrl: () => '/login',
}))

import type { McResourcePayload } from '@/api/mcResources'
import DevResourceHomepageEditView from '@/views/DevResourceHomepageEditView.vue'
import {
  channelFixture,
  resourceFixture,
  savedPayload,
  state,
  tagTreeFixture,
  type HomepageEditState,
} from './devResourceHomepageFixtures'

function mountEdit(payload: McResourcePayload): VueWrapper {
  mocks.route = {
    params: { resourceId: String(payload.id) },
    query: {},
    fullPath: `/dev/resources/${payload.id}/homepage`,
  }
  mocks.getResource.mockResolvedValue(payload)
  mocks.updateHomepage.mockResolvedValue(payload)
  return shallowMount(DevResourceHomepageEditView, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        WorkbenchBarSlot: { name: 'WorkbenchBarSlot', template: '<div><slot /></div>' },
        // 见 devResourceHomepageSave.spec.ts 同名桩的注释：不加 setContent，加载会停在半路。
        ResourcePageContentSection: {
          name: 'ResourcePageContentSection',
          template: '<div />',
          methods: { setContent: () => {} },
        },
        TLoading: { name: 'TLoading', template: '<div><slot /></div>' },
        TCard: { name: 'TCard', template: '<div><slot /></div>' },
      },
    },
  })
}

/** 接口资源：没有标签归类、没有积分购，草稿态允许先不填现金价。 */
function apiResourceFixture(part: Partial<McResourcePayload> = {}): McResourcePayload {
  return resourceFixture({
    resource_kind: 'api',
    origin_type: 'repost',
    tag_selections: [],
    price_fen: 0,
    price_points: 0,
    copyright_declared: false,
    promo_share_bps: 0,
    ...part,
  })
}

describe('DevResourceHomepageEditView：接口资源的保存链路', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tagTree.mockResolvedValue(tagTreeFixture())
    mocks.listMyTeams.mockResolvedValue([])
    mocks.getChannel.mockResolvedValue(channelFixture())
    mocks.updateChannel.mockResolvedValue(channelFixture())
  })

  it('主页载荷：不带标签、积分恒 0、来源固定原创', async () => {
    const wrapper = mountEdit(apiResourceFixture())
    await flushPromises()
    const view = state<HomepageEditState>(wrapper)

    await view.saveHomepage()
    await flushPromises()

    const payload = savedPayload(mocks.updateHomepage)
    expect(payload.tag_selections).toEqual([])
    expect(payload.price_points).toBe(0)
    expect(payload.origin_type).toBe('original')
    expect(payload.promo_share_bps).toBe(0)
    wrapper.unmount()
  })

  it('主页存住后再 PUT 渠道配置（密钥留空 = 不改）', async () => {
    const wrapper = mountEdit(apiResourceFixture())
    await flushPromises()
    const view = state<HomepageEditState>(wrapper)

    await view.saveHomepage()
    await flushPromises()

    // 契约的渠道 PUT 只收三项（回调地址 / 密钥 / 允许来源），没有「重复购买」与资源类别
    expect(mocks.updateChannel).toHaveBeenCalledWith('test-token', 158100, {
      callback_url: 'https://shop.example.com/73info/callback',
      callback_secret: null,
      allowed_origins: ['https://shop.example.com'],
    })
    // 顺序：先主页、后渠道
    expect(mocks.updateHomepage.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateChannel.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
    wrapper.unmount()
  })

  it('渠道 PUT 失败：提示「主页已保存、渠道未成功」，并把下次保存切到只重发渠道', async () => {
    mocks.updateChannel.mockRejectedValueOnce(new Error('回调地址无法访问'))
    const wrapper = mountEdit(apiResourceFixture())
    await flushPromises()
    const view = state<HomepageEditState>(wrapper)

    await view.saveHomepage()
    await flushPromises()

    expect(mocks.toast).toHaveBeenCalledWith(
      '资源主页已保存，但接口资源渠道配置未保存成功：回调地址无法访问。请修正后重试，重试只会重发渠道配置。',
      'error',
    )
    // 成功提示不该出现（渠道这一半没成）
    expect(mocks.toast).not.toHaveBeenCalledWith('资源主页已更新', 'success')

    // 再点一次保存：只重发渠道，不重复 PATCH 主页
    await view.saveHomepage()
    await flushPromises()
    expect(mocks.updateHomepage).toHaveBeenCalledTimes(1)
    expect(mocks.updateChannel).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('现金价与积分价同时大于 0：拦在本地，不发请求', async () => {
    const wrapper = mountEdit(resourceFixture())
    await flushPromises()
    const view = state<HomepageEditState>(wrapper)

    view.form.pricePoints = '10'

    await view.saveHomepage()
    await flushPromises()

    expect(mocks.updateHomepage).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('现金售价与积分售价不能同时大于 0', 'warning')
    wrapper.unmount()
  })
})
