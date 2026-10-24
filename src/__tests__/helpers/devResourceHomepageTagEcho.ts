import { shallowMount, type VueWrapper } from '@vue/test-utils'
import type { Mock } from 'vitest'
import type {
  CreateMcResourceTagSelection,
  McResourcePayload,
  McResourceTagSelectionPayload,
} from '@/api/mcResources'
import type { McProcessedTagTree } from '@/api/resourceTags'
import DevResourceHomepageEditView from '@/views/DevResourceHomepageEditView.vue'

/**
 * 编辑资源主页页载入时，「根节点 / 二级节点」下拉与标签组要回显**该资源实际的归类**。
 *
 * 之前的实现只用 `resource.platform` 去匹配二级节点名：资源平台是根节点名（或与二级节点名
 * 对不上）时匹配不到，下拉就停在标签树的首个根节点上，标签组也跟着显示错分区。
 * 资源实际归类在 `tag_selections[].group_path`（`['美术', '手绘', '类型']`）里，它才是准的。
 *
 * 另一半是「兜底只用于展示」：归类在树里彻底找不到时，下拉只能回落到首项展示，
 * 但**保存不能把回落出来的分区写回去**——打开编辑页什么都不改直接保存，资源的归类要原样保留。
 *
 * `vi.mock` 是文件级注册，拆开的两份 spec 各自用 `vi.hoisted` 建自己那份 mocks 再登记；
 * 这里只放夹具、挂载与取值，mocks 由调用方传进来，避免跨文件的 mock 与实例对不上。
 */
export type TagEchoMocks = {
  toast: Mock
  replace: Mock
  push: Mock
  route: { params: Record<string, string>; query: Record<string, unknown> }
  getResource: Mock
  updateHomepage: Mock
  tagTree: Mock
  listMyTeams: Mock
}

export function resourceFixture(part: Partial<McResourcePayload> = {}): McResourcePayload {
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
export function artworkSelections(): McResourceTagSelectionPayload[] {
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
export function tagTreeFixture(): McProcessedTagTree {
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

export function mountEdit(mocks: TagEchoMocks, payload: McResourcePayload): VueWrapper {
  mocks.route = { params: { resourceId: String(payload.id) }, query: {} }
  mocks.getResource.mockResolvedValue(payload)
  mocks.updateHomepage.mockResolvedValue(payload)
  return shallowMount(DevResourceHomepageEditView, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        WorkbenchBarSlot: { name: 'WorkbenchBarSlot', template: '<div><slot /></div>' },
        // 页面内容区块 `defineExpose({ setContent })` 供加载链路回写发布说明；默认桩没有这个方法，
        // 加载会抛「setContent is not a function」而停在回填之后。补上它，回填与归类回显才走完整条链。
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

export type EditState = {
  currentRootKey: string
  currentEntryKey: string
  currentRootLabel: string
  currentEntryLabel: string
  selectedTagIdsByGroup: Record<number, number[]>
  buildTagSelections: () => CreateMcResourceTagSelection[]
  saveHomepage: () => Promise<void>
  selectRoot: (value: string) => void
  /** 归类定位与勾选计数在 useResourceTagCatalog 里，视图只透传这个对象。 */
  tagCatalog: {
    tagPathResolved: { value: boolean }
    keepSavedTags: { value: boolean }
    selectedTagCount: { value: number }
  }
}

export function state<T>(wrapper: VueWrapper): T {
  return (wrapper.vm.$ as unknown as { setupState: T }).setupState
}
