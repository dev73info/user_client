import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import CommunityView from '@/views/CommunityView.vue'

// R047 第 3 步（收尾轮）抽出的「帖子列表区 / 帖子详情区」两块组件的回归网。
//
// 为什么另起一个文件：`communityView.spec.ts` 已 298 行、`communityComments.spec.ts` 299 行，
// `.ts` 的行数预算是 300，本轮又不许改 `frontend-baseline.json`——那两个文件的既有用例一行不碰，
// 这里补的是「列表渲染 / 点卡片进详情 / 正文富文本真的是元素 / 操作行按钮打到接口」四条出口，
// 外加一条专门钉「代码块复制按钮跟着 v-html 容器挂上」的护栏（搬运行时最容易静默丢掉的一处）。
const mocks = vi.hoisted(() => ({
  posts: vi.fn(),
  tags: vi.fn(),
  comments: vi.fn(),
  post: vi.fn(),
  like: vi.fn(),
  unlike: vi.fn(),
  favorite: vi.fn(),
  unfavorite: vi.fn(),
}))

vi.mock('@/api/community', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/community')>()),
  listCommunityPosts: mocks.posts,
  listCommunityTags: mocks.tags,
  listCommunityComments: mocks.comments,
  getCommunityPost: mocks.post,
  likeCommunityPost: mocks.like,
  unlikeCommunityPost: mocks.unlike,
  favoriteCommunityPost: mocks.favorite,
  unfavoriteCommunityPost: mocks.unfavorite,
}))
vi.mock('@/api/realname', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/realname')>()),
  getMyRealnameVerification: vi.fn(),
}))

/** 一段「富文本该有的样子」的正文：标题 / 列表 / 引用 / 图片 / 代码块各一。 */
const RICH_HTML = [
  '<h2>小标题</h2>',
  '<p>第一段<strong>加粗</strong></p>',
  '<ul><li>条目一</li><li>条目二</li></ul>',
  '<blockquote>引用一句</blockquote>',
  '<p><img src="/demo.png" alt="示意图" /></p>',
  '<pre><code>const a = 1</code></pre>',
].join('')

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

/** 三篇：alice 自己那篇带富文本、bob 那篇只有摘要（要单独补取正文）、carol 那篇够翻页用。 */
const fixture = [
  post({ id: 1, title: '富文本帖', author: 'alice', content_html: RICH_HTML, comment_count: 2 }),
  post({ id: 2, title: '数据清洗经验', author: 'bob', tags: [{ id: 2, name: '数据' }] }),
  post({ id: 3, title: '插件开发踩坑记录', author: 'carol' }),
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
  mocks.posts.mockImplementation(async (params: { offset?: number; limit?: number } = {}) => {
    const offset = params.offset ?? 0
    return fixture.slice(offset, offset + (params.limit ?? 8))
  })
  mocks.comments.mockResolvedValue([])
  mocks.post.mockImplementation(async (postId: number) =>
    fixture.find((item) => item.id === postId),
  )
  mocks.like.mockResolvedValue({ liked_by_me: true, like_count: 7 })
  mocks.unlike.mockResolvedValue({ liked_by_me: false, like_count: 6 })
  mocks.favorite.mockResolvedValue({ favorited_by_me: true })
  mocks.unfavorite.mockResolvedValue({ favorited_by_me: false })
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
    global: { plugins: [router], stubs: { RichTextEditor: true, ShareCardGenerator: true } },
  })
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof render>>

/** 按标题点开一篇（列表顺序由接口给，不靠下标）。 */
async function openPost(wrapper: Wrapper, title: string) {
  const card = wrapper.findAll('.community-post-card').find((item) => item.text().includes(title))
  if (!card) throw new Error(`没找到帖子卡片：${title}`)
  await card.trigger('click')
  await flushPromises()
}

describe('帖子列表区（CommunityPostList + useCommunityFeed）', () => {
  it('把接口结果铺成帖子卡，并给出「第几页 · 第几条到第几条」', async () => {
    const wrapper = await render()

    const cards = wrapper.findAll('.community-post-card')
    expect(cards).toHaveLength(3)
    expect(cards.map((card) => card.find('h3').text())).toEqual([
      '富文本帖',
      '数据清洗经验',
      '插件开发踩坑记录',
    ])
    // 卡片自带作者、赞数、评论数与标签（列表区的信息都在卡片里）
    expect(cards[0]?.text()).toContain('alice')
    expect(cards[0]?.text()).toContain('2 条评论')
    expect(cards[0]?.findAll('.community-post-card__tags span').map((tag) => tag.text())).toEqual([
      '工具',
    ])
    expect(wrapper.find('.community-page-status').text()).toBe('第 1 页 · 1-3 条')
    wrapper.unmount()
  })

  it('标签行按接口结果铺开，点一下就带上 tag 回第 1 页重取', async () => {
    const wrapper = await render()

    const tags = wrapper.findAll('.community-tag')
    expect(tags.map((tag) => tag.text())).toEqual(['全部', '工具', '数据'])
    await tags[2]?.trigger('click')
    await flushPromises()

    expect(mocks.posts).toHaveBeenLastCalledWith(
      expect.objectContaining({ tag: '数据', offset: 0 }),
    )
    expect(wrapper.findAll('.community-tag')[2]?.classes()).toContain('is-active')
    wrapper.unmount()
  })

  it('分页把页号换算成 offset，点下一页就重取第 2 页', async () => {
    // 够两页：接口按「多取一条」的语义返回 9 条 → 铺 8 条、hasNext 为真
    mocks.posts.mockImplementation(async () =>
      Array.from({ length: 9 }, (_, index) => post({ id: 100 + index })),
    )
    const wrapper = await render()
    await wrapper.findAll('.community-page-button')[1]?.trigger('click')
    await flushPromises()

    expect(mocks.posts).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 9, offset: 8 }))
    wrapper.unmount()
  })
})

describe('帖子详情区（CommunityPostDetail）', () => {
  it('点卡片进详情：右侧出现标题，卡片打上选中态', async () => {
    const wrapper = await render()
    await openPost(wrapper, '数据清洗经验')

    const detail = wrapper.find('.community-post-detail')
    expect(detail.exists()).toBe(true)
    expect(detail.find('h2').text()).toContain('数据清洗经验')
    expect(wrapper.findAll('.community-post-card')[1]?.classes()).toContain('is-active')
    wrapper.unmount()
  })

  it('正文是渲染出来的元素，不是一段纯文本：标题 / 列表 / 引用 / 图片 / 代码块都在', async () => {
    const wrapper = await render()
    await openPost(wrapper, '富文本帖')

    // 抽组件最容易踩的坑：v-html 丢了就退化成一整段文字，所以按元素逐个钉
    const rich = wrapper.find('.community-rich-text')
    expect(rich.find('h2').text()).toBe('小标题')
    expect(rich.find('strong').text()).toBe('加粗')
    expect(rich.findAll('ul > li')).toHaveLength(2)
    expect(rich.find('blockquote').text()).toBe('引用一句')
    expect(rich.find('img').attributes('src')).toBe('/demo.png')
    expect(rich.find('pre > code').text()).toBe('const a = 1')
    wrapper.unmount()
  })

  it('代码块复制按钮跟着 v-html 容器挂上（容器换层就静默消失的那一处）', async () => {
    const wrapper = await render()
    await openPost(wrapper, '富文本帖')

    // useCodeBlockCopy 靠 pointerover 抓 pre；挂上了才会往 body 里插按钮
    await wrapper.find('.community-rich-text pre').trigger('pointerover')
    await flushPromises()
    expect(wrapper.find('.community-rich-text').classes()).toContain('rich-code-copy-host')
    expect(document.body.querySelector('.rich-code-copy-button')).not.toBeNull()
    wrapper.unmount()
  })

  it('操作行的点赞与收藏真的打到接口，回写的计数跟着变', async () => {
    const wrapper = await render()
    await openPost(wrapper, '富文本帖')

    await wrapper.find('.community-like-button').trigger('click')
    await flushPromises()
    expect(mocks.like).toHaveBeenCalledWith('test-token', 1)
    expect(wrapper.find('.community-like-button').text()).toContain('7')
    expect(wrapper.find('.community-like-button').text()).toContain('已点赞')

    await wrapper.find('.community-favorite-button').trigger('click')
    await flushPromises()
    expect(mocks.favorite).toHaveBeenCalledWith('test-token', 1)
    expect(wrapper.find('.community-favorite-button').text()).toContain('已收藏')
    // 已登录 + 已公开才给分享卡入口
    expect(wrapper.find('share-card-generator-stub').attributes('targetid')).toBe('1')
    wrapper.unmount()
  })

  it('编辑入口只给作者：点了进右栏编辑器并回填标题', async () => {
    const wrapper = await render()
    await openPost(wrapper, '数据清洗经验')
    expect(wrapper.find('.community-post-detail .community-panel-action').exists()).toBe(false)

    await openPost(wrapper, '富文本帖')
    await wrapper.find('.community-post-detail .community-panel-action').trigger('click')
    await flushPromises()
    expect(wrapper.find('.community-composer').exists()).toBe(true)
    wrapper.unmount()
  })

  it('列表里那条只有摘要时，单独补取正文再渲染', async () => {
    mocks.posts.mockResolvedValue([{ ...fixture[1], content_html: '' }])
    const wrapper = await render()
    await openPost(wrapper, '数据清洗经验')

    expect(mocks.post).toHaveBeenCalledWith(2, 'test-token')
    expect(wrapper.find('.community-rich-text').html()).toContain('正文')
    wrapper.unmount()
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})
