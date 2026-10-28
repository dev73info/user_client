import { flushPromises, mount, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 资源主页编辑页的核心链路：**回填 → 改表 → 保存**。
 *
 * 这页原来的用例只盯标签归类（`devResourceHomepageTagEcho`）与接口资源的区块取舍
 * （`devResourceApiTagless`），没有一个用例盯保存载荷本身。而「载荷逐字段正确」正是
 * 这一页最容易在重构里悄悄坏掉的东西：空串与 null 语义不同（清空封面必须空串）、
 * 金额要转分、分成比例整体下发（0 也要显式发）。
 *
 * 这里按浅挂载 + setupState 的写法直接断言 `updateMcResourceHomepage` 的第三个参数，
 * 一个字段一条 expectation，坏了能一眼看出是哪一格。
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
// resourceTags 顶层会 import tags-wasm；这里只用到标签树与 slug 两个入口，就地替掉。
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

function mountEdit(payload: McResourcePayload, deep = false): VueWrapper {
  mocks.route = {
    params: { resourceId: String(payload.id) },
    query: {},
    fullPath: `/dev/resources/${payload.id}/homepage`,
  }
  mocks.getResource.mockResolvedValue(payload)
  mocks.updateHomepage.mockResolvedValue(payload)
  return (deep ? mount : shallowMount)(DevResourceHomepageEditView, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        WorkbenchBarSlot: { name: 'WorkbenchBarSlot', template: '<div><slot /></div>' },
        // 「页面内容」区块 `defineExpose({ setContent })` 把回写能力露给保存链路；
        // 浅挂载的默认桩没有这个方法，加载时会抛「setContent is not a function」而停在半路。
        // 给桩补上它，加载才真的走完（回填与保存都在这条链上）。
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

describe('DevResourceHomepageEditView：回填与保存载荷', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tagTree.mockResolvedValue(tagTreeFixture())
    mocks.listMyTeams.mockResolvedValue([{ team_id: 77, name: '示例团队' }])
    mocks.getChannel.mockResolvedValue(channelFixture())
  })

  it('载入后把服务端字段逐项回填进表单（金额回元、比例回百分比）', async () => {
    const wrapper = mountEdit(resourceFixture())
    await flushPromises()
    const { form } = state<HomepageEditState>(wrapper)

    expect(form.title).toBe('示例资源')
    expect(form.author).toBe('开发者')
    expect(form.description).toBe('一套手绘笔刷与配套示例工程。')
    expect(form.cover_url).toBe('/uploads/cover-158100.png')
    expect(form.docs_url).toBe('https://docs.example.com/resource')
    expect(form.release_note).toBe('<p>首发版本</p>')
    expect(form.ownershipType).toBe('team')
    expect(form.teamId).toBe('77')
    expect(form.originType).toBe('repost')
    expect(form.originAuthor).toBe('原作者')
    expect(form.originUrl).toBe('https://origin.example.com/post/1')
    expect(form.originOrg).toBe('苦力怕论坛')
    expect(form.originNote).toBe('已获授权')
    // 1234 分 → 12.34 元；1000 万分比 → 10 %
    expect(form.priceYuan).toBe('12.34')
    expect(form.pricePoints).toBe('0')
    expect(form.promoSharePercent).toBe(10)
    expect(form.copyrightDeclared).toBe(true)
    expect(form.resourceKind).toBe('normal')
    wrapper.unmount()
  })

  it('保存时把每一项按口径写进 PATCH 载荷（去空白、空串与 null 各归各位）', async () => {
    const wrapper = mountEdit(resourceFixture())
    await flushPromises()
    const view = state<HomepageEditState>(wrapper)

    // 开发者改了几格：标题前后带空白、文档地址清空、分成关掉
    view.form.title = '  改过的标题  '
    view.form.docs_url = '  '
    view.form.promoSharePercent = 0

    await view.saveHomepage()
    await flushPromises()

    expect(mocks.updateHomepage).toHaveBeenCalledTimes(1)
    expect(mocks.updateHomepage.mock.calls[0]?.[0]).toBe('test-token')
    expect(mocks.updateHomepage.mock.calls[0]?.[1]).toBe(158100)
    expect(savedPayload(mocks.updateHomepage)).toEqual({
      title: '改过的标题',
      author: '开发者',
      description: '一套手绘笔刷与配套示例工程。',
      tag_selections: [{ group_id: 28, tag_ids: [210] }],
      // 没有选新文件时沿用已保存的封面地址（清空才传空串，null 会被后端当成没改）
      cover_url: '/uploads/cover-158100.png',
      docs_url: null,
      release_note: '<p>首发版本</p>',
      ownership_type: 'team',
      team_id: 77,
      origin_type: 'repost',
      origin_author: '原作者',
      origin_url: 'https://origin.example.com/post/1',
      origin_org: '苦力怕论坛',
      origin_note: '已获授权',
      // 契约的写入口是买断价 `buyout_price_fen`（`price_fen` 只是后端兼容的旧名）
      buyout_price_fen: 1234,
      price_points: 0,
      copyright_declared: true,
      // 0 也要显式下发：清空比例不能靠省略字段变成静默失效
      promo_share_bps: 0,
    })
    wrapper.unmount()
  })

  it('选了新图标：先传图，再用返回的地址当 cover_url，并清掉待上传文件', async () => {
    const wrapper = mountEdit(resourceFixture())
    await flushPromises()
    const view = state<HomepageEditState>(wrapper)

    const file = new File(['icon'], 'icon.png', { type: 'image/png' })
    view.formState.selectedCoverFile.value = file
    mocks.uploadCover.mockResolvedValue(resourceFixture({ cover_url: '/uploads/cover-new.png' }))

    await view.saveHomepage()
    await flushPromises()

    expect(mocks.uploadCover).toHaveBeenCalledWith('test-token', 158100, file)
    expect(savedPayload(mocks.updateHomepage).cover_url).toBe('/uploads/cover-new.png')
    // 保存成功后待上传文件被清掉，避免下一次保存重复上传
    expect(view.formState.selectedCoverFile.value).toBeNull()
    wrapper.unmount()
  })

  it('清空封面：传空串而不是 null（后端把 null 当「没改」）', async () => {
    const wrapper = mountEdit(resourceFixture())
    await flushPromises()
    const view = state<HomepageEditState>(wrapper)

    // 图标组件「移除」时回传空串，父级同时清掉已保存的封面地址
    view.form.cover_url = ''

    await view.saveHomepage()
    await flushPromises()

    expect(savedPayload(mocks.updateHomepage).cover_url).toBe('')
    wrapper.unmount()
  })

  it('免费资源也能在主页确认版权并保存，随后才能发布付费版本', async () => {
    const wrapper = mountEdit(
      resourceFixture({ buyout_price_fen: 0, price_points: 0, copyright_declared: false }),
      true,
    )
    await flushPromises()
    const view = state<HomepageEditState>(wrapper)
    const checkbox = wrapper.findComponent({ name: 'TCheckbox' })
    expect(checkbox.exists()).toBe(true)
    expect(view.form.copyrightDeclared).toBe(false)

    await checkbox.vm.$emit('update:modelValue', true)
    await flushPromises()
    expect(view.form.copyrightDeclared).toBe(true)
    await view.saveHomepage()

    expect(savedPayload(mocks.updateHomepage).copyright_declared).toBe(true)
    wrapper.unmount()
  })
})
