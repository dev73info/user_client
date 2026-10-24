import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * R028：接口资源不选标签归类、不属于任何根节点 / 二级节点，一律按「原创」归类。
 *
 * 创建页（DevResourceInitView）的入口分两条、类别由路由 props 决定，已有
 * `devResourceCreateEntry.spec.ts` 盯着；这里盯编辑页（DevResourceHomepageEditView）：
 * 类别是表单里可切换的字段（`resource_kind`），所以同一页要在两种类别间表现不同——
 * 接口资源隐藏「标签归类」整块与「类型」选择、不提交任何标签、提交 origin_type=original。
 *
 * 走 shallowMount + setupState 调函数的写法（与 devResourceCreateEntry.spec.ts 一致）：
 * ui_73info 的下拉面板会 Teleport 到 body，真挂载去点菜单反而更脆。
 */
const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  route: { params: {} as Record<string, string>, query: {} as Record<string, unknown> },
  getResource: vi.fn(),
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
  getResourceApiChannel: vi.fn(),
  uploadMcResourceCover: vi.fn(),
  updateMcResourceHomepage: vi.fn(),
  updateResourceApiChannel: vi.fn(),
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

import type { CreateMcResourceTagSelection, McResourcePayload } from '@/api/mcResources'
import type { McProcessedTagTree } from '@/api/resourceTags'
import DevResourceHomepageEditView from '@/views/DevResourceHomepageEditView.vue'

function resourceFixture(part: Partial<McResourcePayload> = {}): McResourcePayload {
  return {
    id: 12,
    creator: 'dev_flow_03562487',
    ownership_type: 'individual',
    team_id: null,
    requirement_id: null,
    platform: '接口资源',
    title: '示例资源',
    author: '开发者',
    description: '简介',
    tag_selections: [],
    file_name: 'example.package',
    source_url: 'pending://resource/api/example',
    cover_url: null,
    docs_url: null,
    visibility: 'draft',
    release_note: null,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    buyout_price_fen: 0,
    price_fen: 0,
    price_points: 0,
    copyright_declared: false,
    resource_kind: 'normal',
    promo_share_bps: 0,
    created_at: '2026-10-11 09:00:00',
    updated_at: '2026-10-11 09:00:00',
    ...part,
  }
}

/** 一棵最小标签树：一个根节点、一个二级节点、一组标签，供「普通资源仍要选标签」的对照用。 */
function tagTreeFixture(): McProcessedTagTree {
  return {
    roots: [
      {
        key: 'minecraft',
        label: 'Minecraft',
        first_entry_key: 'mods',
        entries: [
          {
            key: 'mods',
            group_name: '模组',
            platform: 'minecraft',
            label: 'Minecraft / 模组',
            path_label: 'Minecraft / 模组',
            icon: '',
            publish_groups: [
              {
                key: 'g1',
                group_id: 1,
                group_name: '分类',
                group_alias: 'category',
                group_path: ['Minecraft', '模组'],
                group_path_aliases: ['minecraft', 'mods'],
                label: 'Minecraft / 模组 / 分类',
                depth: 3,
                items: [
                  { id: 101, name: '战斗', alias: 'combat' },
                  { id: 102, name: '建筑', alias: 'build' },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
}

function mountEdit(payload: McResourcePayload): VueWrapper {
  mocks.route = { params: { resourceId: String(payload.id) }, query: {} }
  mocks.getResource.mockResolvedValue(payload)
  return shallowMount(DevResourceHomepageEditView, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        WorkbenchBarSlot: { name: 'WorkbenchBarSlot', template: '<div><slot /></div>' },
        // 这三层都要把插槽透出来，否则 shallowMount 的默认桩只渲染空壳，
        // 里面的文字进不了 wrapper.text()，按文字断言就成了永远为真的假绿。
        TButton: { name: 'TButton', template: '<button><slot name="prefix" /><slot /></button>' },
        TLoading: { name: 'TLoading', template: '<div><slot /></div>' },
        TCard: { name: 'TCard', template: '<div><slot /></div>' },
        // 页面区块已拆成子组件（components/dev/Resource*Section.vue）：shallowMount 默认会把它们
        // 也桩成空壳，那样「接口资源不该出现标签归类整块」就成了永远成立的假绿。
        // 这里让这些区块按真身渲染（它们内部的 ui_73info 组件仍是桩），文字断言才打得到实处。
        ResourceHomepageEditBar: false,
        ResourceBasicInfoSection: false,
        ResourceApiChannelSection: false,
        ResourceTagCatalogSection: false,
        ResourcePageContentSection: false,
        ResourceHomepagePreviewAside: false,
        // 「页面内容」区块按真身渲染后，它内部的 RichTextEditor 仍是桩；加载链路要调
        // `setContent` 回写发布说明，默认桩没有这个方法会抛错、把加载打断在半路。
        RichTextEditor: {
          name: 'RichTextEditor',
          template: '<div />',
          methods: { setContent: () => {} },
        },
      },
    },
  })
}

type EditState = {
  isApiKind: boolean
  effectiveOriginType: 'original' | 'repost'
  buildTagSelections: () => CreateMcResourceTagSelection[]
  form: { originType: 'original' | 'repost'; resourceKind: 'normal' | 'api' }
  selectedTagIdsByGroup: Record<number, number[]>
}

function state<T>(wrapper: VueWrapper): T {
  return (wrapper.vm.$ as unknown as { setupState: T }).setupState
}

describe('DevResourceHomepageEditView：接口资源按「原创」归类、不选标签归类', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tagTree.mockResolvedValue(tagTreeFixture())
    mocks.listMyTeams.mockResolvedValue([])
  })

  it('接口资源：不提交任何标签，且 origin_type 固定为 original', async () => {
    const wrapper = mountEdit(resourceFixture({ resource_kind: 'api', origin_type: 'original' }))
    await flushPromises()
    const view = state<EditState>(wrapper)

    expect(view.isApiKind).toBe(true)
    expect(view.effectiveOriginType).toBe('original')
    expect(view.buildTagSelections()).toEqual([])
    wrapper.unmount()
  })

  it('接口资源：模板里没有「标签归类」整块，也没有「类型」选择', async () => {
    const wrapper = mountEdit(resourceFixture({ resource_kind: 'api' }))
    await flushPromises()

    const text = wrapper.text()
    expect(text).not.toContain('标签归类')
    expect(text).not.toContain('二级节点')
    // 接口资源不进大厅、首页精选与公开搜索，没有对外主页，编辑页也不该有「页面内容」
    expect(text).not.toContain('页面内容')
    // 预览摘要画的是大厅资源卡，接口资源没有这张卡的落地页；那一侧的「预览」入口同理
    expect(text).not.toContain('预览摘要')
    expect(text).not.toContain('预览')
    // 预览入口是唯一指向用户端资源主页的链接，这里再按 href 兜一层：
    // 按钮文字将来改了，这条仍能拦住「接口资源带了预览入口」
    expect(wrapper.find('[href*="sale=paid"]').exists()).toBe(false)
    // 侧栏没了，栅格必须跟着收成单栏，不能留一条空的第二列
    expect(wrapper.find('.dev-resource-homepage-editor__layout--single').exists()).toBe(true)
    wrapper.unmount()
  })

  it('接口资源：即便表单里残留「转载」，也按 original 提交', async () => {
    const wrapper = mountEdit(resourceFixture({ resource_kind: 'api', origin_type: 'repost' }))
    await flushPromises()
    const view = state<EditState>(wrapper)

    // 回填时 form.originType 会跟着 payload 走，但接口资源一律 original
    view.form.originType = 'repost'
    await flushPromises()
    expect(view.effectiveOriginType).toBe('original')
    wrapper.unmount()
  })

  it('普通资源：仍然渲染「标签归类」，标签照常提交，类型跟随开发者选择', async () => {
    const wrapper = mountEdit(resourceFixture({ resource_kind: 'normal' }))
    await flushPromises()
    const view = state<EditState>(wrapper)

    expect(view.isApiKind).toBe(false)
    expect(wrapper.text()).toContain('标签归类')
    expect(wrapper.text()).toContain('页面内容')
    expect(wrapper.text()).toContain('预览摘要')

    view.form.originType = 'repost'
    await flushPromises()
    expect(view.effectiveOriginType).toBe('repost')

    // 选中一个标签后，标签选择要照常带出去（普通资源行为不变）
    view.selectedTagIdsByGroup[1] = [101]
    await flushPromises()
    expect(view.buildTagSelections()).toEqual([{ group_id: 1, tag_ids: [101] }])
    wrapper.unmount()
  })
})
