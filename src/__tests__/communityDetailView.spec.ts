import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CommunityPostFormDialog from '@/components/community/CommunityPostFormDialog.vue'
import { useAuthStore } from '@/stores/auth'
import CommunityPostDetailView from '@/views/CommunityPostDetailView.vue'
import {
  communityPostPayload,
  makeCommunityComment,
  makeCommunityPost,
} from '@/__tests__/fixtures/community'

const mocks = vi.hoisted(() => ({
  getPost: vi.fn(),
  listComments: vi.fn(),
  createComment: vi.fn(),
  likeComment: vi.fn(),
  updatePost: vi.fn(),
}))

vi.mock('@/api/community', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/community')>()),
  getCommunityPost: mocks.getPost,
  listCommunityComments: mocks.listComments,
  createCommunityComment: mocks.createComment,
  setCommunityCommentLike: mocks.likeComment,
  updateCommunityPost: mocks.updatePost,
}))
vi.mock('@/components/RichTextEditor.vue', () => ({
  default: { template: '<div class="rich-editor-stub" />' },
}))

function legacyBytes(value: string): string {
  const encoded = Array.from(new TextEncoder().encode(value))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `\\x${encoded}`
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
  await router.push('/community/posts/7')
  const auth = useAuthStore()
  auth.token = options.authed === false ? '' : 'token'
  auth.username = options.authed === false ? '' : 'alice'
  const wrapper = mount(CommunityPostDetailView, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mocks.getPost.mockResolvedValue(makeCommunityPost())
  mocks.listComments.mockResolvedValue([makeCommunityComment()])
  mocks.createComment.mockImplementation((_token, _postId, payload) =>
    Promise.resolve(
      makeCommunityComment({
        id: 12,
        commenter: 'alice',
        comment_text: payload.comment,
        parent_comment_id: payload.parent_comment_id,
        parent_commenter: 'bob',
      }),
    ),
  )
  mocks.likeComment.mockResolvedValue({ comment_id: 11, liked_by_me: true, like_count: 1 })
  mocks.updatePost.mockResolvedValue(makeCommunityPost({ status: 'pending_review' }))
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('社区详情与评论', () => {
  it('详情加载失败可重试，正文渲染前净化 XSS', async () => {
    mocks.getPost.mockRejectedValueOnce(new Error('network failed'))
    const { wrapper } = await render()
    expect(wrapper.get('.community-detail-page__error').text()).toContain('加载帖子详情失败')
    mocks.getPost.mockResolvedValueOnce(
      makeCommunityPost({
        content_html:
          '<p>安全正文</p><script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">链接</a>',
      }),
    )
    await wrapper.get('.community-detail-page__error button').trigger('click')
    await flushPromises()
    const content = wrapper.get('.community-detail-card__content')
    expect(content.text()).toContain('安全正文')
    expect(content.find('script').exists()).toBe(false)
    expect(content.find('img').attributes('onerror')).toBeUndefined()
    expect(content.find('a').attributes('href')).toBeUndefined()
    wrapper.unmount()
  })

  it('评论回复、评论点赞和计数更新走真实交互', async () => {
    const { wrapper } = await render()
    await wrapper.get('.community-comment__like').trigger('click')
    await flushPromises()
    expect(mocks.likeComment).toHaveBeenCalledWith('token', 11, true)
    expect(wrapper.get('.community-comment__like').attributes('aria-label')).toBe('取消点赞')

    await wrapper.get('.community-comment').trigger('click')
    expect(
      wrapper.get('[data-comment-id="11"]').find('form.community-comments__composer').exists(),
    ).toBe(true)
    expect(wrapper.find('.community-comments__replying').exists()).toBe(false)
    await wrapper.get('textarea[aria-label="回复内容"]').setValue('新的回复')
    await wrapper.get('form.community-comments__composer').trigger('submit')
    await flushPromises()
    expect(mocks.createComment).toHaveBeenCalledWith('token', 7, {
      comment: '新的回复',
      parent_comment_id: 11,
    })
    expect(wrapper.text()).toContain('新的回复')
    expect(wrapper.get('.community-comments__header').text()).toContain('2 条')
    expect(wrapper.findAll('.community-comment--reply')).toHaveLength(1)
    wrapper.unmount()
  })

  it('评论超过一页时按每页 10 条分页', async () => {
    mocks.listComments.mockResolvedValueOnce(
      Array.from({ length: 18 }, (_, index) =>
        makeCommunityComment({
          id: 100 + index,
          comment_text: `分页评论 ${index + 1}`,
        }),
      ),
    )
    const { wrapper } = await render()

    expect(wrapper.findAll('.community-comment')).toHaveLength(10)
    expect(wrapper.text()).toContain('分页评论 10')
    expect(wrapper.find('[data-comment-id="110"]').exists()).toBe(false)

    const pageTwo = wrapper.findAll('button').find((button) => button.text() === '2')
    await pageTwo?.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.community-comment')).toHaveLength(8)
    expect(wrapper.text()).toContain('分页评论 18')
    expect(wrapper.find('[data-comment-id="117"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('长正文默认折叠，可展开并收起', async () => {
    const { wrapper } = await render()
    const content = wrapper.get('.community-detail-card__content')
    Object.defineProperty(content.element, 'scrollHeight', {
      configurable: true,
      value: 900,
    })
    window.dispatchEvent(new Event('resize'))
    await flushPromises()

    expect(content.classes()).toContain('community-detail-card__content--collapsed')
    const expand = wrapper.findAll('button').find((button) => button.text() === '展开全文')
    expect(expand).toBeDefined()

    await expand?.trigger('click')
    expect(content.classes()).not.toContain('community-detail-card__content--collapsed')
    expect(wrapper.findAll('button').some((button) => button.text() === '收起正文')).toBe(true)

    const collapse = wrapper.findAll('button').find((button) => button.text() === '收起正文')
    await collapse?.trigger('click')
    expect(content.classes()).toContain('community-detail-card__content--collapsed')
    wrapper.unmount()
  })

  it('点击详情操作栏空白区域聚焦评论输入框', async () => {
    const { wrapper } = await render()
    await wrapper.get('.community-detail-card__actions').trigger('click')
    await flushPromises()

    const composer = wrapper.get('textarea[aria-label="评论内容"]')
    expect(document.activeElement).toBe(composer.element)
    wrapper.unmount()
  })

  it('1.0 迁移的字节转义正文会还原后展示', async () => {
    mocks.getPost.mockResolvedValueOnce(
      makeCommunityPost({
        content_html: legacyBytes('<p>迁移后的帖子正文</p>'),
      }),
    )
    const { wrapper } = await render()

    const content = wrapper.get('.community-detail-card__content')
    expect(content.text()).toBe('迁移后的帖子正文')
    expect(content.text()).not.toContain('\\x3c')
    wrapper.unmount()
  })

  it('游客保留只读内容并通过既有弹窗登录', async () => {
    const { wrapper, router } = await render({ authed: false })
    expect(wrapper.text()).toContain('一条回复')
    expect(wrapper.find('form.community-comments__composer').exists()).toBe(false)
    await wrapper.get('.community-comments__login').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')
    expect(router.currentRoute.value.query).toMatchObject({
      modal: 'auth',
      mode: 'login',
      redirect_to: '/community/posts/7',
    })
    wrapper.unmount()
  })

  it('本人编辑后展示重新审核状态', async () => {
    const { wrapper } = await render()
    const edit = wrapper.findAll('button').find((item) => item.text() === '重新编辑')
    await edit?.trigger('click')
    wrapper.findComponent(CommunityPostFormDialog).vm.$emit('submit', communityPostPayload)
    await flushPromises()
    expect(mocks.updatePost).toHaveBeenCalledWith(
      'token',
      7,
      expect.objectContaining({ title: '新帖子', content_html: '<p>新内容</p>' }),
    )
    expect(wrapper.text()).toContain('审核中')
    expect(wrapper.text()).toContain('帖子审核中，仅作者本人可见')
    wrapper.unmount()
  })
})
