import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { McProcessedTagTree } from '@/api/resourceTags'
import ResourceCatalogView from '@/views/ResourceCatalogView.vue'

/**
 * 资源目录页拆分后的接线冒烟测试（不取代浏览器走查）：
 * 页签 / 分区 / 读数 / 翻页 / 已选筛选都由 `useResourceCatalogPage` 汇总后经 props 下发给
 * `CatalogToolbar`，再以事件回到列表实例——这里用真实模板 + 打桩的列表实例验证这条链路没有接错。
 */

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  setSort: vi.fn(),
  nextPage: vi.fn(),
  prevPage: vi.fn(),
  goToPage: vi.fn(),
  removeFilter: vi.fn(),
  clearFilters: vi.fn(),
}))

const tree: McProcessedTagTree = {
  roots: [
    {
      key: 'plugins',
      label: '插件专区',
      first_entry_key: 'paper',
      entries: [
        {
          key: 'paper',
          platform: 'paper',
          label: 'Paper',
          group_name: 'Paper',
          path_label: 'Paper',
          icon: '',
          publish_groups: [],
        },
      ],
    },
  ],
}

vi.mock('@/api/resourceTags', () => ({
  getTagRouteSlug: (raw: string) => raw,
  getMcPluginPlatformEntries: () => [
    {
      slug: 'paper',
      platform: 'paper',
      label: 'Paper',
      groupName: 'Paper',
      pathLabel: 'Paper',
      icon: '',
    },
    {
      slug: 'mod',
      platform: 'mod',
      label: 'Mod',
      groupName: 'Mod',
      pathLabel: 'Mod',
      icon: '',
    },
  ],
}))

vi.mock('@/stores/tagTree', () => ({ useTagTreeStore: () => ({ ensure: mocks.ensure }) }))

/** 列表实例打桩：只暴露视图会调到的方法，并记录调用。 */
const ResourceCatalogStub = defineComponent({
  name: 'ResourceCatalog',
  props: ['platform', 'rootSlug', 'entrySlug', 'groupName', 'listingMode', 'masterDetail'],
  emits: [
    'page-state-change',
    'listing-counts',
    'filters-change',
    'switch-listing-mode',
    'select-resource',
  ],
  setup(_props, { expose }) {
    expose({
      setSort: mocks.setSort,
      nextPage: mocks.nextPage,
      prevPage: mocks.prevPage,
      goToPage: mocks.goToPage,
      removeFilter: mocks.removeFilter,
      clearFilters: mocks.clearFilters,
    })
    return () => h('div', { class: 'catalog-master__list' })
  },
})

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'resource-catalog', path: '/:rootSlug?/:entrySlug?', component: ResourceCatalogView },
    ],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(ResourceCatalogView, {
    global: { plugins: [router], stubs: { ResourceCatalog: ResourceCatalogStub } },
  })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.ensure.mockResolvedValue(tree)
})

describe('ResourceCatalogView（拆分后接线）', () => {
  it('冷启动落在第一个专区的第一个子分区，工具条与列表都渲染', async () => {
    const { wrapper, router } = await render()

    expect(wrapper.find('.catalog-toolbar').exists()).toBe(true)
    expect(wrapper.find('.catalog-zone-trigger').text()).toContain('插件专区')
    expect(wrapper.findAll('.catalog-subtab')).toHaveLength(2)
    expect(wrapper.find('.catalog-subtab--active').text()).toBe('Paper')
    expect(wrapper.find('.catalog-master__list').exists()).toBe(true)
    expect(router.currentRoute.value.params).toMatchObject({
      rootSlug: 'plugins',
      entrySlug: 'paper',
    })
    expect(router.currentRoute.value.query.sale).toBe('free')
  })

  it('列表上报读数后工具条才显示计数与页码，翻页事件回到列表实例', async () => {
    const { wrapper } = await render()
    const catalog = wrapper.findComponent(ResourceCatalogStub)

    expect(wrapper.find('.catalog-count').exists()).toBe(false)
    expect(wrapper.find('.catalog-pager').exists()).toBe(false)

    catalog.vm.$emit('page-state-change', {
      current: 2,
      total: 3,
      hasPrev: true,
      hasNext: true,
      totalItems: 30,
    })
    await flushPromises()

    expect(wrapper.find('.catalog-count').text()).toContain('共 30 个')
    expect(wrapper.find('.catalog-count').text()).toContain('第 2/3 页')
    expect(wrapper.findAll('.catalog-pager__btn')).toHaveLength(5)

    await wrapper.findAll('.catalog-pager__btn')[0]!.trigger('click')
    expect(mocks.prevPage).toHaveBeenCalledTimes(1)

    await wrapper.findAll('.catalog-pager__btn')[4]!.trigger('click')
    expect(mocks.nextPage).toHaveBeenCalledTimes(1)
  })

  it('已选筛选 chip 可逐个移除、可整条清空', async () => {
    const { wrapper } = await render()

    wrapper
      .findComponent(ResourceCatalogStub)
      .vm.$emit('filters-change', [{ key: 's1-付费', sectionId: 1, label: '价格', tag: '付费' }])
    await flushPromises()

    expect(wrapper.find('.catalog-chip').text()).toContain('价格：付费')

    await wrapper.find('.catalog-chip').trigger('click')
    expect(mocks.removeFilter).toHaveBeenCalledWith(1, '付费')

    await wrapper.find('.catalog-chip-clear').trigger('click')
    expect(mocks.clearFilters).toHaveBeenCalledTimes(1)
  })

  it('换子分区会写回路由并保住当前分区', async () => {
    const { wrapper, router } = await render()

    await wrapper.findAll('.catalog-subtab')[1]!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.params.entrySlug).toBe('mod')
    expect(router.currentRoute.value.query.sale).toBe('free')
  })
})
