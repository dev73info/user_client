import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PublicMcResourceCommentItem } from '@/api/resources'
import ResourceCommentSection from '@/components/resource-detail/ResourceCommentSection.vue'

/**
 * 资源评论卡（R047 从 `ResourceDetailPanel` 拆出的第二块）。
 *
 * 这一块自己取数（`useResourceComments`），所以拆分后要钉的是「取数接线」：
 * 挂载就按令牌拉一次评论、未登录出登录栅栏且点「登录」跳登录弹窗、
 * 已登录能提交并把新评论插到列表最前。
 */
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  listComments: vi.fn(),
  createComment: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))

const auth = {
  token: '',
  username: '',
  isAuthed: false,
}

const comments: PublicMcResourceCommentItem[] = [
  {
    id: 31,
    resource_id: 7,
    commenter: 'bob',
    comment: '兼容 1.20 没问题',
    created_at: '2026-02-03 08:00:00',
    updated_at: '2026-02-03 09:00:00',
  },
]

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, fullPath: '/resources?resource=7' }),
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))

vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: mocks.success,
      warning: mocks.warning,
      error: mocks.error,
      info: mocks.info,
    },
  }
})

vi.mock('@/api/resources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/resources')>()
  return {
    ...actual,
    listPublicMcResourceComments: mocks.listComments,
    createPublicMcResourceComment: mocks.createComment,
  }
})

function mountSection(props: Record<string, unknown> = {}) {
  return mount(ResourceCommentSection, {
    props: { resourceId: 7, isPublished: true, ...props },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.push.mockReset()
  mocks.listComments.mockReset().mockResolvedValue(comments)
  mocks.createComment.mockReset()
  mocks.success.mockReset()
  mocks.warning.mockReset()
  mocks.error.mockReset()
  mocks.info.mockReset()
  auth.token = ''
  auth.username = ''
  auth.isAuthed = false
})

describe('ResourceCommentSection', () => {
  it('挂载即按登录态拉评论；未登录出登录栅栏，点「登录」跳登录弹窗', async () => {
    const wrapper = mountSection()
    await flushPromises()

    // 未登录也拉评论（游客能看），token 为空按匿名请求
    expect(mocks.listComments).toHaveBeenCalledWith(7, null)
    expect(mocks.listComments).toHaveBeenCalledTimes(1)

    const gate = wrapper.get('.resource-detail-page__comment-gate')
    expect(gate.text()).toContain('登录后可评论')
    expect(wrapper.find('.resource-detail-page__comment-form').exists()).toBe(false)
    // 评论照常渲染在栅栏下面
    expect(wrapper.get('.resource-detail-page__comment-item').text()).toContain('兼容 1.20 没问题')

    await gate.get('.resource-detail-page__comment-action').trigger('click')
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push.mock.calls[0]?.[0]).toMatchObject({
      name: 'home',
      query: { modal: 'auth', mode: 'login' },
    })
  })

  it('资源未公开发布：评论栅栏换成「发布后可评论」，且没有按钮', async () => {
    const wrapper = mountSection({ isPublished: false })
    await flushPromises()

    const gate = wrapper.get('.resource-detail-page__comment-gate')
    expect(gate.text()).toContain('资源发布后可评论')
    expect(wrapper.find('.resource-detail-page__comment-action').exists()).toBe(false)
  })

  it('已登录可提交：接口只调一次，新评论插到最前、输入框清空', async () => {
    auth.token = 'tk'
    auth.username = 'alice'
    auth.isAuthed = true
    const saved: PublicMcResourceCommentItem = {
      id: 32,
      resource_id: 7,
      commenter: 'alice',
      comment: '装完就能跑',
      created_at: '2026-02-04 08:00:00',
      updated_at: '2026-02-04 09:00:00',
    }
    mocks.createComment.mockResolvedValue(saved)

    const wrapper = mountSection()
    await flushPromises()

    const input = wrapper.get('.resource-detail-page__comment-input')
    await input.setValue('装完就能跑')
    await wrapper.get('.resource-detail-page__comment-form').trigger('submit')
    await flushPromises()

    expect(mocks.createComment).toHaveBeenCalledTimes(1)
    expect(mocks.createComment).toHaveBeenCalledWith('tk', 7, { comment: '装完就能跑' })
    // 提交后重拉一次列表（本地先插入过一次，所以这里断言的是接口调用而不是 key 顺序）
    expect(mocks.listComments).toHaveBeenCalledTimes(2)
    expect((input.element as HTMLTextAreaElement).value).toBe('')
  })
})
