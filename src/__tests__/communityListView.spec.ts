import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HttpError } from '@/api/http'
import CommunityPostFormDialog from '@/components/community/CommunityPostFormDialog.vue'
import { useAuthStore } from '@/stores/auth'
import CommunityListView from '@/views/CommunityListView.vue'
import {
  communityPostPayload,
  communityTag,
  makeCommunityComment,
  makeCommunityPost,
} from '@/__tests__/fixtures/community'

const mocks = vi.hoisted(() => ({
  listPosts: vi.fn(),
  listFavorites: vi.fn(),
  listTags: vi.fn(),
  getPost: vi.fn(),
  listComments: vi.fn(),
  createPost: vi.fn(),
  updatePost: vi.fn(),
}))

vi.mock('@/api/community', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/community')>()),
  listCommunityPosts: mocks.listPosts,
  listFavoriteCommunityPosts: mocks.listFavorites,
  listCommunityTags: mocks.listTags,
  getCommunityPost: mocks.getPost,
  listCommunityComments: mocks.listComments,
  createCommunityPost: mocks.createPost,
  updateCommunityPost: mocks.updatePost,
}))

vi.mock('@/components/RichTextEditor.vue', () => ({
  default: { template: '<div class="rich-editor-stub" />' },
}))

function tab(wrapper: VueWrapper, label: string) {
  const node = wrapper.findAll('[role="tab"]').find((item) => item.text() === label)
  expect(node).toBeDefined()
  return node!
}

async function render(options: { authed?: boolean } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/community', name: 'community', component: { template: '<div />' } },
      {
        path: '/community/posts/:id',
        name: 'community-post',
        component: { template: '<div />' },
      },
      {
        path: '/workbench/realname',
        name: 'workbench-realname',
        component: { template: '<div />' },
      },
    ],
  })
  await router.push('/community')
  const auth = useAuthStore()
  auth.token = options.authed ? 'token' : ''
  auth.username = options.authed ? 'alice' : ''
  const wrapper = mount(CommunityListView, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mocks.listPosts.mockResolvedValue([makeCommunityPost()])
  mocks.listFavorites.mockResolvedValue([makeCommunityPost({ favorited_by_me: true })])
  mocks.listTags.mockResolvedValue([communityTag])
  mocks.getPost.mockImplementation((_token: string, postId: number) =>
    Promise.resolve(makeCommunityPost({ id: postId, title: `帖子 ${postId}` })),
  )
  mocks.listComments.mockResolvedValue([makeCommunityComment()])
  mocks.createPost.mockResolvedValue(makeCommunityPost({ id: 8, status: 'pending_review' }))
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('社区列表', () => {
  it('社区页左侧列表与右侧正文联动，默认打开第一篇', async () => {
    mocks.listPosts.mockResolvedValue([
      makeCommunityPost({ id: 7, title: '第一篇' }),
      makeCommunityPost({ id: 8, title: '第二篇' }),
    ])
    const { wrapper, router } = await render()

    expect(wrapper.find('.community-page--split').exists()).toBe(true)
    expect(wrapper.get('.community-post-panel').text()).toContain('帖子 7')
    expect(router.currentRoute.value.query.post).toBe('7')

    await wrapper.findAll('.community-post-card')[1]!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.post).toBe('8')
    expect(wrapper.get('.community-post-panel').text()).toContain('帖子 8')
    wrapper.unmount()
  })

  it('展示作者与状态，按标签和关键词查询', async () => {
    const { wrapper } = await render()
    expect(wrapper.text()).toContain('社区测试帖')
    expect(wrapper.text()).toContain('作者：alice')
    expect(wrapper.text()).toContain('已发布')

    await wrapper.get('.community-filters__keyword').setValue('路由')
    await wrapper.get('select[aria-label="按标签筛选"]').setValue('前端')
    await wrapper.get('form.community-filters').trigger('submit')
    await flushPromises()
    expect(mocks.listPosts).toHaveBeenLastCalledWith('', {
      limit: 10,
      offset: 0,
      keyword: '路由',
      tag: '前端',
    })
    wrapper.unmount()
  })

  it('我的帖子带作者和审核状态，收藏只走收藏接口', async () => {
    const { wrapper } = await render({ authed: true })
    await tab(wrapper, '我的帖子')?.trigger('click')
    await wrapper.get('select[aria-label="按审核状态筛选"]').setValue('pending_review')
    await wrapper.get('form.community-filters').trigger('submit')
    await flushPromises()
    expect(mocks.listPosts).toHaveBeenLastCalledWith('token', {
      limit: 10,
      offset: 0,
      keyword: undefined,
      tag: undefined,
      author: 'alice',
      status: 'pending_review',
    })

    await tab(wrapper, '我的收藏')?.trigger('click')
    await flushPromises()
    expect(mocks.listFavorites).toHaveBeenCalledWith('token', { limit: 10, offset: 0 })
    expect(wrapper.text()).toContain('已收藏')
    expect(wrapper.find('form.community-filters').exists()).toBe(false)
    wrapper.unmount()
  })

  it('加载失败可重试，空数据有空态', async () => {
    mocks.listPosts.mockRejectedValueOnce(new Error('network failed'))
    const { wrapper } = await render()
    expect(wrapper.get('.community-error').text()).toContain('加载社区帖子失败')
    mocks.listPosts.mockResolvedValueOnce([])
    await wrapper.get('.community-error button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('暂时没有社区帖子')
    expect(wrapper.find('.t73-empty--plain').exists()).toBe(true)
    wrapper.unmount()
  })

  it('裸数组分页使用 offset，不虚构总数', async () => {
    mocks.listPosts.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => makeCommunityPost({ id: index + 1 })),
    )
    const { wrapper } = await render()
    const next = wrapper.findAll('button').find((item) => item.text() === '下一页')
    await next?.trigger('click')
    await flushPromises()
    expect(mocks.listPosts).toHaveBeenLastCalledWith('', expect.objectContaining({ offset: 10 }))
    expect(wrapper.text()).toContain('第 2 页')
    wrapper.unmount()
  })

  it('未登录收藏和发帖都引导到既有认证弹窗', async () => {
    const { wrapper, router } = await render()
    await tab(wrapper, '我的收藏')?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')
    expect(router.currentRoute.value.query).toMatchObject({ modal: 'auth', mode: 'login' })
    expect(mocks.listFavorites).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('REALNAME_REQUIRED 在发帖弹窗清晰展示并可去实名', async () => {
    mocks.createPost.mockRejectedValue(
      new HttpError(403, '请先完成实名认证后再发布帖子', 'REALNAME_REQUIRED'),
    )
    const { wrapper, router } = await render({ authed: true })
    await wrapper.get('.community-page__publish').trigger('click')
    wrapper.findComponent(CommunityPostFormDialog).vm.$emit('submit', communityPostPayload)
    await flushPromises()
    expect(document.body.textContent).toContain('请先完成实名认证后再发布帖子')
    const realname = Array.from(document.body.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === '去实名认证',
    )
    realname?.click()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('workbench-realname')
    expect(router.currentRoute.value.query.redirect_to).toBe('/community?post=7')
    wrapper.unmount()
  })
})
