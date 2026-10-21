import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import CommunityView from '@/views/CommunityView.vue'

// 社区页面此前零覆盖：这是拆分前先织的一张最小网，只钉住三个出口——
// 「帖子列表渲染出几条」「搜索关键词真的把接口参数带上并过滤了列表」「点帖子能进详情」，
// 另外给本轮抽出的悬赏条与回顶按钮各留一条护栏。不追求覆盖发帖、评论等交互细节。
const mocks = vi.hoisted(() => ({
  posts: vi.fn(),
  tags: vi.fn(),
  comments: vi.fn(),
  post: vi.fn(),
  cancelBounty: vi.fn(),
}))

vi.mock('@/api/community', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/community')>()),
  listCommunityPosts: mocks.posts,
  listCommunityTags: mocks.tags,
  listCommunityComments: mocks.comments,
  getCommunityPost: mocks.post,
  cancelPostBounty: mocks.cancelBounty,
}))
vi.mock('@/api/realname', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/realname')>()),
  getMyRealnameVerification: vi.fn(),
}))

function post(overrides: Record<string, unknown>) {
  return {
    id: 1,
    author: 'alice',
    title: '帖子标题',
    status: 'published',
    tags: [{ id: 1, name: '工具' }],
    content_html: '<p>正文</p>',
    like_count: 0,
    comment_count: 0,
    liked_by_me: false,
    favorited_by_me: false,
    published_at: '2026-10-01 10:00:00',
    updated_at: '2026-10-02 10:00:00',
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    bounty_points: 0,
    bounty_status: 'none',
    bounty_accepted_comment_id: null,
    is_featured: false,
    featured_at: null,
    bumped_at: null,
    highlight_until: null,
    homepage_until: null,
    section_until: null,
    hot_until: null,
    ...overrides,
  }
}

/** 三条帖子各钉一种口径：带悬赏的（作者 alice）、无悬赏的、标题里带「爬虫」的。 */
const fixture = [
  post({
    id: 1,
    title: '悬赏帖：怎么写一个爬虫小工具',
    author: 'alice',
    bounty_points: 50,
    bounty_status: 'active',
    updated_at: '2026-10-03 10:00:00',
  }),
  post({
    id: 2,
    title: '数据清洗经验',
    author: 'bob',
    tags: [{ id: 2, name: '数据' }],
    updated_at: '2026-10-02 10:00:00',
  }),
  post({
    id: 3,
    title: '插件开发踩坑记录',
    author: 'carol',
    tags: [{ id: 1, name: '工具' }],
    updated_at: '2026-10-01 10:00:00',
  }),
]

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'alice'
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})

  mocks.tags.mockResolvedValue([
    { id: 1, name: '工具' },
    { id: 2, name: '数据' },
  ])
  // 服务端筛选的样子：关键词与标签都按真接口的语义过滤，前端只管把参数带对
  mocks.posts.mockImplementation(async (params: { keyword?: string; tag?: string } = {}) =>
    fixture.filter((item) => {
      const keyword = params.keyword?.trim()
      const tag = params.tag?.trim()
      const hitKeyword =
        !keyword || item.title.includes(keyword) || item.content_html.includes(keyword)
      const hitTag = !tag || item.tags.some((itemTag) => itemTag.name === tag)
      return hitKeyword && hitTag
    }),
  )
  mocks.comments.mockResolvedValue([])
  mocks.post.mockImplementation(async (postId: number) =>
    fixture.find((item) => item.id === postId),
  )
  mocks.cancelBounty.mockResolvedValue({
    bounty_points: 50,
    bounty_status: 'cancelled',
    bounty_accepted_comment_id: null,
  })
})

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'community', path: '/community', component: { template: '<div />' } },
      { name: 'home', path: '/', component: { template: '<div />' } },
      {
        name: 'workbench-realname',
        path: '/workbench/realname',
        component: { template: '<div />' },
      },
    ],
  })
  await router.push({ name: 'community' })
  const wrapper = mount(CommunityView, {
    global: {
      plugins: [router],
      stubs: { RichTextEditor: true, ShareCardGenerator: true },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof render>>['wrapper']

/** 帖子卡片按标题找：列表顺序由接口给，测试里不靠下标。 */
function cardByTitle(wrapper: Wrapper, title: string) {
  const card = wrapper
    .findAll('.community-post-card')
    .find((item) => item.find('h3').text().includes(title))
  if (!card) throw new Error(`没找到帖子卡片：${title}`)
  return card
}

describe('社区页最小挂载烟测', () => {
  it('挂载后把接口返回的帖子铺成列表，每条都带标题与作者', async () => {
    const { wrapper } = await render()
    expect(mocks.tags).toHaveBeenCalledTimes(1)
    expect(mocks.posts).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'test-token', keyword: '', offset: 0 }),
    )

    const cards = wrapper.findAll('.community-post-card')
    expect(cards).toHaveLength(3)
    expect(cards.map((card) => card.find('h3').text())).toEqual([
      '悬赏帖：怎么写一个爬虫小工具',
      '数据清洗经验',
      '插件开发踩坑记录',
    ])
    expect(cards[0]?.text()).toContain('alice')
    wrapper.unmount()
  })

  it('搜索关键词真的带到接口上，列表只剩命中的那条', async () => {
    const { wrapper } = await render()
    await wrapper.find('.community-search-field input').setValue('爬虫')
    await wrapper.find('form.community-search-bar').trigger('submit')
    await flushPromises()

    // 第二次请求从第 1 页重来，关键词进参数
    expect(mocks.posts).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: '爬虫', offset: 0 }),
    )
    const cards = wrapper.findAll('.community-post-card')
    expect(cards).toHaveLength(1)
    expect(cards[0]?.find('h3').text()).toContain('爬虫')
    wrapper.unmount()
  })

  it('点开一篇帖子，右侧详情区出现它的标题', async () => {
    const { wrapper } = await render()
    await cardByTitle(wrapper, '数据清洗经验').trigger('click')
    await flushPromises()

    const detail = wrapper.find('.community-post-detail')
    expect(detail.exists()).toBe(true)
    expect(detail.find('h2').text()).toContain('数据清洗经验')
    // 列表里那条被标记成选中态
    expect(cardByTitle(wrapper, '数据清洗经验').classes()).toContain('is-active')
    wrapper.unmount()
  })
})

describe('社区页拆出来的两块', () => {
  it('推广下拉只出现在自己发的帖子上', async () => {
    const { wrapper } = await render()

    await cardByTitle(wrapper, '悬赏帖').trigger('click')
    await flushPromises()
    expect(wrapper.find('.community-boost-button').exists()).toBe(true)

    // bob 的帖子：alice 能看，但没有推广入口
    await cardByTitle(wrapper, '数据清洗经验').trigger('click')
    await flushPromises()
    expect(wrapper.find('.community-post-detail').find('h2').text()).toContain('数据清洗经验')
    expect(wrapper.find('.community-boost-button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('悬赏条只在这篇帖子有悬赏时出现，取消入口只给作者', async () => {
    const { wrapper } = await render()

    await cardByTitle(wrapper, '数据清洗经验').trigger('click')
    await flushPromises()
    expect(wrapper.find('.community-bounty-bar').exists()).toBe(false)

    await cardByTitle(wrapper, '悬赏帖').trigger('click')
    await flushPromises()
    const bar = wrapper.find('.community-bounty-bar')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('悬赏 50 积分')
    expect(bar.text()).toContain('取消悬赏')

    // 换一个账号看，同一条帖子仍有悬赏，但没有取消入口
    const auth = useAuthStore()
    auth.username = 'bob'
    await cardByTitle(wrapper, '数据清洗经验').trigger('click')
    await flushPromises()
    await cardByTitle(wrapper, '悬赏帖').trigger('click')
    await flushPromises()
    expect(wrapper.find('.community-bounty-bar').text()).toContain('悬赏 50 积分')
    expect(wrapper.find('.community-bounty-bar').text()).not.toContain('取消悬赏')

    // 换回作者点「取消悬赏」：请求打到接口，回写的字段经 updateSelectedPost 落到详情上
    // （列表里那条走同一个回写点，本轮不重复断言）
    auth.username = 'alice'
    await cardByTitle(wrapper, '数据清洗经验').trigger('click')
    await flushPromises()
    await cardByTitle(wrapper, '悬赏帖').trigger('click')
    await flushPromises()
    await wrapper.find('.community-bounty-bar .community-bounty-cancel-button').trigger('click')
    await flushPromises()
    expect(mocks.cancelBounty).toHaveBeenCalledWith('test-token', 1)
    // 悬赏条文案跟着回写变成「已取消」，取消入口随之收掉
    expect(wrapper.find('.community-bounty-bar').text()).toContain('悬赏已取消')
    expect(wrapper.find('.community-bounty-bar').text()).not.toContain('取消悬赏')
    wrapper.unmount()
  })

  it('回顶按钮跟 App 外壳滚动容器的位置联动，点了就滚回顶部', async () => {
    // 视图摸的是 App 外壳的滚动容器（硬编码 DOM），这里按同样的选择器造一个
    document.body.innerHTML =
      '<div class="app-scrollbar"><div class="t73-scrollbar__wrap"></div></div>'
    const scrollWrap = document.querySelector<HTMLElement>('.t73-scrollbar__wrap')
    if (!scrollWrap) throw new Error('滚动容器没造出来')
    const scrollTo = vi.fn()
    scrollWrap.scrollTo = scrollTo

    const { wrapper } = await render()
    expect(wrapper.find('.community-scroll-top').exists()).toBe(false)

    scrollWrap.scrollTop = 300
    window.dispatchEvent(new Event('scroll'))
    await flushPromises()
    const button = wrapper.find('.community-scroll-top')
    expect(button.exists()).toBe(true)
    expect(button.attributes('aria-label')).toBe('回到顶部')

    await button.trigger('click')
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })

    // 滚回顶部之后按钮收起（滚动事件把可见性重新算一遍）
    scrollWrap.scrollTop = 0
    window.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(wrapper.find('.community-scroll-top').exists()).toBe(false)
    wrapper.unmount()
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})
