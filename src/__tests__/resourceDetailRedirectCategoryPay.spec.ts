import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  replace: vi.fn(),
  getResource: vi.fn(),
  ensure: vi.fn(),
  entries: vi.fn(),
  params: {} as Record<string, unknown>,
  query: {} as Record<string, unknown>,
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useRoute: () => ({ name: 'resource-detail-direct', params: mocks.params, query: mocks.query }),
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: null, hydrate: vi.fn() }),
}))
vi.mock('@/stores/tagTree', () => ({
  useTagTreeStore: () => ({ ensure: mocks.ensure }),
}))
vi.mock('@/api/resources', () => ({ getPublicMcResource: mocks.getResource }))
vi.mock('@/api/resourceTags', () => ({
  getMcPluginPlatformEntries: (...args: unknown[]) => mocks.entries(...args),
  getTagRouteSlug: (name: string) => name,
  parseResourceIdFromSlug: () => null,
}))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast =
    (type: string) =>
    (message: string): void => {
      mocks.showToast(message, type)
    }
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

import ResourceDetailRedirectView from '@/views/ResourceDetailRedirectView.vue'

/**
 * 分类别名地址（`/resources/<子分区别名>`）命中旧详情重定向时的 `?pay=` 处理。
 * 分类本身没有可买对象，只有地址同时指向一条有效 `?resource=<id>` 时才保留渠道偏好。
 */
async function mountView(query: Record<string, unknown>): Promise<ReturnType<typeof mount>> {
  mocks.params = { resourceSlug: 'zizhu-gongju' }
  mocks.query = query
  const wrapper = mount(ResourceDetailRedirectView)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  mocks.showToast.mockReset()
  mocks.replace.mockReset()
  mocks.getResource.mockReset()
  mocks.ensure.mockReset().mockResolvedValue({ roots: [] })
  mocks.entries.mockReset().mockReturnValue([{ slug: 'zizhu-gongju', platform: '自研工具' }])
})

describe('分类别名地址上的支付深链', () => {
  it('带有效 resource 时把渠道偏好带进目录页', async () => {
    const wrapper = await mountView({ sale: 'paid', resource: '55', pay: 'alipay' })

    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'resource-catalog',
      params: { rootSlug: 'resources', entrySlug: 'zizhu-gongju' },
      query: { sale: 'paid', resource: '55', pay: 'alipay' },
      force: true,
    })
    wrapper.unmount()
  })

  it('没有 resource 时摘掉 pay，不把无落点的渠道写回地址栏', async () => {
    const wrapper = await mountView({ sale: 'paid', pay: 'wechat' })

    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'resource-catalog',
      params: { rootSlug: 'resources', entrySlug: 'zizhu-gongju' },
      query: { sale: 'paid' },
      force: true,
    })
    wrapper.unmount()
  })

  it('resource 不是有效编号时同样摘掉 pay', async () => {
    const wrapper = await mountView({ resource: 'abc', pay: 'alipay' })

    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'resource-catalog',
      params: { rootSlug: 'resources', entrySlug: 'zizhu-gongju' },
      query: { resource: 'abc' },
      force: true,
    })
    wrapper.unmount()
  })
})
