import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  acceptCommunityBounty,
  boostCommunityPost,
  cancelCommunityBounty,
  createCommunityComment,
  createCommunityPost,
  getCommunityPost,
  listCommunityComments,
  listCommunityPosts,
  listCommunityTags,
  listFavoriteCommunityPosts,
  setCommunityCommentLike,
  setCommunityPostFavorite,
  setCommunityPostLike,
  updateCommunityPost,
} from '@/api/community'
import { communityPostPayload } from '@/__tests__/fixtures/community'

const fetchMock = vi.fn()

function lastCall() {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] ?? []
  return { url: String(url), init: init as RequestInit }
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve(
        new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      ),
    )
})

afterEach(() => vi.unstubAllGlobals())

describe('社区 API 契约', () => {
  it('列表与收藏使用真实查询参数和 Bearer 令牌', async () => {
    const query = {
      limit: 10,
      offset: 20,
      tag: '前端',
      author: 'alice',
      status: 'published',
      keyword: '路由',
    }
    await listCommunityPosts('token', query)
    let { url, init } = lastCall()
    let params = new URL(url, 'http://local').searchParams
    expect(url).toContain('/api/community/posts?')
    expect(Object.fromEntries(params)).toEqual({
      limit: '10',
      offset: '20',
      tag: '前端',
      author: 'alice',
      status: 'published',
      keyword: '路由',
    })
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer token')

    await listFavoriteCommunityPosts('token', { limit: 10, offset: 10 })
    ;({ url, init } = lastCall())
    params = new URL(url, 'http://local').searchParams
    expect(url).toContain('/api/community/posts/favorites?')
    expect(params.get('offset')).toBe('10')
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer token')

    await listCommunityTags()
    expect(lastCall().url).toContain('/api/community/tags')
  })

  it('详情、发帖与本人编辑使用契约方法和载荷', async () => {
    await getCommunityPost('token', 7)
    expect(lastCall().url).toContain('/api/community/posts/7')

    await createCommunityPost('token', communityPostPayload)
    let call = lastCall()
    expect(call.url).toContain('/api/community/posts')
    expect(call.init.method).toBe('POST')
    expect(JSON.parse(String(call.init.body))).toEqual(communityPostPayload)

    const { bounty_points: _bounty, ...updatePayload } = communityPostPayload
    await updateCommunityPost('token', 7, updatePayload)
    call = lastCall()
    expect(call.url).toContain('/api/community/posts/7')
    expect(call.init.method).toBe('PATCH')
    expect(JSON.parse(String(call.init.body))).toEqual(updatePayload)
  })

  it('评论、回复与评论点赞覆盖创建和取消', async () => {
    await listCommunityComments('token', 7)
    expect(lastCall().url).toContain('/api/community/posts/7/comments')

    await createCommunityComment('token', 7, { comment: '回复', parent_comment_id: 11 })
    let call = lastCall()
    expect(call.init.method).toBe('POST')
    expect(JSON.parse(String(call.init.body))).toEqual({
      comment: '回复',
      parent_comment_id: 11,
    })

    await setCommunityCommentLike('token', 11, true)
    call = lastCall()
    expect(call.url).toContain('/api/community/comments/11/likes')
    expect(call.init.method).toBe('POST')
    await setCommunityCommentLike('token', 11, false)
    expect(lastCall().init.method).toBe('DELETE')
  })

  it('帖子点赞与收藏都提供取消动作', async () => {
    await setCommunityPostLike('token', 7, true)
    expect(lastCall().init.method).toBe('POST')
    await setCommunityPostLike('token', 7, false)
    expect(lastCall().url).toContain('/api/community/posts/7/likes')
    expect(lastCall().init.method).toBe('DELETE')

    await setCommunityPostFavorite('token', 7, true)
    expect(lastCall().init.method).toBe('POST')
    await setCommunityPostFavorite('token', 7, false)
    expect(lastCall().url).toContain('/api/community/posts/7/favorites')
    expect(lastCall().init.method).toBe('DELETE')
  })

  it('悬赏采纳、取消与积分推广走既有端点', async () => {
    await acceptCommunityBounty('token', 7, 11)
    expect(lastCall().url).toContain('/api/community/posts/7/bounty/accept/11')
    expect(lastCall().init.method).toBe('POST')

    await cancelCommunityBounty('token', 7)
    expect(lastCall().url).toContain('/api/community/posts/7/bounty/cancel')

    await boostCommunityPost('token', 7, 'homepage')
    const call = lastCall()
    expect(call.url).toContain('/api/community/posts/7/boost')
    expect(JSON.parse(String(call.init.body))).toEqual({ kind: 'homepage' })
  })
})
