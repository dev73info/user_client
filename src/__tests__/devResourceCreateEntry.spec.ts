import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * R028：开发者工作台「发布资源」入口分两条（普通资源 / 特殊资源），
 * 创建页按入口的 query.kind 预选资源类别。
 *
 * 两个页面都走 shallowMount + setupState 调函数的写法（与 devResourceTransferList.spec.ts 一致）：
 * ui_73info 的下拉面板会 Teleport 到 body，真挂载去点菜单反而更脆。
 */
const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  route: { params: {}, query: {} } as { params: Record<string, string>; query: Record<string, unknown> },
  listResources: vi.fn(),
  inbox: vi.fn(),
  mine: vi.fn(),
  tagTree: vi.fn(),
  listMyTeams: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, resolve: () => ({ href: '/' }) }),
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
  listMcResources: mocks.listResources,
  createMcResource: vi.fn(),
  getMcResource: vi.fn(),
  updateMcResourceHomepage: vi.fn(),
  updateResourceSpecialChannel: vi.fn(),
  getResourceSpecialChannel: vi.fn(),
  uploadMcResourceCover: vi.fn(),
  createMcResourceVersion: vi.fn(),
  deleteMcResource: vi.fn(),
  applyResourcePromoCard: vi.fn(),
}))
vi.mock('@/api/points', () => ({
  listMyPromoCards: vi.fn(),
  getResourcePromoMeta: vi.fn(),
  promoCardLabel: (code: string) => code,
}))
vi.mock('@/api/resourceTags', () => ({
  getProcessedTagTree: mocks.tagTree,
  invalidateTagTreeCache: vi.fn(),
  getResourceDetailSlug: () => 'slug',
}))
vi.mock('@/api/resourceTransfers', () => ({
  listMyResourceTransferInbox: mocks.inbox,
  listMyResourceTransfers: mocks.mine,
  acceptResourceTransfer: vi.fn(),
  rejectResourceTransfer: vi.fn(),
  cancelResourceTransfer: vi.fn(),
}))
vi.mock('@/api/team', () => ({
  listMyTeams: mocks.listMyTeams,
}))

import DevResourceInitView from '@/views/DevResourceInitView.vue'
import DevResourceListView from '@/views/DevResourceListView.vue'

function mountList(): VueWrapper {
  return shallowMount(DevResourceListView, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        TCard: { name: 'TCard', template: '<div><slot /></div>' },
        RouterLink: { template: '<a><slot /></a>' },
        // 下拉面板默认是桩，这里让它把触发元素与菜单一起渲染出来，才能断言两个入口
        TDropdown: { name: 'TDropdown', template: '<div><slot /><slot name="dropdown" /></div>' },
        TDropdownMenu: { name: 'TDropdownMenu', template: '<div><slot /></div>' },
        TDropdownItem: {
          name: 'TDropdownItem',
          template: '<button type="button" class="entry-item"><slot /></button>',
        },
      },
    },
  })
}

function mountCreate(): VueWrapper {
  return shallowMount(DevResourceInitView, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        WorkbenchBarSlot: { name: 'WorkbenchBarSlot', template: '<div><slot /></div>' },
      },
    },
  })
}

/** 列表页与创建页都把 setup 的绑定挂在 setupState 上 */
function state<T>(wrapper: VueWrapper): T {
  return (wrapper.vm.$ as unknown as { setupState: T }).setupState
}

describe('DevResourceListView：发布资源入口分两条', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.route = { params: {}, query: {} }
    mocks.tagTree.mockResolvedValue({ roots: [] })
    mocks.listResources.mockResolvedValue([])
    mocks.inbox.mockResolvedValue([])
    mocks.mine.mockResolvedValue([])
  })

  it('菜单里就是普通资源与特殊资源两项', async () => {
    const wrapper = mountList()
    await flushPromises()

    const items = wrapper.findAll('.entry-item')
    expect(items.map((item) => item.text())).toEqual(['普通资源', '特殊资源'])
    wrapper.unmount()
  })

  it('goCreateResource 按类别跳创建页，并在 query 里带上 kind', async () => {
    const wrapper = mountList()
    await flushPromises()
    const view = state<{ goCreateResource: (kind: unknown) => void }>(wrapper)

    view.goCreateResource('normal')
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'dev-plugins', query: { kind: 'normal' } })

    view.goCreateResource('special')
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'dev-plugins', query: { kind: 'special' } })

    // 命令值意外时不能把「看着像特殊」的值带出去
    view.goCreateResource('SPECIAL（不公开展示）')
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'dev-plugins', query: { kind: 'normal' } })
    wrapper.unmount()
  })
})

type CreateState = { form: { resourceKind: string }; isSpecialKind: boolean }

describe('DevResourceInitView：按入口预选资源类别', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.route = { params: {}, query: {} }
    mocks.tagTree.mockResolvedValue({ roots: [] })
    mocks.listMyTeams.mockResolvedValue([])
  })

  it('?kind=special 预选特殊资源，接入配置区随之展开', async () => {
    mocks.route = { params: {}, query: { kind: 'special' } }
    const wrapper = mountCreate()
    await flushPromises()

    const view = state<CreateState>(wrapper)
    expect(view.form.resourceKind).toBe('special')
    // 「特殊资源接入配置」那一段就是 v-if="isSpecialKind"
    expect(view.isSpecialKind).toBe(true)
    wrapper.unmount()
  })

  it('kind 的大小写与首尾空白不敏感', async () => {
    mocks.route = { params: {}, query: { kind: ' SPECIAL ' } }
    const wrapper = mountCreate()
    await flushPromises()

    expect(state<CreateState>(wrapper).form.resourceKind).toBe('special')
    wrapper.unmount()
  })

  it('不带 kind（老入口）、kind=normal 与不认识的值都是普通资源，不展开配置区', async () => {
    for (const query of [{}, { kind: 'normal' }, { kind: 'other' }]) {
      mocks.route = { params: {}, query }
      const wrapper = mountCreate()
      await flushPromises()

      const view = state<CreateState>(wrapper)
      expect(view.form.resourceKind).toBe('normal')
      expect(view.isSpecialKind).toBe(false)
      wrapper.unmount()
    }
  })
})
