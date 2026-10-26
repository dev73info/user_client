import type { CommunityBoostKind, CommunityPost } from '@/api/community'
import { describeBackendError } from '@/shared/backendErrorText'

export const COMMUNITY_STATUS_OPTIONS = [
  { value: 'pending_review', label: '审核中' },
  { value: 'published', label: '已发布' },
  { value: 'rejected', label: '未通过' },
] as const

export const COMMUNITY_BOOST_OPTIONS: ReadonlyArray<{
  value: CommunityBoostKind
  label: string
}> = [
  { value: 'bump', label: '顶帖' },
  { value: 'highlight', label: '高亮' },
  { value: 'homepage', label: '首页推荐' },
  { value: 'section', label: '版块推荐' },
  { value: 'hot', label: '热门推荐' },
]

export function communityStatusLabel(status: string): string {
  return COMMUNITY_STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status
}

export function communityBountyLabel(status: string): string {
  const labels: Record<string, string> = {
    active: '悬赏中',
    closed: '已采纳',
    cancelled: '已取消',
  }
  return labels[status] ?? status
}

export function communityStatusNotice(post: CommunityPost): string {
  if (post.status === 'pending_review') {
    return '帖子审核中，仅作者本人可见'
  }
  if (post.status === 'rejected') {
    return post.review_note ? `审核未通过：${post.review_note}` : '审核未通过'
  }
  return ''
}

export function isCommunityPostAuthor(post: CommunityPost, username: string): boolean {
  return Boolean(username.trim()) && post.author === username.trim()
}

export function describeCommunityError(error: unknown, fallback: string): string {
  return describeBackendError(error, fallback)
}
