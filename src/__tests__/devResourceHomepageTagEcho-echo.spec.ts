import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  artworkSelections,
  mountEdit,
  resourceFixture,
  state,
  tagTreeFixture,
  type EditState,
  type TagEchoMocks,
} from './helpers/devResourceHomepageTagEcho'

/** 「回显」这一半：资源归类在标签树里找得到时，下拉与标签组要落在实际归类上。 */

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

describe('DevResourceHomepageEditView：根节点 / 二级节点按资源实际归类回显', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tagTree.mockResolvedValue(tagTreeFixture())
    mocks.listMyTeams.mockResolvedValue([])
  })

  it('资源平台是根节点名时，仍按 tag_selections 的 group_path 定位到「美术 / 手绘」', async () => {
    const wrapper = mountEdit(
      mocks,
      resourceFixture({ platform: '美术', tag_selections: artworkSelections() }),
    )
    await flushPromises()
    const view = state<EditState>(wrapper)

    expect(view.currentRootKey).toBe('group-14')
    expect(view.currentRootLabel).toBe('美术')
    expect(view.currentEntryKey).toBe('group-15')
    expect(view.currentEntryLabel).toBe('手绘')
    expect(view.tagCatalog.tagPathResolved.value).toBe(true)
    expect(view.tagCatalog.keepSavedTags.value).toBe(false)
    // 标签组按资源实际勾选回显，不是空
    expect(view.tagCatalog.selectedTagCount.value).toBe(2)
    expect(view.selectedTagIdsByGroup[28]).toEqual([210])
    expect(view.buildTagSelections()).toEqual([
      { group_id: 28, tag_ids: [210] },
      { group_id: 29, tag_ids: [220] },
    ])
    wrapper.unmount()
  })

  it('资源平台与二级节点名一致时行为不变（platform = 手绘）', async () => {
    const wrapper = mountEdit(mocks, resourceFixture({ tag_selections: artworkSelections() }))
    await flushPromises()
    const view = state<EditState>(wrapper)

    expect(view.currentEntryKey).toBe('group-15')
    expect(view.tagCatalog.selectedTagCount.value).toBe(2)
    wrapper.unmount()
  })

  it('切换根节点时二级节点落到新根的首个二级节点，不留上一个根的 key', async () => {
    const wrapper = mountEdit(mocks, resourceFixture({ tag_selections: artworkSelections() }))
    await flushPromises()
    const view = state<EditState>(wrapper)

    expect(view.currentRootKey).toBe('group-14')
    expect(view.currentEntryKey).toBe('group-15')

    view.selectRoot('minecraft')
    await flushPromises()

    expect(view.currentRootKey).toBe('minecraft')
    expect(view.currentEntryKey).toBe('java')
    // 开发者手选的归类就是本次提交的归类
    expect(view.tagCatalog.tagPathResolved.value).toBe(true)
    wrapper.unmount()
  })
})
