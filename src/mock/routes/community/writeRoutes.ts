import type { components } from '@/api/generated/schema'
import type {
  CreateCommunityCommentPayload,
  CreateCommunityPostPayload,
  UpdateCommunityPostPayload,
} from '@/api/community'

import { jsonResponse } from '../../response'
import type { MockRequest, MockRoute } from '../../router'
import { parseMockToken } from '../../token'
import { nowText } from '../common/helpers'
import {
  communityCommentForViewer,
  communityCommentLikes,
  communityComments,
  communityFavorites,
  communityPostForViewer,
  communityPostLikes,
  communityPosts,
  findCommunityComment,
  findCommunityPost,
  nextCommunityId,
  resolveCommunityTags,
  setCommunityReaction,
} from './state'

function authorized(request: MockRequest, action: (username: string) => Response): Response {
  const username = parseMockToken(request.token)?.username ?? ''
  return username
    ? action(username)
    : jsonResponse({ code: 'UNAUTHENTICATED', message: '请先登录' }, 401)
}

function notFound(): Response {
  return jsonResponse({ code: 'COMMUNITY_NOT_FOUND', message: '社区内容不存在' }, 404)
}

function forbidden(): Response {
  return jsonResponse({ code: 'FORBIDDEN', message: '没有操作权限' }, 403)
}

export const communityWriteRoutes: MockRoute[] = [
  {
    method: 'POST',
    path: '/community/posts',
    note: '发布社区帖子',
    handler: (request) =>
      authorized(request, (username) => {
        const body = request.body as CreateCommunityPostPayload
        const now = nowText()
        const post = {
          id: nextCommunityId(communityPosts),
          author: username,
          author_avatar_url: null,
          author_username_gradient: false,
          author_username_color: null,
          title: body.title.trim(),
          status: 'pending_review',
          review_note: null,
          reviewed_by: null,
          reviewed_at: null,
          tags: resolveCommunityTags(body.tag_names),
          content_html: body.content_html,
          like_count: 0,
          comment_count: 0,
          liked_by_me: false,
          favorited_by_me: false,
          published_at: now,
          updated_at: now,
          origin_type: body.origin_type ?? 'original',
          origin_author: body.origin_author ?? null,
          origin_url: body.origin_url ?? null,
          origin_org: body.origin_org ?? null,
          origin_note: body.origin_note ?? null,
          bounty_points: body.bounty_points ?? 0,
          bounty_status: (body.bounty_points ?? 0) > 0 ? 'active' : 'none',
          bounty_accepted_comment_id: null,
          is_featured: false,
          featured_at: null,
          bumped_at: null,
          highlight_until: null,
          homepage_until: null,
          section_until: null,
          hot_until: null,
        }
        communityPosts.unshift(post)
        return jsonResponse(communityPostForViewer(post, username), 201)
      }),
  },
  {
    method: 'PATCH',
    path: '/community/posts/:postId',
    note: '编辑本人社区帖子',
    handler: (request, params) =>
      authorized(request, (username) => {
        const post = findCommunityPost(Number(params.postId))
        if (!post) return notFound()
        if (post.author !== username) return forbidden()
        const body = request.body as UpdateCommunityPostPayload
        Object.assign(post, {
          title: body.title.trim(),
          content_html: body.content_html,
          tags: resolveCommunityTags(body.tag_names),
          origin_type: body.origin_type ?? post.origin_type,
          origin_author: body.origin_author ?? post.origin_author,
          origin_url: body.origin_url ?? post.origin_url,
          origin_org: body.origin_org ?? post.origin_org,
          origin_note: body.origin_note ?? post.origin_note,
          status: 'pending_review',
          review_note: null,
          reviewed_by: null,
          reviewed_at: null,
          updated_at: nowText(),
        })
        return jsonResponse(communityPostForViewer(post, username))
      }),
  },
  {
    method: 'POST',
    path: '/community/posts/:postId/comments',
    note: '发布社区评论或回复',
    handler: (request, params) =>
      authorized(request, (username) => {
        const post = findCommunityPost(Number(params.postId))
        if (!post || post.status !== 'published') return notFound()
        const body = request.body as CreateCommunityCommentPayload
        const parent = body.parent_comment_id ? findCommunityComment(body.parent_comment_id) : null
        const now = nowText()
        const comment = {
          id: nextCommunityId(communityComments),
          post_id: post.id,
          parent_comment_id: parent?.id ?? null,
          parent_commenter: parent?.commenter ?? null,
          commenter: username,
          commenter_avatar_url: null,
          commenter_username_gradient: false,
          commenter_username_color: null,
          comment_text: body.comment.trim(),
          like_count: 0,
          liked_by_me: false,
          created_at: now,
          updated_at: now,
        }
        communityComments.push(comment)
        post.comment_count += 1
        return jsonResponse(communityCommentForViewer(comment, username), 201)
      }),
  },
  {
    method: '*',
    path: '/community/posts/:postId/likes',
    note: '帖子点赞与取消',
    handler: (request, params) =>
      authorized(request, (username) => {
        const post = findCommunityPost(Number(params.postId))
        if (!post || post.status !== 'published') return notFound()
        const liked = request.method === 'POST'
        setCommunityReaction(communityPostLikes, post.id, username, liked)
        return jsonResponse({
          post_id: post.id,
          liked_by_me: liked,
          like_count: communityPostLikes.get(post.id)?.size ?? 0,
        })
      }),
  },
  {
    method: '*',
    path: '/community/comments/:commentId/likes',
    note: '评论点赞与取消',
    handler: (request, params) =>
      authorized(request, (username) => {
        const comment = findCommunityComment(Number(params.commentId))
        const post = comment ? findCommunityPost(comment.post_id) : undefined
        if (!comment || post?.status !== 'published') return notFound()
        const liked = request.method === 'POST'
        setCommunityReaction(communityCommentLikes, comment.id, username, liked)
        return jsonResponse({
          comment_id: comment.id,
          liked_by_me: liked,
          like_count: communityCommentLikes.get(comment.id)?.size ?? 0,
        })
      }),
  },
  {
    method: '*',
    path: '/community/posts/:postId/favorites',
    note: '帖子收藏与取消',
    handler: (request, params) =>
      authorized(request, (username) => {
        const post = findCommunityPost(Number(params.postId))
        if (!post || post.status !== 'published') return notFound()
        const favorited = request.method === 'POST'
        setCommunityReaction(communityFavorites, post.id, username, favorited)
        return jsonResponse({ post_id: post.id, favorited_by_me: favorited })
      }),
  },
  {
    method: 'POST',
    path: '/community/posts/:postId/bounty/accept/:commentId',
    note: '采纳悬赏回答',
    handler: (request, params) =>
      authorized(request, (username) => {
        const post = findCommunityPost(Number(params.postId))
        const comment = findCommunityComment(Number(params.commentId))
        if (!post || !comment) return notFound()
        if (post.author !== username) return forbidden()
        post.bounty_status = 'closed'
        post.bounty_accepted_comment_id = comment.id
        return jsonResponse(communityPostForViewer(post, username))
      }),
  },
  {
    method: 'POST',
    path: '/community/posts/:postId/bounty/cancel',
    note: '取消悬赏',
    handler: (request, params) =>
      authorized(request, (username) => {
        const post = findCommunityPost(Number(params.postId))
        if (!post) return notFound()
        if (post.author !== username) return forbidden()
        post.bounty_status = 'cancelled'
        post.bounty_accepted_comment_id = null
        return jsonResponse(communityPostForViewer(post, username))
      }),
  },
  {
    method: 'POST',
    path: '/community/posts/:postId/boost',
    note: '社区积分推广',
    handler: (request, params) =>
      authorized(request, (username) => {
        const post = findCommunityPost(Number(params.postId))
        if (!post) return notFound()
        if (post.author !== username) return forbidden()
        const body = request.body as components['schemas']['SetPostBoostRequest']
        const until = nowText()
        if (body.kind === 'bump') post.bumped_at = until
        if (body.kind === 'highlight') post.highlight_until = until
        if (body.kind === 'homepage') post.homepage_until = until
        if (body.kind === 'section') post.section_until = until
        if (body.kind === 'hot') post.hot_until = until
        return jsonResponse(communityPostForViewer(post, username))
      }),
  },
]
