export type CommunityTag = {
  id: number
  name: string
}

export type CommunityPostStatus = 'pending_review' | 'published' | 'rejected'

export type CommunityPost = {
  id: number
  author: string
  author_avatar_url?: string | null
  author_username_gradient?: boolean
  author_username_color?: string | null
  title: string
  status: CommunityPostStatus
  review_note?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  tags: CommunityTag[]
  content_html: string
  like_count: number
  comment_count: number
  liked_by_me: boolean
  favorited_by_me: boolean
  published_at: string
  updated_at: string
  origin_type: 'original' | 'repost'
  origin_author: string | null
  origin_url: string | null
  origin_org: string | null
  origin_note: string | null
  bounty_points: number
  bounty_status: 'none' | 'active' | 'closed' | 'cancelled'
  bounty_accepted_comment_id: number | null
  is_featured: boolean
  featured_at: string | null
  bumped_at: string | null
  highlight_until: string | null
  homepage_until: string | null
  section_until: string | null
  hot_until: string | null
}

export type PostBoostKind = 'bump' | 'highlight' | 'homepage' | 'section' | 'hot'

export type CommunityComment = {
  id: number
  post_id: number
  parent_comment_id?: number | null
  parent_commenter?: string | null
  commenter: string
  commenter_avatar_url?: string | null
  commenter_username_gradient?: boolean
  commenter_username_color?: string | null
  comment_text: string
  like_count: number
  liked_by_me: boolean
  created_at: string
  updated_at: string
}

export type CommentWarning = {
  id: number
  comment_type: 'community' | 'resource'
  comment_id: number
  comment_snapshot: string
  reason: string
  operator: string
  created_at: string
}

export type CommunityCommentLikeState = {
  comment_id: number
  liked_by_me: boolean
  like_count: number
}

export type CommunityLikeState = {
  post_id: number
  liked_by_me: boolean
  like_count: number
}

export type CommunityFavoriteState = {
  post_id: number
  favorited_by_me: boolean
}

export type CommunityPostPayload = {
  title: string
  tag_names: string[]
  content_html: string
  origin_type?: 'original' | 'repost' | null
  origin_author?: string | null
  origin_url?: string | null
  origin_org?: string | null
  origin_note?: string | null
  /** 悬赏积分数，仅发帖时生效（0 或缺省表示无悬赏）。 */
  bounty_points?: number
}
