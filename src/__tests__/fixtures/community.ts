import type { CommunityComment, CommunityPost, CommunityTag } from '@/api/community'

export const communityTag: CommunityTag = { id: 1, name: '前端' }

export function makeCommunityPost(patch: Partial<CommunityPost> = {}): CommunityPost {
  return {
    id: 7,
    author: 'alice',
    author_avatar_url: null,
    author_username_gradient: false,
    author_username_color: null,
    title: '社区测试帖',
    status: 'published',
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
    tags: [communityTag],
    content_html: '<p>正文</p>',
    like_count: 0,
    comment_count: 1,
    liked_by_me: false,
    favorited_by_me: false,
    published_at: '2026-10-26 09:00:00',
    updated_at: '2026-10-26 09:00:00',
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
    ...patch,
  }
}

export function makeCommunityComment(patch: Partial<CommunityComment> = {}): CommunityComment {
  return {
    id: 11,
    post_id: 7,
    parent_comment_id: null,
    parent_commenter: null,
    commenter: 'bob',
    commenter_avatar_url: null,
    commenter_username_gradient: false,
    commenter_username_color: null,
    comment_text: '一条回复',
    like_count: 0,
    liked_by_me: false,
    created_at: '2026-10-26 10:00:00',
    updated_at: '2026-10-26 10:00:00',
    ...patch,
  }
}

export const communityPostPayload = {
  title: '新帖子',
  tag_names: ['前端'],
  content_html: '<p>新内容</p>',
  origin_type: 'original',
  origin_author: null,
  origin_url: null,
  origin_org: null,
  origin_note: null,
  bounty_points: 0,
}
