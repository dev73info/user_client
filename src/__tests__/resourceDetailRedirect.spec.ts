import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  replace: vi.fn(),
  getResource: vi.fn(),
  ensure: vi.fn(),
  params: {} as Record<string, unknown>,
  query: {} as Record<string, unknown>,
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useRoute: () => ({ params: mocks.params, query: mocks.query }),
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: null, hydrate: vi.fn() }),
}))
vi.mock('@/stores/tagTree', () => ({
  useTagTreeStore: () => ({ ensure: mocks.ensure }),
}))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast =
    (type: 'success' | 'error' | 'warning' | 'info') =>
    (message: string): void =>
      mocks.showToast(message, type)
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
vi.mock('@/api/resources', () => ({
  getPublicMcResource: mocks.getResource,
}))
// resourceTags 顶层会 import tags-wasm；这里只用到两个纯函数，就地替掉。
// getTagRouteSlug 加 `tag-` 前缀，好在断言里一眼看出 slug 是「按标签名推出来的」还是「取别名的」；
// 空名仍然回空串，与真实实现（`normalizeTagName`）一致——那正是「资源没有分类标签」的判据。
vi.mock('@/api/resourceTags', () => ({
  getMcPluginPlatformEntries: () => [],
  getTagRouteSlug: (name: string) => (name.trim() ? `tag-${name.trim()}` : ''),
  parseResourceIdFromSlug: (slug: string) => {
    const match = slug.match(/--(\d+)$/)
    if (!match) {
      return null
    }
    const id = Number(match[1])
    return Number.isInteger(id) && id > 0 ? id : null
  },
}))

import { HttpError } from '@/api/http'
import type { PublicMcResourceItem } from '@/api/resources'
import ResourceDetailRedirectView from '@/views/ResourceDetailRedirectView.vue'

/**
 * 旧「独立资源详情页」地址（`/resources/<作者>--<id>`、三段式旧地址）的重定向。
 *
 * 盯住两件事：
 * 1. 打得开时仍落到列表页的页内详情态，分类 slug / 资源编号 / 推广码一个不丢；
 * 2. 打不开时回「资源项目」列表，并给一句中文提示——按后端原文弹「not found」对访客没意义，
 *    而只把列表塞给访客、不说为什么，等于没有任何反馈。
 */

/** 只带重定向读到的字段：分类标签、平台、价格。其余字段本视图不看。 */
function resource(part: Record<string, unknown> = {}): PublicMcResourceItem {
  return {
    id: 55,
    platform: 'minecraft',
    price_fen: 0,
    price_points: 0,
    tag_selections: [],
    ...part,
  } as unknown as PublicMcResourceItem
}

function tagSelection(part: { root: string; entry: string; aliases?: string[] }) {
  return {
    group_id: 1,
    group_name: part.entry,
    group_path: [part.root, part.entry],
    group_path_aliases: part.aliases ?? [],
    tag_ids: [],
    tag_names: [],
  }
}

async function mountView(
  params: Record<string, unknown>,
  query: Record<string, unknown> = {},
): Promise<ReturnType<typeof mount>> {
  mocks.params = params
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
  mocks.params = {}
  mocks.query = {}
})

describe('ResourceDetailRedirectView', () => {
  it('资源可见时落到列表页的页内详情态，分类 slug 取标签别名，推广码随行', async () => {
    mocks.getResource.mockResolvedValue(
      resource({
        tag_selections: [
          tagSelection({ root: '矿物', entry: '矿石', aliases: ['mineral', 'ore'] }),
        ],
        buyout_price_fen: 1200,
      }),
    )

    const wrapper = await mountView({ resourceSlug: 'dev-flow--55' }, { promo: 'PROMO1' })

    expect(mocks.replace).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'resource-catalog',
      params: { rootSlug: 'mineral', entrySlug: 'ore' },
      query: { sale: 'paid', resource: '55', promo: 'PROMO1' },
    })
    expect(mocks.showToast).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('三段式旧地址自带分类段时沿用地址里的 slug，不按标签重推', async () => {
    mocks.getResource.mockResolvedValue(
      resource({
        tag_selections: [
          tagSelection({ root: '矿物', entry: '矿石', aliases: ['mineral', 'ore'] }),
        ],
      }),
    )

    const wrapper = await mountView({
      rootSlug: 'blocks',
      entrySlug: 'stone',
      resourceSlug: 'dev-flow--55',
    })

    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'resource-catalog',
      params: { rootSlug: 'blocks', entrySlug: 'stone' },
      query: { sale: 'free', resource: '55' },
    })

    wrapper.unmount()
  })

  it('资源没有标签别名时回落到按标签名生成的 slug', async () => {
    mocks.getResource.mockResolvedValue(
      resource({ tag_selections: [tagSelection({ root: '矿物', entry: '矿石' })] }),
    )

    const wrapper = await mountView({ resourceSlug: 'dev-flow--55' })

    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'resource-catalog',
      params: { rootSlug: 'tag-矿物', entrySlug: 'tag-矿石' },
      query: { sale: 'free', resource: '55' },
    })

    wrapper.unmount()
  })

  it('资源不可见（404）时回资源列表，给中文提示而不是后端原文', async () => {
    mocks.getResource.mockRejectedValue(new HttpError(404, 'not found'))

    const wrapper = await mountView({ resourceSlug: 'dev-flow--55' })

    expect(mocks.replace).toHaveBeenCalledWith({ name: 'resources', query: { sale: 'free' } })
    expect(mocks.showToast).toHaveBeenCalledWith('资源不存在或无权访问', 'error')

    wrapper.unmount()
  })

  it('地址里的编号解析不出来时直接回资源列表，不再打接口', async () => {
    const wrapper = await mountView({ resourceSlug: 'garbage' })

    expect(mocks.getResource).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith({ name: 'resources', query: { sale: 'free' } })
    expect(mocks.showToast).toHaveBeenCalledWith('资源不存在或无权访问', 'error')

    wrapper.unmount()
  })

  it('非 404 失败沿用后端原文，不谎称资源不存在', async () => {
    mocks.getResource.mockRejectedValue(new HttpError(500, '服务器开小差了'))

    const wrapper = await mountView({ resourceSlug: 'dev-flow--55' })

    expect(mocks.replace).toHaveBeenCalledWith({ name: 'resources', query: { sale: 'free' } })
    expect(mocks.showToast).toHaveBeenCalledWith('服务器开小差了', 'error')

    wrapper.unmount()
  })

  it('资源本身可见、只是没有分类标签时只降级落点，不弹提示', async () => {
    mocks.getResource.mockResolvedValue(resource({ platform: '' }))

    const wrapper = await mountView({ resourceSlug: 'dev-flow--55' })

    expect(mocks.replace).toHaveBeenCalledWith({ name: 'resources', query: { sale: 'free' } })
    expect(mocks.showToast).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})
