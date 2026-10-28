import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 「发布资源」创建页的挂载烟测：关键区块在该出现的地方出现，提交动作的接口载荷逐字段正确。
 *
 * 视图已按 R047 拆成区块组件 + composable，shallowMount 会把区块也桩成空壳，
 * 所以这里把区块按真身渲染（与 devResourceApiTagless.spec.ts 同一写法），
 * 文字断言与载荷断言才打得到实处。资源 / 标签树夹具与编辑页用例共用一份。
 */
const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  route: { params: {} as Record<string, string>, query: {} as Record<string, unknown> },
  create: vi.fn(),
  get: vi.fn(),
  updateHomepage: vi.fn(),
  submitReview: vi.fn(),
  updateChannel: vi.fn(),
  uploadCover: vi.fn(),
  tagTree: vi.fn(),
  listMyTeams: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, resolve: () => ({ href: '/' }) }),
  useRoute: () => mocks.route,
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    token: 'test-token',
    username: 'dev_flow_03562487',
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
  createMcResource: mocks.create,
  getMcResource: mocks.get,
  updateMcResourceHomepage: mocks.updateHomepage,
  submitMcResourceReview: mocks.submitReview,
  updateResourceApiChannel: mocks.updateChannel,
  getResourceApiChannel: vi.fn(),
  uploadMcResourceCover: mocks.uploadCover,
}))
vi.mock('@/api/resourceTags', () => ({
  getProcessedTagTree: mocks.tagTree,
  invalidateTagTreeCache: vi.fn(),
  getResourceDetailSlug: () => 'slug',
}))
vi.mock('@/api/team', () => ({
  listMyTeams: mocks.listMyTeams,
}))

import DevResourceInitView from '@/views/DevResourceInitView.vue'
import {
  channelFixture,
  resourceFixture,
  state,
  tagTreeFixture,
} from '@/__tests__/devResourceHomepageFixtures'

function mountInit(props: { kind?: 'normal' | 'api' } = {}): VueWrapper {
  return shallowMount(DevResourceInitView, {
    props,
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        WorkbenchBarSlot: { name: 'WorkbenchBarSlot', template: '<div><slot /></div>' },
        TCard: { name: 'TCard', template: '<div><slot /></div>' },
        // 默认桩只渲染空壳，按钮文案进不了 wrapper.text()；把前缀图标槽与默认槽都透出来
        TButton: { name: 'TButton', template: '<button><slot name="prefix" /><slot /></button>' },
        // 区块按真身渲染，里面的 ui_73info 组件仍是桩
        ResourceInitMetaStrip: false,
        ResourceInitBasicInfoSection: false,
        ResourceApiChannelSection: false,
        ResourceTagCatalogSection: false,
        ResourceInitSubmitBar: false,
        ResourceSecretPlainDialog: false,
      },
    },
  })
}

type InitState = {
  form: Record<string, unknown>
  canSubmit: boolean
  selectedTagIdsByGroup: Record<number, number[]>
  submitResource: (mode: 'private' | 'public') => Promise<void>
}

describe('DevResourceInitView：区块渲染与提交载荷', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.route = { params: {}, query: {} }
    mocks.tagTree.mockResolvedValue(tagTreeFixture())
    mocks.listMyTeams.mockResolvedValue([])
    mocks.create.mockResolvedValue(resourceFixture({ id: 33 }))
    mocks.get.mockResolvedValue(resourceFixture({ id: 33 }))
    mocks.uploadCover.mockResolvedValue(resourceFixture({ id: 33 }))
    mocks.updateHomepage.mockResolvedValue(resourceFixture({ id: 33, visibility: 'review' }))
    mocks.submitReview.mockResolvedValue(resourceFixture({ id: 33, visibility: 'review' }))
    mocks.updateChannel.mockResolvedValue(channelFixture({ resource_id: 33 }))
  })

  it('普通资源：渲染基础信息与标签归类，不渲染接口配置', async () => {
    const wrapper = mountInit()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('基础信息')
    expect(text).toContain('标签归类')
    expect(text).toContain('创建私有项目')
    expect(text).toContain('发布公开项目')
    expect(text).not.toContain('接口资源接入配置')
    wrapper.unmount()
  })

  it('接口资源：渲染接口配置，不渲染标签归类与公开申请', async () => {
    const wrapper = mountInit({ kind: 'api' })
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('基础信息')
    expect(text).toContain('接口资源接入配置')
    expect(text).toContain('创建接口')
    expect(text).not.toContain('标签归类')
    expect(text).not.toContain('发布公开项目')
    wrapper.unmount()
  })

  it('普通资源提交：创建请求逐字段正确', async () => {
    const wrapper = mountInit()
    await flushPromises()
    const view = state<InitState>(wrapper)

    view.form.title = '示例资源'
    view.form.author = '开发者'
    view.form.originType = 'repost'
    view.form.originUrl = 'https://example.com/source'
    view.form.originAuthor = '原作者'
    view.form.priceYuan = '9.90'
    view.form.copyrightDeclared = true
    view.selectedTagIdsByGroup[28] = [210]
    await flushPromises()

    expect(view.canSubmit).toBe(true)
    await view.submitResource('private')
    await flushPromises()

    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create).toHaveBeenCalledWith('test-token', {
      platform: '手绘',
      title: '示例资源',
      author: '开发者',
      description: '手绘 · 手绘资源，已选择 1 个标签。',
      tag_selections: [{ group_id: 28, tag_ids: [210] }],
      file_name: 'resource.package',
      source_url: 'pending://resource/手绘/hand/resource',
      cover_url: null,
      docs_url: null,
      visibility: 'draft',
      release_note: null,
      ownership_type: 'individual',
      team_id: null,
      origin_type: 'repost',
      origin_author: '原作者',
      origin_url: 'https://example.com/source',
      origin_org: null,
      origin_note: null,
      // 契约的写入口是买断价 `buyout_price_fen`（`price_fen` 只是后端兼容的旧名）
      buyout_price_fen: 990,
      price_points: 0,
      copyright_declared: true,
      resource_kind: 'normal',
      promo_share_bps: 0,
    })
    // 私有项目不动主页；创建成功后回资源列表
    expect(mocks.updateHomepage).not.toHaveBeenCalled()
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'dev-resource-list' })
    wrapper.unmount()
  })

  it('公开申请：提交审核走契约的 submit-review 端点，不再用 PATCH 重发整页字段', async () => {
    const wrapper = mountInit()
    await flushPromises()
    const view = state<InitState>(wrapper)

    view.form.title = '示例资源'
    view.form.author = '开发者'
    view.form.priceYuan = '9.90'
    view.form.copyrightDeclared = true
    view.selectedTagIdsByGroup[28] = [210]
    await flushPromises()

    await view.submitResource('public')
    await flushPromises()

    expect(mocks.submitReview).toHaveBeenCalledWith('test-token', 33)
    expect(mocks.updateHomepage).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('接口资源提交：不提交标签、只走现金价，渠道配置载荷逐字段正确', async () => {
    const wrapper = mountInit({ kind: 'api' })
    await flushPromises()
    const view = state<InitState>(wrapper)

    view.form.title = '接口示例'
    view.form.author = '开发者'
    view.form.apiCallbackUrl = ' https://shop.example.com/cb '
    view.form.apiAllowedOrigins = 'https://shop.example.com'
    view.form.apiRepeatPurchasable = true
    await flushPromises()

    expect(view.canSubmit).toBe(true)
    await view.submitResource('private')
    await flushPromises()

    expect(mocks.create).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({
        platform: '接口资源',
        title: '接口示例',
        description: '接口资源，原创。',
        tag_selections: [],
        resource_kind: 'api',
        origin_type: 'original',
        price_points: 0,
      }),
    )
    // 契约的渠道 PUT 收回调地址 / 密钥 / 允许来源 / 重复购买
    expect(mocks.updateChannel).toHaveBeenCalledWith('test-token', 33, {
      callback_url: 'https://shop.example.com/cb',
      callback_secret: null,
      allowed_origins: ['https://shop.example.com'],
      repeat_purchasable: true,
    })
    wrapper.unmount()
  })
})
