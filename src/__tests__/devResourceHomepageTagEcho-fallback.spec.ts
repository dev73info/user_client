import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  McResourceTagSelectionPayload,
  UpdateMcResourceHomepageRequest,
} from '@/api/mcResources'
import {
  artworkSelections,
  mountEdit,
  resourceFixture,
  state,
  tagTreeFixture,
  type EditState,
  type TagEchoMocks,
} from './helpers/devResourceHomepageTagEcho'

/** 「兜底」这一半：归类在树里找不到时只回落展示，保存仍按资源原有归类提交。 */

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  route: { params: {} as Record<string, string>, query: {} as Record<string, unknown> },
  getResource: vi.fn(),
  updateHomepage: vi.fn(),
  tagTree: vi.fn(),
  listMyTeams: vi.fn(),
})) satisfies TagEchoMocks

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

describe('DevResourceHomepageEditView：归类找不到时的回落与保存', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tagTree.mockResolvedValue(tagTreeFixture())
    mocks.listMyTeams.mockResolvedValue([])
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
      mocks,
      resourceFixture({ platform: '已删除平台', tag_selections: orphanSelections }),
    )
    await flushPromises()
    const view = state<EditState>(wrapper)

    // 展示回落：停在标签树首个根节点（下拉本身也要有值，不能空成占位符）
    expect(view.currentRootLabel).toBe('Minecraft专区')
    expect(view.currentEntryLabel).toBe('Java 版')
    expect(view.currentRootKey).toBe('minecraft')
    expect(view.currentEntryKey).toBe('java')
    expect(view.tagCatalog.tagPathResolved.value).toBe(false)
    expect(view.tagCatalog.keepSavedTags.value).toBe(true)
    expect(view.tagCatalog.selectedTagCount.value).toBe(0)

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
      mocks,
      resourceFixture({ platform: '已删除平台', tag_selections: orphanSelections }),
    )
    await flushPromises()
    const view = state<EditState>(wrapper)

    view.selectedTagIdsByGroup[4] = [2]
    await flushPromises()

    expect(view.buildTagSelections()).toEqual([{ group_id: 4, tag_ids: [2] }])
    wrapper.unmount()
  })
})
