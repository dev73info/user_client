/**
 * 社区域接口。
 *
 * 拆成 posts（标签 / 列表 / 详情 / 发布与更新）、comments（评论与评论警告）、
 * interactions（点赞与收藏）、bounty（悬赏采纳与推广）、共用 types 与前缀常量；
 * 本文件只做汇总导出，调用方仍然 `import ... from '@/api/community'`。
 */
export type {
  CommentWarning,
  CommunityComment,
  CommunityCommentLikeState,
  CommunityFavoriteState,
  CommunityLikeState,
  CommunityPost,
  CommunityPostPayload,
  CommunityPostStatus,
  CommunityTag,
  PostBoostKind,
} from './types'

export {
  createCommunityPost,
  getCommunityPost,
  listCommunityPosts,
  listCommunityTags,
  listFavoriteCommunityPosts,
  updateCommunityPost,
} from './posts'

export { createCommunityComment, listCommunityComments, listMyCommentWarnings } from './comments'

export {
  favoriteCommunityPost,
  likeCommunityComment,
  likeCommunityPost,
  unfavoriteCommunityPost,
  unlikeCommunityComment,
  unlikeCommunityPost,
} from './interactions'

export { acceptBountyAnswer, boostCommunityPost, cancelPostBounty } from './bounty'
