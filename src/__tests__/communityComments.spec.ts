import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import CommunityView from '@/views/CommunityView.vue'

// R047 第 2 步抽出的两块（评论树 / 发帖编辑器）的回归网。同样挂**整页** CommunityView，
// 只断言这两块自己的出口：评论真的提交到接口、折叠阈值与楼号、`--comment-depth` 这层由 JS
// 写进内联样式的 CSS 变量、以及浮动提交条的出现与滞回收起。
//
// 为什么不在 `communityView.spec.ts` 里追加：那个文件已经 298 行，`.ts` 的行数预算是 300，
// 而本轮禁止改 `frontend-baseline.json`（超预算的存量文件只能进基线）。两页测试挂的是同一个页面
// 组件，回归网的价值不减，只是分成两个文件守住预算。
const mocks = vi.hoisted(() => ({
  posts: vi.fn(),
  tags: vi.fn(),
  comments: vi.fn(),
  post: vi.fn(),
  createComment: vi.fn(),
  realname: vi.fn(),
}))

vi.mock('@/api/community', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/community')>()),
  listCommunityPosts: mocks.posts,
  listCommunityTags: mocks.tags,
  listCommunityComments: mocks.comments,
  getCommunityPost: mocks.post,
  createCommunityComment: mocks.createComment,
}))
vi.mock('@/api/realname', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/realname')>()),
  getMyRealnameVerification: mocks.realname,
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

/** 评论工厂：默认是一条主楼评论，楼层 / 缩进 / 折叠的用例按需覆写 parent。 */
function comment(overrides: Record<string, unknown>) {
  return {
    id: 10,
    post_id: 1,
    parent_comment_id: null,
    parent_commenter: null,
    commenter: 'bob',
    commenter_avatar_url: null,
    commenter_username_gradient: false,
    commenter_username_color: null,
    comment_text: '第一条评论',
    like_count: 0,
    liked_by_me: false,
    created_at: '2026-10-01 11:00:00',
    updated_at: '2026-10-01 11:00:00',
    ...overrides,
  }
}

/** 两篇帖子够用：一篇自己的（alice）、一篇别人的（bob）。 */
const fixture = [
  post({ id: 1, title: '悬赏帖：爬虫小工具' }),
  post({ id: 2, title: '数据清洗经验', author: 'bob' }),
]

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'alice'
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})

  mocks.tags.mockResolvedValue([{ id: 1, name: '工具' }])
  mocks.posts.mockResolvedValue(fixture)
  mocks.post.mockImplementation(async (postId: number) =>
    fixture.find((item) => item.id === postId),
  )
  mocks.comments.mockResolvedValue([])
  mocks.realname.mockResolvedValue({ status: 'approved' })
  mocks.createComment.mockImplementation(
    async (_token: string, postId: number, text: string, parentCommentId?: number | null) =>
      comment({
        id: 900,
        post_id: postId,
        commenter: 'alice',
        comment_text: text,
        parent_comment_id: parentCommentId ?? null,
      }),
  )
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

/** 点开指定标题的帖子，进详情区。 */
async function openPost(wrapper: Awaited<ReturnType<typeof render>>, title: string) {
  const card = wrapper.findAll('.community-post-card').find((item) => item.text().includes(title))
  if (!card) throw new Error(`没找到帖子卡片：${title}`)
  await card.trigger('click')
  await flushPromises()
}

/** 只关心上下边界的矩形：浮动条判定就靠这两个值。 */
function rect(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: 0,
    width: 0,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

describe('评论树（useCommunityComments + CommunityCommentTree）', () => {
  it('发表评论真的打到接口，新楼层与详情区的评论数一起长出来', async () => {
    mocks.comments.mockResolvedValue([comment({ id: 10, post_id: 2, comment_text: '第一条评论' })])
    const wrapper = await render()
    await openPost(wrapper, '数据清洗经验')

    expect(wrapper.findAll('.community-comment-item')).toHaveLength(1)
    expect(wrapper.find('.community-comment-item__floor').text()).toBe('#1')
    expect(wrapper.find('.community-action-stat').text()).toContain('0 条评论')

    await wrapper.find('.community-comment-box textarea').setValue('我的想法')
    await wrapper.find('.community-comment-submit').trigger('click')
    await flushPromises()

    // 帖子 id 取当前详情那篇（2）；没有回复目标时第四参是 undefined
    expect(mocks.createComment).toHaveBeenCalledWith('test-token', 2, '我的想法', undefined)
    const items = wrapper.findAll('.community-comment-item')
    const floors = items.map((item) => item.find('.community-comment-item__floor').text())
    expect(floors).toEqual(['#1', '#2'])
    expect(items[1]?.text()).toContain('我的想法')
    // 草稿清空，评论数经 updateSelectedPost 回写到详情区
    const box = wrapper.find('.community-comment-box textarea').element as HTMLTextAreaElement
    expect(box.value).toBe('')
    expect(wrapper.find('.community-action-stat').text()).toContain('1 条评论')
    wrapper.unmount()
  })

  it('超过 3 条回复默认折叠，展开与收起都不改楼号顺序', async () => {
    mocks.comments.mockResolvedValue([
      comment({ id: 10, comment_text: '主楼' }),
      comment({ id: 11, parent_comment_id: 10, comment_text: '回复一' }),
      // 孙回复：折叠按「根楼的回复总数」算，它也算在里面（改造前的口径）
      comment({ id: 12, parent_comment_id: 11, comment_text: '回复二的子回复' }),
      comment({ id: 13, parent_comment_id: 10, comment_text: '回复三' }),
      comment({ id: 14, parent_comment_id: 10, comment_text: '回复四' }),
      comment({ id: 15, parent_comment_id: 10, comment_text: '回复五' }),
    ])
    const wrapper = await render()
    await openPost(wrapper, '数据清洗经验')

    // 主楼 + 前 3 条回复可见，第 4 条起折叠
    expect(wrapper.findAll('.community-comment-item')).toHaveLength(4)
    // 「展开」按钮必须是 `<ul>` 的直接子节点、且正好夹在第 3 条与第 4 条回复之间
    // （改造前就是这个位置；拆组件拆散层级时这条会先红）
    const list = wrapper.find('.community-comment-list').element
    expect(Array.from(list.children).map((el) => el.tagName)).toEqual([
      'LI',
      'LI',
      'LI',
      'LI',
      'BUTTON',
    ])
    const expand = wrapper.find('.community-replies-toggle')
    expect(expand.text()).toContain('展开 2 条回复')

    await expand.trigger('click')
    await flushPromises()
    const floors = wrapper
      .findAll('.community-comment-item')
      .map((item) => item.find('.community-comment-item__floor').text())
    expect(floors).toEqual(['#1', '#2', '#3', '#4', '#5', '#6'])

    const collapse = wrapper
      .findAll('.community-replies-toggle')
      .find((item) => item.text().includes('收起'))
    expect(collapse).toBeTruthy()
    await collapse?.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.community-comment-item')).toHaveLength(4)
    wrapper.unmount()
  })

  it('--comment-depth 由行数据写进内联样式，深层回复仍拿得到缩进这层变量', async () => {
    mocks.comments.mockResolvedValue([
      comment({ id: 10 }),
      comment({ id: 11, parent_comment_id: 10, comment_text: '回复一' }),
      comment({ id: 12, parent_comment_id: 11, comment_text: '回复二的子回复' }),
    ])
    const wrapper = await render()
    await openPost(wrapper, '数据清洗经验')

    // 抽组件最容易丢的就是这条：变量由 JS 写进 :style，缩进样式在组件自己的 scoped 块里
    const items = wrapper.findAll('.community-comment-item')
    expect(items[0]?.attributes('style')).toContain('--comment-depth: 0')
    expect(items[1]?.classes()).toContain('is-reply')
    expect(items[1]?.attributes('style')).toContain('--comment-depth: 1')
    expect(items[2]?.classes()).toContain('is-reply')
    expect(items[2]?.attributes('style')).toContain('--comment-depth: 2')
    wrapper.unmount()
  })
})

describe('发帖编辑器（useCommunityComposer + CommunityComposerPanel）', () => {
  it('提交条滚出视口时浮起来，滞回阈值不满足时才收起并还原占位高度', async () => {
    const wrapper = await render()
    await wrapper.find('.community-hero__button--primary').trigger('click')
    await flushPromises()

    const panel = wrapper.find('.community-composer')
    expect(panel.exists()).toBe(true)
    const shell = wrapper.find('.community-composer__actions-shell')
    const actions = wrapper.find('.community-composer__actions')
    expect(actions.classes()).not.toContain('is-floating')

    // 面板比视口（jsdom 768）高、底边越过视口底部：composable 注册的滚动监听一响就该浮起来
    panel.element.getBoundingClientRect = () => rect(-200, 1200)
    Object.defineProperty(actions.element, 'offsetHeight', { configurable: true, value: 56 })
    window.dispatchEvent(new Event('scroll'))
    await flushPromises()

    expect(actions.classes()).toContain('is-floating')
    expect(shell.attributes('style')).toContain('height: 56px')
    expect(actions.attributes('style')).toContain('bottom: 16px')
    expect(actions.attributes('style')).toContain('width: 180px')

    // 滞回：底边 816 时「新进入」不满足（需 > 820），但「已在浮动」仍满足（只需 > 812）→ 继续浮着
    panel.element.getBoundingClientRect = () => rect(-200, 816)
    window.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(actions.classes()).toContain('is-floating')

    panel.element.getBoundingClientRect = () => rect(-200, 800)
    window.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(actions.classes()).not.toContain('is-floating')
    expect(shell.attributes('style') ?? '').not.toContain('height')
    wrapper.unmount()
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})
