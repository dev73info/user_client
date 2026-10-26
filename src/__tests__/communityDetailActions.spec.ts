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
  likePost: vi.fn(),
  favoritePost: vi.fn(),
  acceptBounty: vi.fn(),
  cancelBounty: vi.fn(),
  boostPost: vi.fn(),
}))

vi.mock('@/api/community', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/community')>()),
  getCommunityPost: mocks.getPost,
  listCommunityComments: mocks.listComments,
  setCommunityPostLike: mocks.likePost,
  setCommunityPostFavorite: mocks.favoritePost,
  acceptCommunityBounty: mocks.acceptBounty,
  cancelCommunityBounty: mocks.cancelBounty,
  boostCommunityPost: mocks.boostPost,
}))
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
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mocks.getPost.mockResolvedValue(
    makeCommunityPost({ bounty_points: 100, bounty_status: 'active' }),
  )
  mocks.listComments.mockResolvedValue([makeCommunityComment()])
  mocks.likePost.mockResolvedValue({ post_id: 7, liked_by_me: true, like_count: 1 })
  mocks.favoritePost.mockResolvedValue({ post_id: 7, favorited_by_me: true })
  mocks.acceptBounty.mockResolvedValue(
    makeCommunityPost({
      bounty_points: 100,
      bounty_status: 'closed',
      bounty_accepted_comment_id: 11,
    }),
  )
  mocks.cancelBounty.mockResolvedValue(
    makeCommunityPost({ bounty_points: 100, bounty_status: 'cancelled' }),
  )
  mocks.boostPost.mockResolvedValue(
    makeCommunityPost({
      bounty_points: 100,
      bounty_status: 'active',
      bumped_at: '2026-10-26 12:00:00',
    }),
  )
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('社区帖子动作', () => {
  it('帖子点赞和收藏使用服务端返回状态', async () => {
    const wrapper = await render()
    await wrapper.get('.community-detail-card__like').trigger('click')
    await flushPromises()
    expect(mocks.likePost).toHaveBeenCalledWith('token', 7, true)
    expect(wrapper.get('.community-detail-card__like').text()).toContain('取消点赞')

    await wrapper.get('.community-detail-card__favorite').trigger('click')
    await flushPromises()
    expect(mocks.favoritePost).toHaveBeenCalledWith('token', 7, true)
    expect(wrapper.get('.community-detail-card__favorite').text()).toContain('取消收藏')
    wrapper.unmount()
  })

  it('作者可采纳悬赏回答，采纳状态回显', async () => {
    const wrapper = await render()
    const accept = wrapper.findAll('button').find((item) => item.text() === '采纳为答案')
    await accept?.trigger('click')
    await flushPromises()
    expect(mocks.acceptBounty).toHaveBeenCalledWith('token', 7, 11)
    expect(wrapper.text()).toContain('已采纳')
    expect(wrapper.get('[data-comment-id="11"]').text()).toContain('已采纳')
    wrapper.unmount()
  })

  it('作者可取消进行中的悬赏', async () => {
    const wrapper = await render()
    const cancel = wrapper.findAll('button').find((item) => item.text() === '取消悬赏')
    await cancel?.trigger('click')
    await flushPromises()
    expect(mocks.cancelBounty).toHaveBeenCalledWith('token', 7)
    expect(wrapper.text()).toContain('已取消')
    wrapper.unmount()
  })

  it('积分不足留在推广弹窗展示，成功后才关闭', async () => {
    mocks.boostPost.mockRejectedValueOnce(
      new HttpError(400, '积分不足', 'COMMUNITY_INSUFFICIENT_POINTS'),
    )
    const wrapper = await render()
    const boost = wrapper.findAll('button').find((item) => item.text() === '积分推广')
    await boost?.trigger('click')
    const confirm = () =>
      Array.from(document.body.querySelectorAll('button')).find(
        (item) => item.textContent?.trim() === '确认推广',
      )
    confirm()?.click()
    await flushPromises()
    expect(document.body.textContent).toContain('积分不足')
    expect(document.body.textContent).toContain('当前积分余额不足')
    expect(document.body.textContent).toContain('积分推广')

    confirm()?.click()
    await flushPromises()
    expect(mocks.boostPost).toHaveBeenCalledTimes(2)
    expect(mocks.boostPost).toHaveBeenLastCalledWith('token', 7, 'bump')
    wrapper.unmount()
  })

  it('非作者不显示编辑、推广和悬赏管理入口', async () => {
    const wrapper = await render('other')
    const labels = wrapper.findAll('button').map((item) => item.text())
    expect(labels).not.toContain('编辑帖子')
    expect(labels).not.toContain('积分推广')
    expect(labels).not.toContain('采纳为答案')
    expect(labels).not.toContain('取消悬赏')
    wrapper.unmount()
  })
})
