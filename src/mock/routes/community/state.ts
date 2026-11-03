import type { CommunityComment, CommunityPost, CommunityTag } from '@/api/community'

import {
  communityCommentLikes,
  communityComments,
  communityFavorites,
  communityPostLikes,
  communityPosts,
  communityTags,
} from './state-seed'

export {
  communityCommentLikes,
  communityComments,
  communityFavorites,
  communityPostLikes,
  communityPosts,
  communityTags,
}

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
