import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  route: { params: {}, query: {} } as {
    params: Record<string, string>
    query: Record<string, unknown>
  },
  listResources: vi.fn(),
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
  listMcResources: mocks.listResources,
  listMcResourceVersions: vi.fn(),
  createMcResource: vi.fn(),
  getMcResource: vi.fn(),
  updateMcResourceHomepage: vi.fn(),
  updateResourceApiChannel: vi.fn(),
  getResourceApiChannel: vi.fn(),
  uploadMcResourceCover: vi.fn(),
  createMcResourceVersion: vi.fn(),
  deleteMcResource: vi.fn(),
  applyResourcePromoCard: vi.fn(),
}))
vi.mock('@/api/resourceTags', () => ({
  getProcessedTagTree: mocks.tagTree,
  invalidateTagTreeCache: vi.fn(),
  getResourceDetailSlug: () => 'slug',
}))
vi.mock('@/api/team', () => ({ listMyTeams: mocks.listMyTeams }))

import DevResourceInitView from '@/views/DevResourceInitView.vue'
import DevResourceListView from '@/views/DevResourceListView.vue'
import { devWorkbenchResourceRoutes } from '@/router/dev/workbenchResource'

function mountList(): VueWrapper {
  return shallowMount(DevResourceListView, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        TCard: { name: 'TCard', template: '<div><slot /></div>' },
        RouterLink: { template: '<a><slot /></a>' },
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

function state<T>(wrapper: VueWrapper): T {
  return (wrapper.vm.$ as unknown as { setupState: T }).setupState
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.route = { params: {}, query: {} }
  mocks.tagTree.mockResolvedValue({ roots: [] })
  mocks.listResources.mockResolvedValue([])
  mocks.listMyTeams.mockResolvedValue([])
})

describe('DevResourceListView：三类资源统一创建入口', () => {
  it('菜单提供免费的、付费的和接口三类资源', async () => {
    const wrapper = mountList()
    await flushPromises()
    expect(wrapper.findAll('.entry-item').map((item) => item.text())).toEqual([
      '免费资源',
      '付费资源（买断 / 单版本）',
      '接口资源',
    ])
    wrapper.unmount()
  })

  it('所有入口都进入统一创建页并携带类型', async () => {
    const wrapper = mountList()
    await flushPromises()
    const view = state<{ goCreateResource: (kind: unknown, mode?: unknown) => void }>(wrapper)

    view.goCreateResource('free')
    expect(mocks.push).toHaveBeenLastCalledWith({
      name: 'dev-plugins',
      query: { type: 'free' },
    })
    view.goCreateResource('paid', 'version')
    expect(mocks.push).toHaveBeenLastCalledWith({
      name: 'dev-plugins',
      query: { type: 'paid', mode: 'version' },
    })
    view.goCreateResource('api')
    expect(mocks.push).toHaveBeenLastCalledWith({
      name: 'dev-plugins',
      query: { type: 'api' },
    })
    view.goCreateResource('API（不公开展示）')
    expect(mocks.push).toHaveBeenLastCalledWith({
      name: 'dev-plugins',
      query: { type: 'free' },
    })
    wrapper.unmount()
  })
})

type CreateState = { isApiKind: boolean; creationType: string; paidMode: string }

describe('DevResourceInitView：类型来自统一路由查询', () => {
  it('type=api 展开接口配置', async () => {
    mocks.route.query = { type: 'api' }
    const wrapper = mountCreate()
    await flushPromises()
    expect(state<CreateState>(wrapper).isApiKind).toBe(true)
    wrapper.unmount()
  })

  it('免费、付费买断和付费单版本都不展开接口配置', async () => {
    for (const query of [
      {},
      { type: 'free' },
      { type: 'paid', mode: 'buyout' },
      { type: 'paid', mode: 'version' },
    ]) {
      mocks.route.query = query
      const wrapper = mountCreate()
      await flushPromises()
      expect(state<CreateState>(wrapper).isApiKind).toBe(false)
      wrapper.unmount()
    }
  })

  it('类型切换同步到统一创建页查询参数', async () => {
    const wrapper = mountCreate()
    await flushPromises()
    const view = state<CreateState>(wrapper)
    view.creationType = 'paid'
    view.paidMode = 'version'
    await flushPromises()
    expect(mocks.replace).toHaveBeenLastCalledWith({
      name: 'dev-plugins',
      query: { type: 'paid', mode: 'version' },
    })
    wrapper.unmount()
  })

  it('旧 ?kind=api 保留其余查询并归一化为 type=api', async () => {
    mocks.route.query = { kind: 'api', ownership: 'team' }
    const wrapper = mountCreate()
    await flushPromises()
    expect(mocks.replace).toHaveBeenLastCalledWith({
      name: 'dev-plugins',
      query: { ownership: 'team', type: 'api' },
    })
    wrapper.unmount()
  })

  it('旧接口创建路由重定向到统一页面', () => {
    const record = devWorkbenchResourceRoutes.find((item) => item.name === 'dev-plugins-api')
    if (typeof record?.redirect !== 'function') {
      throw new Error('旧接口创建路由缺少重定向')
    }
    const target = record.redirect({ query: { kind: 'api', ownership: 'team' } } as never)
    expect(target).toEqual({
      name: 'dev-plugins',
      query: { ownership: 'team', type: 'api' },
    })
  })
})
