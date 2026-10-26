import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { destroyMessageHosts } from 'ui_73info'

import type { McProcessedTagTree } from '@/api/resourceTags'
import type { PublicMcResourceItem } from '@/api/resources'
import { resourceCatalogRoutes } from '@/router/routes/catalog'

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  getResource: vi.fn(),
  hydrate: vi.fn(),
}))

vi.mock('@/stores/tagTree', () => ({ useTagTreeStore: () => ({ ensure: mocks.ensure }) }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: null, hydrate: mocks.hydrate }),
}))
vi.mock('@/api/resources', () => ({ getPublicMcResource: mocks.getResource }))

const categoryTree: McProcessedTagTree = {
  roots: [
    {
      key: 'resources',
      label: '资源项目',
      first_entry_key: 'web',
      entries: [
        {
          key: 'web',
          platform: 'web',
          label: 'web',
          group_name: 'web',
          path_label: 'web',
          icon: '',
          publish_groups: [],
        },
        {
          key: 'minecraft',
          platform: 'minecraft',
          label: 'minecraft',
          group_name: 'minecraft',
          path_label: 'minecraft',
          icon: '',
          publish_groups: [],
        },
      ],
    },
  ],
}

function testRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/resources', name: 'resources', component: { template: '<div />' } },
      ...resourceCatalogRoutes.map((record) =>
        record.name === 'resource-catalog'
          ? {
              path: record.path,
              name: record.name,
              component: { template: '<div data-catalog-view />' },
            }
          : record,
      ),
    ],
  })
}

async function open(router: Router, path: string) {
  await router.push(path)
  await router.isReady()
  const initialName = router.currentRoute.value.name
  const wrapper = mount(defineComponent({ template: '<RouterView />' }), {
    global: {
      plugins: [router],
      stubs: {
        ResourcesView: { template: '<div data-resources-view />' },
        NotFoundView: { template: '<div />' },
      },
    },
  })
  await flushPromises()
  return { wrapper, initialName }
}

async function waitForRoute(router: Router, name: string) {
  await vi.waitFor(() => expect(router.currentRoute.value.name).toBe(name))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.ensure.mockResolvedValue(categoryTree)
})

afterEach(() => {
  destroyMessageHosts()
  vi.useRealTimers()
})

describe('资源目录分类深链与实际路由冲突', () => {
  it('分类别名首开保留 sale、resource 和合法 promo', async () => {
    const router = testRouter()
    const { wrapper, initialName } = await open(
      router,
      '/resources/web?sale=paid&resource=1&promo=PROMO1',
    )

    expect(initialName).toBe('resource-detail-direct')
    await waitForRoute(router, 'resource-catalog')
    expect(router.currentRoute.value.params).toMatchObject({
      rootSlug: 'resources',
      entrySlug: 'web',
    })
    expect(router.currentRoute.value.query).toMatchObject({
      sale: 'paid',
      resource: '1',
      promo: 'PROMO1',
    })
    expect(mocks.getResource).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('另一个分类别名也可用，非法 promo 被丢弃且不影响选中态', async () => {
    const router = testRouter()
    const { wrapper } = await open(
      router,
      '/resources/minecraft?sale=paid&resource=1&promo=bad%20code',
    )

    await waitForRoute(router, 'resource-catalog')
    expect(router.currentRoute.value.params.entrySlug).toBe('minecraft')
    expect(router.currentRoute.value.query).toMatchObject({ sale: 'paid', resource: '1' })
    expect(router.currentRoute.value.query.promo).toBeUndefined()
    wrapper.unmount()
  })

  it('无效 slug 回退免费目录后保留可见错误反馈', async () => {
    vi.useFakeTimers()
    const router = testRouter()
    const { wrapper } = await open(
      router,
      '/resources/not-a-category?sale=paid&resource=1&promo=PROMO1',
    )

    await waitForRoute(router, 'resources')
    expect(router.currentRoute.value.query).toEqual({ sale: 'free' })
    expect(mocks.getResource).not.toHaveBeenCalled()
    const messageSelector = '.t73-message-host [role="alert"]'
    expect(document.body.querySelector(messageSelector)?.textContent).toContain(
      '资源不存在或无权访问',
    )

    await vi.advanceTimersByTimeAsync(3100)
    expect(document.body.querySelector(messageSelector)?.textContent).toContain(
      '资源不存在或无权访问',
    )
    wrapper.unmount()
  })

  it('标签树失败保留原地址且可重试，不归为资源不存在', async () => {
    mocks.ensure.mockRejectedValueOnce(new Error('标签服务暂不可用'))
    const router = testRouter()
    const { wrapper } = await open(router, '/resources/web?sale=paid&resource=1&promo=PROMO1')

    expect(router.currentRoute.value.name).toBe('resource-detail-direct')
    expect(router.currentRoute.value.query).toMatchObject({
      sale: 'paid',
      resource: '1',
      promo: 'PROMO1',
    })
    expect(wrapper.get('[role="alert"]').text()).toContain('标签服务暂不可用')
    expect(mocks.getResource).not.toHaveBeenCalled()

    mocks.ensure.mockResolvedValue(categoryTree)
    await wrapper.get('button.portal-page__action').trigger('click')
    await waitForRoute(router, 'resource-catalog')
    expect(router.currentRoute.value.query).toMatchObject({
      sale: 'paid',
      resource: '1',
      promo: 'PROMO1',
    })
    wrapper.unmount()
  })

  it('真实作者详情 slug 仍按资源数据落页内详情', async () => {
    mocks.getResource.mockResolvedValue({
      id: 55,
      platform: 'web',
      buyout_price_fen: 1200,
      price_fen: 0,
      price_points: 0,
      tag_selections: [
        {
          group_path: ['资源项目', 'web'],
          group_path_aliases: ['resources', 'web'],
        },
      ],
    } as unknown as PublicMcResourceItem)
    const router = testRouter()
    const { wrapper } = await open(router, '/resources/dev-flow--55')

    await waitForRoute(router, 'resource-catalog')
    expect(router.currentRoute.value.params).toMatchObject({
      rootSlug: 'resources',
      entrySlug: 'web',
    })
    expect(router.currentRoute.value.query).toMatchObject({ sale: 'paid', resource: '55' })
    expect(mocks.getResource).toHaveBeenCalledWith(55, null)
    wrapper.unmount()
  })
})
