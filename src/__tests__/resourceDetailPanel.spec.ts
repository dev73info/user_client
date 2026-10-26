import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PublicMcResourceItem, PublicMcResourceVersionItem } from '@/api/resources'
import ResourceDetailPanel from '@/components/ResourceDetailPanel.vue'
import { publicResourceFixture } from '@/__tests__/homeSpotlightFixtures'

/**
 * 资源详情面板的最小挂载烟测（R047 第 1-2 步：删死代码 + 富文本管线外移）。
 *
 * 这个组件此前零覆盖，而这两步动的恰恰是「看不见的接线」：
 * 富文本管线搬到 `utils/resourceRichText.ts`、正文排版搬到全局样式，容器本身不动。
 * 所以这里只钉四件事——标题 / 价格 / 版本列表照常渲染，未登录时评论与点赞走登录口，
 * 以及 `v-html` 那一块渲染出来的是**真元素**（`<h2>` / `<table>`），不是一段纯文本。
 */

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  getResource: vi.fn(),
  listVersions: vi.fn(),
  listComments: vi.fn(),
}))

const auth = {
  token: '',
  username: '',
  isAuthed: false,
  hydrate: vi.fn(),
}

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, fullPath: '/resources?resource=7' }),
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))

vi.mock('@/api/resources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/resources')>()
  return {
    ...actual,
    getPublicMcResource: mocks.getResource,
    listPublicMcResourceVersions: mocks.listVersions,
    listPublicMcResourceComments: mocks.listComments,
    invalidateResourceListCache: vi.fn(),
  }
})

// 支付面只在点「购买」时才用到，这里不点，避免把 qrcode 拉进 jsdom
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn() } }))

const resource: PublicMcResourceItem = publicResourceFixture({
  id: 7,
  title: '红石自动化整合包',
  description: 'Minecraft · 红石与自动化的一站式整合包',
  platform: 'Minecraft',
  buyout_price_fen: 990,
  price_fen: 990,
  // 正文同时有标题与表格：表格要能被包进 .rich-table-scroll，标题要还是 <h2> 而不是文字
  release_note:
    '<h2>安装说明</h2><p>解压后放进 mods 目录。</p>' +
    '<table><thead><tr><th>版本</th><th>说明</th></tr></thead>' +
    '<tbody><tr><td>1.20</td><td>推荐</td></tr></tbody></table>',
})

const versions: PublicMcResourceVersionItem[] = [
  {
    id: 11,
    resource_id: 7,
    version: 'v1.2',
    resource: '/uploads/redstone-v1.2.zip',
    // 版本补充说明是第二条 v-html 挂点，走同一条 formatHomepageContent
    note: '修复了 **红石时钟** 偶发停摆',
    creator: 'alice',
    created_at: '2026-02-02 10:00:00',
    is_current: true,
    price_fen: 0,
    purchasable: false,
  },
]

function mountPanel() {
  return mount(ResourceDetailPanel, {
    props: { resourceId: 7 },
    global: {
      // 组件模板里有 <router-link>；vue-router 整个被打桩，这里给个能渲染插槽的替身
      stubs: { 'router-link': { template: '<a><slot /></a>' } },
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.push.mockReset()
  mocks.getResource.mockReset().mockResolvedValue(resource)
  mocks.listVersions.mockReset().mockResolvedValue(versions)
  mocks.listComments.mockReset().mockResolvedValue([])
  auth.token = ''
  auth.username = ''
  auth.isAuthed = false
  auth.hydrate.mockReset()
})

describe('ResourceDetailPanel 挂载烟测', () => {
  it('渲染标题、价格与历史版本列表', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    expect(auth.hydrate).toHaveBeenCalled()
    expect(mocks.getResource).toHaveBeenCalledWith(7, null)

    expect(wrapper.get('.resource-detail-page__title').text()).toBe('红石自动化整合包')
    // 990 分 → ¥9.90（读数口径来自 shared/resourceSale，不在本组件里改）
    expect(wrapper.get('.resource-detail-page__price-pill').text()).toBe('¥9.90')
    expect(wrapper.get('.resource-detail-page__status-pill').text()).toBe('公开')

    const versionText = wrapper.get('.resource-detail-page__version-list').text()
    expect(versionText).toContain('v1.2')
    expect(wrapper.findAll('.resource-detail-page__version-card')).toHaveLength(1)
  })

  it('未登录：评论区出登录栅栏、点赞按钮可点但走登录口', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    // 评论栅栏：没有输入框，只有一句「登录后可评论」+ 登录按钮
    expect(wrapper.find('.resource-detail-page__comment-form').exists()).toBe(false)
    const gate = wrapper.get('.resource-detail-page__comment-gate')
    expect(gate.text()).toContain('登录后可评论')
    expect(gate.get('.resource-detail-page__comment-action').text()).toBe('登录')

    // 点赞按钮：未登录不置灰（点了会提示并跳登录），赞数按接口值显示
    const like = wrapper.get('.resource-detail-page__like-btn')
    expect(like.attributes('disabled')).toBeUndefined()
    expect(like.classes()).not.toContain('resource-detail-page__like-btn--active')

    await like.trigger('click')
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push.mock.calls[0]?.[0]).toMatchObject({
      name: 'home',
      query: { modal: 'auth', mode: 'login' },
    })
  })

  it('富文本正渲染成真实元素：<h2> 与 <table> 都在，表格还被包进 .rich-table-scroll', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    const flow = wrapper.get('.resource-detail-page__rich-text')
    // 容器没被搬走：位置与三串 class 都还在（样式搬走了、容器跟着搬才会整块失效）
    expect(flow.classes()).toEqual(
      expect.arrayContaining([
        'resource-detail-page__content-flow',
        'resource-detail-page__rich-text',
        'rich-text-body',
      ]),
    )

    // 正文不是被当成纯文本吐出来的（否则 <h2> 会退化成一段带尖括号的文字）
    expect(flow.find('h2').exists()).toBe(true)
    expect(flow.get('h2').text()).toBe('安装说明')
    expect(flow.find('table').exists()).toBe(true)
    expect(flow.findAll('th')).toHaveLength(2)
    expect(flow.findAll('td')).toHaveLength(2)

    // wrapRichTables 仍然生效：表格的父节点是可横向滚动的容器
    expect(flow.get('table').element.parentElement?.className).toBe('rich-table-scroll')
    expect(flow.text()).not.toContain('<h2>')
  })

  it('历史版本的补充说明走同一条管线（第二条 v-html 挂点）', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    const note = wrapper.get('.resource-detail-page__version-note')
    // Markdown 的 **粗体** 被渲染成 <strong>，而不是原样吐出星号
    expect(note.find('strong').exists()).toBe(true)
    expect(note.get('strong').text()).toBe('红石时钟')
    expect(note.text()).not.toContain('**')
  })

  it('首次加载失败后，重试只重取当前资源和版本并展示详情', async () => {
    mocks.getResource.mockRejectedValueOnce(new Error('资源服务暂不可用'))
    const wrapper = mountPanel()
    await flushPromises()

    const alert = wrapper.get('.resource-detail-page__load-error')
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toContain('资源服务暂不可用')
    expect(wrapper.find('.resource-detail-page__title').exists()).toBe(false)

    let finishRetry: (() => void) | undefined
    mocks.getResource.mockImplementationOnce(
      () =>
        new Promise<PublicMcResourceItem>((resolve) => {
          finishRetry = () => resolve(resource)
        }),
    )
    const retry = wrapper.get('button[aria-label="重新加载资源详情"]')
    await retry.trigger('click')
    await retry.trigger('click')
    finishRetry?.()
    await flushPromises()

    expect(mocks.getResource).toHaveBeenCalledTimes(2)
    expect(mocks.listVersions).toHaveBeenCalledTimes(2)
    expect(mocks.getResource).toHaveBeenNthCalledWith(1, 7, null)
    expect(mocks.getResource).toHaveBeenNthCalledWith(2, 7, null)
    expect(mocks.listVersions).toHaveBeenNthCalledWith(1, 7, null)
    expect(mocks.listVersions).toHaveBeenNthCalledWith(2, 7, null)
    expect(wrapper.get('.resource-detail-page__title').text()).toBe('红石自动化整合包')
    expect(wrapper.find('.resource-detail-page__load-error').exists()).toBe(false)
    expect(mocks.push).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
