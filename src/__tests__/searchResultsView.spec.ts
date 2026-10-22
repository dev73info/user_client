import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import { useTagTreeStore } from '@/stores/tagTree'
import SearchResultsView from '@/views/SearchResultsView.vue'

/**
 * 搜索结果页的最小挂载烟测（这页原先零覆盖）。拆 `SearchResultsView`（1017 行）之前补的一层网，
 * 钉五件事：① 首屏按当前关键词取三类结果（资源全量、需求精选单页 100、帖子把关键词交给接口）
 * 与三段的**渲染条数**——卡片 DOM 现在在 `components/search/*`，条数最容易拆丢；
 * ② `?scope=` 切换只取、只渲染对应那一段；③ **路由 query 变化触发重新搜索**——本页没有搜索框，
 * `watch(route.query)` 是唯一的再搜入口，挪错一层就再也不会重新取数；④ 需求弹窗补详情后合并摘要
 * 并与接取入口的落点；⑤ 资源卡片按标签树算出的页内详情态。
 *
 * 每个 api 模块都 `importOriginal` 再覆盖单个函数：composable 与 `shared/` 也在导入这些模块，
 * 整模块替换会把它们需要的导出抹掉。
 */
const mocks = vi.hoisted(() => ({
  listResources: vi.fn(),
  listCommunity: vi.fn(),
  listRequirements: vi.fn(),
  hallItem: vi.fn(),
}))

vi.mock('@/api/resources', async (orig) => ({
  ...(await orig<typeof import('@/api/resources')>()),
  listAllPublicMcResources: mocks.listResources,
}))
vi.mock('@/api/community', async (orig) => ({
  ...(await orig<typeof import('@/api/community')>()),
  listCommunityPosts: mocks.listCommunity,
}))
vi.mock('@/api/requirements', async (orig) => ({
  ...(await orig<typeof import('@/api/requirements')>()),
  listPublicRequirementSpotlights: mocks.listRequirements,
  getWorkbenchRequirementHallItem: mocks.hallItem,
}))

/** 一条公开资源：标题里带「爬虫」，简介与标签都不参与这次命中判断，只看标题够不够。 */
const resourceItem = {
  id: 11,
  title: '爬虫工具箱',
  platform: 'windows',
  author: 'alice',
  creator: 'alice',
  description: '把客服工单表按天清洗成宽表',
  file_name: 'crawler.zip',
  release_note: null,
  cover_url: null,
  updated_at: '2026-10-01 09:00:00',
  like_count: 7,
  tag_selections: [],
}

/** 一条公开精选需求：验收标准为空，所以打开弹窗会去补详情。 */
const requirementItem = {
  requirement_id: 'REQ-1',
  title: '爬虫小工具定制',
  description: '按天清洗工单表',
  acceptance_criteria: null,
  budget: 3000,
  payment_mode: 'platform_guarantee',
  status: 'pending_deposit',
  created_at: '2026-10-01 08:00:00',
  updated_at: '2026-10-02 08:00:00',
  creator: 'bob',
}

/** 标题里没有「爬虫」的需求：用来证明关键词变化后列表会重新过滤，不是把上一批结果留在页面上。 */
const dataRequirementItem = {
  ...requirementItem,
  requirement_id: 'REQ-2',
  title: '数据看板定制',
  description: '按天出运营看板',
}

const communityItem = {
  id: 21,
  author: 'carol',
  title: '爬虫心得',
  status: 'published',
  tags: [{ id: 1, name: '爬虫' }],
  content_html: '<p>正文</p>',
  like_count: 2,
  comment_count: 1,
  published_at: '2026-10-03 10:00:00',
  updated_at: '2026-10-03 10:00:00',
}

/** 标签树只用来把资源落点算成「根分区 / 子分区」，这里给一份最小可用的。 */
const tagTree = {
  roots: [
    {
      key: 'windows',
      label: 'Windows',
      first_entry_key: 'tools',
      entries: [
        {
          key: 'tools',
          platform: 'windows',
          label: '工具',
          group_name: '工具',
          path_label: 'Windows / 工具',
          icon: 'x',
          publish_groups: [],
        },
      ],
    },
  ],
}

const SEARCH_PATH = '/search'

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = ''
  auth.username = ''
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  vi.spyOn(useTagTreeStore(), 'ensure').mockResolvedValue(tagTree)

  mocks.listResources.mockResolvedValue([resourceItem])
  mocks.listRequirements.mockResolvedValue({
    total: 2,
    page: 1,
    page_size: 100,
    items: [requirementItem, dataRequirementItem],
  })
  // 帖子那一路是真的服务端过滤：关键词不命中就回空数组，这里照这个口径模拟
  mocks.listCommunity.mockImplementation((params: { keyword?: string }) =>
    Promise.resolve(params.keyword === '数据' ? [] : [communityItem]),
  )
  mocks.hallItem.mockResolvedValue({
    ...requirementItem,
    acceptance_criteria: '按验收模板逐条自测',
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})

async function render(query: Record<string, string>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'search', path: SEARCH_PATH, component: { template: '<div/>' } },
      { name: 'home', path: '/', component: { template: '<div/>' } },
      { name: 'resources', path: '/resources', component: { template: '<div/>' } },
      {
        name: 'community-post',
        path: '/community/post/:postId',
        component: { template: '<div/>' },
      },
      {
        name: 'dev-requirement-detail',
        path: '/workbench/developer/requirements/detail/:requirementId',
        component: { template: '<div/>' },
      },
      {
        name: 'resource-catalog',
        path: '/:rootSlug/:entrySlug',
        component: { template: '<div/>' },
      },
    ],
  })
  await router.push({ name: 'search', query })
  const wrapper = mount(SearchResultsView, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof render>>['wrapper']

/** 三段分区的小标题（资源项目 / 需求项目 / 社区帖子）。 */
const sectionTitles = (wrapper: Wrapper) =>
  wrapper.findAll('.portal-search-page__section h2').map((node) => node.text())

/** 卡片标题：三支卡片共用 `.portal-search-result-card` 基座，h3 里是各自的标题。 */
const cardTitles = (wrapper: Wrapper) =>
  wrapper.findAll('.portal-search-result-card h3').map((node) => node.text())

/** 每段右上角那条「N 条」读数。 */
const chipCounts = (wrapper: Wrapper) =>
  wrapper.findAll('.portal-page__loading-chip').map((node) => node.text())

describe('搜索结果页：最小挂载烟测', () => {
  it('按关键词取三类结果，三段的渲染条数与请求实参口径不变', async () => {
    const { wrapper } = await render({ keyword: '爬虫' })

    // 取数：未登录则 token 传 null；资源全量、需求精选取满 100 条、帖子把关键词交给接口
    expect(mocks.listResources).toHaveBeenCalledWith(null)
    expect(mocks.listRequirements).toHaveBeenCalledWith(1, 100)
    expect(mocks.listCommunity).toHaveBeenCalledWith({
      token: null,
      keyword: '爬虫',
      limit: 12,
    })

    // 三段都在，条数各 1（需求取回两条，只有标题命中关键词的那条留下）
    expect(sectionTitles(wrapper)).toEqual(['资源项目', '需求项目', '社区帖子'])
    expect(chipCounts(wrapper)).toEqual(['1 条', '1 条', '1 条'])
    expect(cardTitles(wrapper)).toEqual(['爬虫工具箱', '爬虫小工具定制', '爬虫心得'])

    // 摘要按「N 个资源、N 个需求、N 篇帖子」拼
    expect(wrapper.find('.portal-search-page__summary').text()).toBe(
      '找到 1 个资源、1 个需求、1 篇帖子',
    )

    wrapper.unmount()
  })

  it('?scope=requirements 只取也只渲染需求那一段', async () => {
    const { wrapper } = await render({ keyword: '爬虫', scope: 'requirements' })

    expect(mocks.listRequirements).toHaveBeenCalledTimes(1)
    expect(mocks.listResources).not.toHaveBeenCalled()
    expect(mocks.listCommunity).not.toHaveBeenCalled()

    expect(sectionTitles(wrapper)).toEqual(['需求项目'])
    expect(cardTitles(wrapper)).toEqual(['爬虫小工具定制'])

    wrapper.unmount()
  })

  it('路由 query 变化触发重新搜索，并把上一批结果换掉', async () => {
    const { wrapper, router } = await render({ keyword: '爬虫' })
    expect(mocks.listCommunity).toHaveBeenCalledTimes(1)

    await router.push({ name: 'search', query: { keyword: '数据' } })
    await flushPromises()

    // 再搜一次：三路都重新取，帖子那一路换成了新关键词
    expect(mocks.listCommunity).toHaveBeenCalledTimes(2)
    expect(mocks.listCommunity).toHaveBeenLastCalledWith({
      token: null,
      keyword: '数据',
      limit: 12,
    })
    expect(mocks.listResources).toHaveBeenCalledTimes(2)

    // 页面跟着换：资源与帖子都不再命中，只剩标题带「数据」的那条需求
    expect(sectionTitles(wrapper)).toEqual(['需求项目'])
    expect(cardTitles(wrapper)).toEqual(['数据看板定制'])

    wrapper.unmount()
  })

  it('资源卡片点开落在资源列表页的页内详情态，分区段取自标签树', async () => {
    const { wrapper, router } = await render({ keyword: '爬虫' })

    await wrapper.findAll('.portal-search-result-card--resource')[0]!.trigger('click')
    await flushPromises()

    // 资源自己只带平台名，`:rootSlug/:entrySlug` 是拿平台去标签树里换出来的
    expect(router.currentRoute.value.name).toBe('resource-catalog')
    expect(router.currentRoute.value.params.rootSlug).toBe('windows')
    expect(router.currentRoute.value.params.entrySlug).toBe('tools')
    expect(router.currentRoute.value.query).toEqual({ sale: 'free', resource: '11' })

    wrapper.unmount()
  })

  it('需求弹窗补详情后合并摘要，接取入口落开发者需求详情', async () => {
    const auth = useAuthStore()
    auth.token = 'test-token'
    auth.username = 'dev_flow'
    const { wrapper, router } = await render({ keyword: '爬虫' })

    // 点需求卡片 → 弹窗（Teleport 到 body，所以从 document 上找）
    await wrapper.findAll('.portal-search-result-card--requirement')[0]!.trigger('click')
    await flushPromises()

    const detail = document.body.querySelector('.portal-search-detail')
    expect(detail).not.toBeNull()
    // 摘要里验收标准是空的，补详情期间先写「加载中」，补回来后换成详情里的那一份
    expect(mocks.hallItem).toHaveBeenCalledWith('test-token', 'REQ-1')
    expect(detail!.textContent).toContain('按验收模板逐条自测')
    expect(detail!.textContent).toContain('3,000')

    // 自己发的需求不给接取入口：这条是 bob 发的，给
    const claim = document.body.querySelector<HTMLButtonElement>('.portal-search-detail__bind')
    expect(claim).not.toBeNull()
    claim!.click()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('dev-requirement-detail')
    expect(router.currentRoute.value.params.requirementId).toBe('REQ-1')

    wrapper.unmount()
  })
})
