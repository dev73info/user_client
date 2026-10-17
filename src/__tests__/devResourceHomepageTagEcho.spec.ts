import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 编辑资源主页页载入时，「根节点 / 二级节点」下拉与标签组要回显**该资源实际的归类**。
 *
 * 之前的实现只用 `resource.platform` 去匹配二级节点名：资源平台是根节点名（或与二级节点名
 * 对不上）时匹配不到，下拉就停在标签树的首个根节点上，标签组也跟着显示错分区。
 * 资源实际归类在 `tag_selections[].group_path`（`['美术', '手绘', '类型']`）里，它才是准的。
 *
 * 另一半是「兜底只用于展示」：归类在树里彻底找不到时，下拉只能回落到首项展示，
 * 但**保存不能把回落出来的分区写回去**——打开编辑页什么都不改直接保存，资源的归类要原样保留。
 */
const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  route: { params: {} as Record<string, string>, query: {} as Record<string, unknown> },
  getResource: vi.fn(),
  updateHomepage: vi.fn(),
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
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ showToast: mocks.toast }),
}))
vi.mock('@/api/mcResources', () => ({
  getMcResource: mocks.getResource,
  getResourceApiChannel: vi.fn(),
  uploadMcResourceCover: vi.fn(),
  updateMcResourceHomepage: mocks.updateHomepage,
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

import type {
  CreateMcResourceTagSelection,
  McResourcePayload,
  McResourceTagSelectionPayload,
  UpdateMcResourceHomepageRequest,
} from '@/api/mcResources'
import type { McProcessedTagTree } from '@/api/resourceTags'
import DevResourceHomepageEditView from '@/views/DevResourceHomepageEditView.vue'

function resourceFixture(part: Partial<McResourcePayload> = {}): McResourcePayload {
  return {
    id: 158100,
    creator: 'dev_flow_03562487',
    ownership_type: 'individual',
    team_id: null,
    requirement_id: null,
    platform: '手绘',
    title: '示例资源',
    author: '开发者',
    description: '美术 · 手绘资源，已选择 2 个标签。',
    tag_selections: [],
    file_name: 'example.package',
    source_url: 'pending://resource/手绘/handdraw/example',
    cover_url: null,
    docs_url: null,
    visibility: 'draft',
    release_note: null,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    price_fen: 0,
    price_points: 0,
    copyright_declared: false,
    resource_kind: 'normal',
    promo_share_bps: 0,
    created_at: '2026-10-18 06:00:00',
    updated_at: '2026-10-18 06:00:00',
    ...part,
  }
}

/** 美术 / 手绘 这条树上的两个标签组，与线上标签树同构。 */
function artworkSelections(): McResourceTagSelectionPayload[] {
  return [
    {
      group_id: 28,
      group_name: '类型',
      group_path: ['美术', '手绘', '类型'],
      tag_ids: [210],
      tag_names: ['VOCALOID'],
    },
    {
      group_id: 29,
      group_name: '风格技法',
      group_path: ['美术', '手绘', '风格技法'],
      tag_ids: [220],
      tag_names: ['厚涂'],
    },
  ]
}

/** 两个根节点的最小标签树：首个根是 Minecraft专区，资源要落到第二个根「美术」下。 */
function tagTreeFixture(): McProcessedTagTree {
  return {
    roots: [
      {
        key: 'minecraft',
        label: 'Minecraft专区',
        first_entry_key: 'java',
        entries: [
          {
            key: 'java',
            group_name: 'Java 版',
            platform: 'Java 版',
            label: 'Java 版',
            path_label: 'Minecraft专区 / Java 版',
            icon: '',
            publish_groups: [
              {
                key: 'g4',
                group_id: 4,
                group_name: '适用端',
                group_alias: 'group-3',
                group_path: ['Java 版', '适用端'],
                group_path_aliases: ['group-2', 'group-3'],
                label: 'Java 版 / 适用端',
                depth: 0,
                items: [{ id: 2, name: '客户端', alias: 'client' }],
              },
            ],
          },
        ],
      },
      {
        key: 'group-14',
        label: '美术',
        first_entry_key: 'group-15',
        entries: [
          {
            key: 'group-15',
            group_name: '手绘',
            platform: '手绘',
            label: '手绘',
            path_label: '美术 / 手绘',
            icon: '',
            publish_groups: [
              {
                key: 'g28',
                group_id: 28,
                group_name: '类型',
                group_alias: 'group-16',
                group_path: ['手绘', '类型'],
                group_path_aliases: ['group-15', 'group-16'],
                label: '手绘 / 类型',
                depth: 0,
                items: [{ id: 210, name: 'VOCALOID', alias: 'tag-160' }],
              },
              {
                key: 'g29',
                group_id: 29,
                group_name: '风格技法',
                group_alias: 'tag-164',
                group_path: ['手绘', '风格技法'],
                group_path_aliases: ['group-15', 'tag-164'],
                label: '手绘 / 风格技法',
                depth: 1,
                items: [{ id: 220, name: '厚涂', alias: 'tag-165' }],
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
  mocks.updateHomepage.mockResolvedValue(payload)
  return shallowMount(DevResourceHomepageEditView, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        WorkbenchBarSlot: { name: 'WorkbenchBarSlot', template: '<div><slot /></div>' },
        TLoading: { name: 'TLoading', template: '<div><slot /></div>' },
        TCard: { name: 'TCard', template: '<div><slot /></div>' },
      },
    },
  })
}

type EditState = {
  currentRootKey: string
  currentEntryKey: string
  currentRootLabel: string
  currentEntryLabel: string
  tagPathResolved: boolean
  keepSavedTags: boolean
  selectedTagCount: number
  selectedTagIdsByGroup: Record<number, number[]>
  buildTagSelections: () => CreateMcResourceTagSelection[]
  saveHomepage: () => Promise<void>
  selectRoot: (value: string) => void
}

function state<T>(wrapper: VueWrapper): T {
  return (wrapper.vm.$ as unknown as { setupState: T }).setupState
}

describe('DevResourceHomepageEditView：根节点 / 二级节点按资源实际归类回显', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tagTree.mockResolvedValue(tagTreeFixture())
    mocks.listMyTeams.mockResolvedValue([])
  })

  it('资源平台是根节点名时，仍按 tag_selections 的 group_path 定位到「美术 / 手绘」', async () => {
    const wrapper = mountEdit(
      resourceFixture({ platform: '美术', tag_selections: artworkSelections() }),
    )
    await flushPromises()
    const view = state<EditState>(wrapper)

    expect(view.currentRootKey).toBe('group-14')
    expect(view.currentRootLabel).toBe('美术')
    expect(view.currentEntryKey).toBe('group-15')
    expect(view.currentEntryLabel).toBe('手绘')
    expect(view.tagPathResolved).toBe(true)
    expect(view.keepSavedTags).toBe(false)
    // 标签组按资源实际勾选回显，不是空
    expect(view.selectedTagCount).toBe(2)
    expect(view.selectedTagIdsByGroup[28]).toEqual([210])
    expect(view.buildTagSelections()).toEqual([
      { group_id: 28, tag_ids: [210] },
      { group_id: 29, tag_ids: [220] },
    ])
    wrapper.unmount()
  })

  it('资源平台与二级节点名一致时行为不变（platform = 手绘）', async () => {
    const wrapper = mountEdit(resourceFixture({ tag_selections: artworkSelections() }))
    await flushPromises()
    const view = state<EditState>(wrapper)

    expect(view.currentEntryKey).toBe('group-15')
    expect(view.selectedTagCount).toBe(2)
    wrapper.unmount()
  })

  it('归类在树里找不到：下拉回落到首个根节点展示，但保存原样提交资源原有归类', async () => {
    const orphanSelections: McResourceTagSelectionPayload[] = [
      {
        group_id: 99,
        group_name: '已删除二级',
        group_path: ['美术', '已删除二级', '类型'],
        tag_ids: [901],
        tag_names: ['某个标签'],
      },
    ]
    const wrapper = mountEdit(
      resourceFixture({ platform: '已删除平台', tag_selections: orphanSelections }),
    )
    await flushPromises()
    const view = state<EditState>(wrapper)

    // 展示回落：停在标签树首个根节点（下拉本身也要有值，不能空成占位符）
    expect(view.currentRootLabel).toBe('Minecraft专区')
    expect(view.currentEntryLabel).toBe('Java 版')
    expect(view.currentRootKey).toBe('minecraft')
    expect(view.currentEntryKey).toBe('java')
    expect(view.tagPathResolved).toBe(false)
    expect(view.keepSavedTags).toBe(true)
    expect(view.selectedTagCount).toBe(0)

    // 什么都不改直接保存：归类原样带回，没被回落项顶掉
    await view.saveHomepage()
    await flushPromises()
    const payload = mocks.updateHomepage.mock
      .calls[0]?.[2] as unknown as UpdateMcResourceHomepageRequest
    expect(payload.tag_selections).toEqual([{ group_id: 99, tag_ids: [901] }])
    // 标签必填也没有拦住这次保存
    expect(mocks.toast).not.toHaveBeenCalledWith('请至少选择一个标签', 'warning')
    wrapper.unmount()
  })

  it('回落状态下开发者自己勾了标签：按他勾的提交，不再保留旧归类', async () => {
    const orphanSelections: McResourceTagSelectionPayload[] = [
      {
        group_id: 99,
        group_name: '已删除二级',
        group_path: ['美术', '已删除二级', '类型'],
        tag_ids: [901],
        tag_names: ['某个标签'],
      },
    ]
    const wrapper = mountEdit(
      resourceFixture({ platform: '已删除平台', tag_selections: orphanSelections }),
    )
    await flushPromises()
    const view = state<EditState>(wrapper)

    view.selectedTagIdsByGroup[4] = [2]
    await flushPromises()

    expect(view.buildTagSelections()).toEqual([{ group_id: 4, tag_ids: [2] }])
    wrapper.unmount()
  })

  it('切换根节点时二级节点落到新根的首个二级节点，不留上一个根的 key', async () => {
    const wrapper = mountEdit(resourceFixture({ tag_selections: artworkSelections() }))
    await flushPromises()
    const view = state<EditState>(wrapper)

    expect(view.currentRootKey).toBe('group-14')
    expect(view.currentEntryKey).toBe('group-15')

    view.selectRoot('minecraft')
    await flushPromises()

    expect(view.currentRootKey).toBe('minecraft')
    expect(view.currentEntryKey).toBe('java')
    // 开发者手选的归类就是本次提交的归类
    expect(view.tagPathResolved).toBe(true)
    wrapper.unmount()
  })
})
