import type { CommunityPost } from '@/api/community'

import { jsonResponse, readInt, readString } from '../../response'
import type { MockRequest, MockRoute } from '../../router'
import { parseMockToken } from '../../token'
import {
  communityComments,
  communityCommentForViewer,
  communityFavorites,
  communityPostForViewer,
  communityPosts,
  communityTags,
  findCommunityPost,
} from './state'

function viewer(request: MockRequest): string {
  return parseMockToken(request.token)?.username ?? ''
}

function visible(post: CommunityPost, username: string): boolean {
  return post.status === 'published' || post.author === username
}

function paged<T>(items: T[], request: MockRequest): T[] {
  const limit = Math.min(50, Math.max(1, readInt(request.query, 'limit', 20)))
  const offset = Math.max(0, readInt(request.query, 'offset', 0))
  return items.slice(offset, offset + limit)
}

function filteredPosts(request: MockRequest, username: string): CommunityPost[] {
  const tag = readString(request.query, 'tag')
  const author = readString(request.query, 'author')
  const status = readString(request.query, 'status')
  const keyword = readString(request.query, 'keyword').toLowerCase()
  return communityPosts.filter(
    (post) =>
      visible(post, username) &&
      (!tag || post.tags.some((item) => item.name === tag)) &&
      (!author || post.author === author) &&
      (!status || post.status === status) &&
      (!keyword ||
        post.title.toLowerCase().startsWith(keyword) ||
        post.author.toLowerCase().startsWith(keyword) ||
        post.tags.some((item) => item.name.toLowerCase().startsWith(keyword))),
  )
}

export const communityReadRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/community/tags',
    note: '社区标签',
    handler: () => jsonResponse(communityTags),
  },
  {
    method: 'GET',
    path: '/community/posts/favorites',
    note: '我的社区收藏',
    handler: (request) => {
      const username = viewer(request)
      if (!username) return jsonResponse({ code: 'UNAUTHENTICATED', message: '请先登录' }, 401)
      const posts = communityPosts.filter(
        (post) => post.status === 'published' && communityFavorites.get(post.id)?.has(username),
      )
      return jsonResponse(
        paged(posts, request).map((post) => communityPostForViewer(post, username)),
      )
    },
  },
  {
    method: 'GET',
    path: '/community/posts',
    note: '社区帖子列表',
    handler: (request) => {
      const username = viewer(request)
      return jsonResponse(
        paged(filteredPosts(request, username), request).map((post) =>
          communityPostForViewer(post, username),
        ),
      )
    },
  },
  {
    method: 'GET',
    path: '/community/posts/:postId',
    note: '社区帖子详情',
    handler: (request, params) => {
      const username = viewer(request)
      const post = findCommunityPost(Number(params.postId))
      if (!post || !visible(post, username)) {
        return jsonResponse({ code: 'COMMUNITY_NOT_FOUND', message: '社区内容不存在' }, 404)
      }
      return jsonResponse(communityPostForViewer(post, username))
    },
  },
  {
    method: 'GET',
    path: '/community/posts/:postId/comments',
    note: '社区评论列表',
    handler: (request, params) => {
      const username = viewer(request)
      const postId = Number(params.postId)
      const post = findCommunityPost(postId)
      if (!post || !visible(post, username)) {
        return jsonResponse({ code: 'COMMUNITY_NOT_FOUND', message: '社区内容不存在' }, 404)
      }
      return jsonResponse(
        communityComments
          .filter((comment) => comment.post_id === postId)
          .map((comment) => communityCommentForViewer(comment, username)),
      )
    },
  },
]
