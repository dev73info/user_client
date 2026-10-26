import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ResourceCatalog from '@/components/ResourceCatalog.vue'
import { useAuthStore } from '@/stores/auth'

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  listResources: vi.fn(),
  getSections: vi.fn(),
}))

vi.mock('@/api/resources', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/resources')>()),
  listPublicMcResources: mocks.listResources,
}))
vi.mock('@/api/resourceTags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/resourceTags')>()),
  getTagFilterSections: mocks.getSections,
}))
vi.mock('@/stores/tagTree', () => ({ useTagTreeStore: () => ({ ensure: mocks.ensure }) }))

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: { template: '<div />' } }],
  })
  await router.push('/')
  const wrapper = mount(ResourceCatalog, {
    props: { platform: 'paper', rootSlug: 'plugins', entrySlug: 'paper', groupName: 'Paper' },
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  const auth = useAuthStore()
  auth.token = ''
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  mocks.ensure.mockResolvedValue({ roots: [] })
  mocks.listResources.mockResolvedValue([])
  mocks.getSections.mockReturnValue([])
})

describe('资源目录筛选布局', () => {
  it('空筛选组不渲染菜单容器，父级收起左列且保留结果区', async () => {
    const wrapper = await render()

    expect(wrapper.find('.portal-resource-browser').classes()).toContain(
      'portal-resource-browser--no-filters',
    )
    expect(wrapper.find('.portal-resource-browser__filters').exists()).toBe(false)
    expect(wrapper.find('.portal-resource-browser__grid').exists()).toBe(true)
    wrapper.unmount()
  })

  it('非空筛选组保留菜单和原有双列布局 class', async () => {
    mocks.getSections.mockReturnValue([
      { id: 1, label: '版本', queryKey: 'version', tags: ['1.20'], selected: [] },
    ])
    const wrapper = await render()

    expect(wrapper.find('.portal-resource-browser').classes()).not.toContain(
      'portal-resource-browser--no-filters',
    )
    expect(wrapper.find('.portal-resource-browser__filters').exists()).toBe(true)
    expect(wrapper.find('.portal-resource-browser__menu-group').text()).toContain('版本')
    expect(wrapper.find('.portal-resource-browser__grid').exists()).toBe(true)
    wrapper.unmount()
  })
})
