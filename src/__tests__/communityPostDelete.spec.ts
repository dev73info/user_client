import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HttpError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import CommunityPostDetailView from '@/views/CommunityPostDetailView.vue'
import { makeCommunityComment, makeCommunityPost } from '@/__tests__/fixtures/community'

const mocks = vi.hoisted(() => ({
  getPost: vi.fn(),
  listComments: vi.fn(),
  deletePost: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('@/api/community', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/community')>()),
  getCommunityPost: mocks.getPost,
  listCommunityComments: mocks.listComments,
  deleteCommunityPost: mocks.deletePost,
}))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessageBox: { ...actual.TMessageBox, confirm: mocks.confirm },
  }
})
vi.mock('@/components/RichTextEditor.vue', () => ({ default: { template: '<div />' } }))

async function render(username = 'alice') {
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
    ],
  })
  await router.push('/community/posts/7')
  const auth = useAuthStore()
  auth.token = 'token'
  auth.username = username
  const wrapper = mount(CommunityPostDetailView, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

function deleteButton(wrapper: Awaited<ReturnType<typeof render>>['wrapper']) {
  return wrapper.findAll('button').find((item) => item.text() === '删除')
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mocks.getPost.mockResolvedValue(makeCommunityPost())
  mocks.listComments.mockResolvedValue([makeCommunityComment()])
  mocks.deletePost.mockResolvedValue(undefined)
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('删除自己的帖子', () => {
  it('确认后删除并回到社区列表', async () => {
    mocks.confirm.mockResolvedValue(true)
    const { wrapper, router } = await render()

    await deleteButton(wrapper)?.trigger('click')
    await flushPromises()

    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    expect(mocks.deletePost).toHaveBeenCalledWith('token', 7)
    expect(router.currentRoute.value.name).toBe('community')
    wrapper.unmount()
  })

  it('取消确认不发删除请求', async () => {
    mocks.confirm.mockResolvedValue(false)
    const { wrapper, router } = await render()

    await deleteButton(wrapper)?.trigger('click')
    await flushPromises()

    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    expect(mocks.deletePost).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('community-post')
    wrapper.unmount()
  })

  it('删除失败留在原页并提示原因', async () => {
    mocks.confirm.mockResolvedValue(true)
    mocks.deletePost.mockRejectedValue(new HttpError(500, '服务不可用'))
    const { wrapper, router } = await render()

    await deleteButton(wrapper)?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('服务不可用')
    expect(router.currentRoute.value.name).toBe('community-post')
    wrapper.unmount()
  })
})
