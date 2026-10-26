import type { CommunityComment, CommunityPost, CommunityTag } from '@/api/community'

import { currentMockProfile } from '../../identity'
import { nowText } from '../common/helpers'

export const communityTags: CommunityTag[] = [{ id: 1, name: '示例' }]
export const communityPosts: CommunityPost[] = [
  {
    id: 1,
    author: currentMockProfile().username,
    author_avatar_url: null,
    author_username_gradient: false,
    author_username_color: null,
    title: '社区示例帖',
    status: 'published',
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
    tags: [communityTags[0] as CommunityTag],
    content_html: '<p>Mock 社区数据</p>',
    like_count: 0,
    comment_count: 0,
    liked_by_me: false,
    favorited_by_me: false,
    published_at: nowText(),
    updated_at: nowText(),
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
  },
]
export const communityComments: CommunityComment[] = []
export const communityPostLikes = new Map<number, Set<string>>()
export const communityFavorites = new Map<number, Set<string>>()
export const communityCommentLikes = new Map<number, Set<string>>()

export function nextCommunityId(items: Array<{ id: number }>): number {
  return Math.max(0, ...items.map((item) => item.id)) + 1
}

export function findCommunityPost(id: number): CommunityPost | undefined {
  return communityPosts.find((item) => item.id === id)
}

export function findCommunityComment(id: number): CommunityComment | undefined {
  return communityComments.find((item) => item.id === id)
}

export function communityPostForViewer(post: CommunityPost, username: string): CommunityPost {
  const likes = communityPostLikes.get(post.id) ?? new Set<string>()
  const favorites = communityFavorites.get(post.id) ?? new Set<string>()
  return {
    ...post,
    tags: post.tags.map((item) => ({ ...item })),
    like_count: likes.size,
    liked_by_me: likes.has(username),
    favorited_by_me: favorites.has(username),
  }
}

export function communityCommentForViewer(
  comment: CommunityComment,
  username: string,
): CommunityComment {
  const likes = communityCommentLikes.get(comment.id) ?? new Set<string>()
  return { ...comment, like_count: likes.size, liked_by_me: likes.has(username) }
}

export function setCommunityReaction(
  reactions: Map<number, Set<string>>,
  id: number,
  username: string,
  active: boolean,
) {
  const users = reactions.get(id) ?? new Set<string>()
  if (active) users.add(username)
  else users.delete(username)
  reactions.set(id, users)
}

export function resolveCommunityTags(names: string[]): CommunityTag[] {
  return names.map((name) => {
    const normalized = name.trim()
    const existing = communityTags.find((item) => item.name === normalized)
    if (existing) return existing
    const created = { id: nextCommunityId(communityTags), name: normalized }
    communityTags.push(created)
    return created
  })
}
