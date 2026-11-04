import type { CommunityComment } from '@/api/community'

import { CLIENT_USERNAME, DEV_USERNAME, datetime } from '../../db/shared'
import { currentMockProfile } from '../../identity'
import { nowText } from '../common/helpers'

type CommunityCommentSeed = Omit<
  Partial<CommunityComment>,
  'id' | 'post_id' | 'comment_text' | 'created_at'
> & {
  id: number
  post_id: number
  comment_text: string
  created_at: string
}

function communityComment(seed: CommunityCommentSeed): CommunityComment {
  const { created_at, ...rest } = seed
  return {
    commenter: currentMockProfile().username,
    parent_comment_id: null,
    parent_commenter: null,
    commenter_avatar_url: null,
    commenter_username_gradient: false,
    commenter_username_color: null,
    like_count: 0,
    liked_by_me: false,
    updated_at: created_at,
    ...rest,
    created_at,
  }
}

export const communityComments: CommunityComment[] = [
  communityComment({
    id: 1,
    post_id: 2,
    commenter: DEV_USERNAME,
    comment_text: '虚拟滚动配合固定行高效果最稳，动态高度要留缓冲区。',
    like_count: 4,
    created_at: datetime(-3, 13, 5),
  }),
  communityComment({
    id: 2,
    post_id: 2,
    parent_comment_id: 1,
    parent_commenter: DEV_USERNAME,
    commenter: currentMockProfile().username,
    comment_text: '对，我们也是这么做的，滚动容器高度变化时再补一次测量。',
    like_count: 1,
    created_at: datetime(-3, 14, 20),
  }),
  communityComment({
    id: 3,
    post_id: 3,
    commenter: currentMockProfile().username,
    comment_text: '代理层关闭缓冲这一步很容易漏，尤其前面挂了 Nginx。',
    like_count: 2,
    created_at: datetime(-4, 11, 40),
  }),
  communityComment({
    id: 4,
    post_id: 1,
    commenter: DEV_USERNAME,
    comment_text: '这个示例帖可以用来验证评论区的排序、点赞和回复展示。',
    like_count: 3,
    created_at: nowText(),
  }),
  communityComment({
    id: 5,
    post_id: 1,
    commenter: CLIENT_USERNAME,
    comment_text: '收到，后续新增的评论会按时间顺序展示。',
    like_count: 2,
    created_at: nowText(),
  }),
  communityComment({
    id: 6,
    post_id: 1,
    parent_comment_id: 4,
    parent_commenter: DEV_USERNAME,
    commenter: CLIENT_USERNAME,
    comment_text: '建议再补一条带换行的评论，方便检查行高和间距。',
    like_count: 1,
    created_at: nowText(),
  }),
  communityComment({
    id: 7,
    post_id: 1,
    commenter: DEV_USERNAME,
    comment_text: '已经补上了。长评论超过两行时，列表滚动和输入框状态也需要一起验证。',
    like_count: 4,
    created_at: nowText(),
  }),
  communityComment({
    id: 8,
    post_id: 1,
    parent_comment_id: 5,
    parent_commenter: CLIENT_USERNAME,
    commenter: DEV_USERNAME,
    comment_text: '这条是二级回复，用来验证缩进和回复关系。',
    like_count: 2,
    created_at: nowText(),
  }),
  communityComment({
    id: 9,
    post_id: 1,
    commenter: CLIENT_USERNAME,
    comment_text: '点赞、回复、评论计数都可以用这组数据做回归。',
    like_count: 5,
    created_at: nowText(),
  }),
  communityComment({
    id: 10,
    post_id: 1,
    commenter: DEV_USERNAME,
    comment_text: '补充一条较长的评论，检查内容在窄屏和桌面端都能自然换行，不会挤压右侧点赞区域。',
    like_count: 7,
    created_at: datetime(0, 12, 50),
  }),
  communityComment({
    id: 11,
    post_id: 1,
    parent_comment_id: 10,
    parent_commenter: DEV_USERNAME,
    commenter: CLIENT_USERNAME,
    comment_text: '长评论已经能正常换行，接下来主要看连续多条时滚动是否跟手。',
    like_count: 3,
    created_at: datetime(0, 12, 47),
  }),
  communityComment({
    id: 12,
    post_id: 1,
    commenter: CLIENT_USERNAME,
    comment_text: '建议再放一条短评，用来对比长文本和短文本的间距。',
    like_count: 6,
    created_at: datetime(0, 12, 41),
  }),
  communityComment({
    id: 13,
    post_id: 1,
    parent_comment_id: 12,
    parent_commenter: CLIENT_USERNAME,
    commenter: DEV_USERNAME,
    comment_text: '移动端打开侧栏时，评论列表仍然保持独立滚动，这一点需要重点回归。',
    like_count: 2,
    created_at: datetime(0, 12, 38),
  }),
  communityComment({
    id: 14,
    post_id: 1,
    parent_comment_id: 13,
    parent_commenter: DEV_USERNAME,
    commenter: CLIENT_USERNAME,
    comment_text: '收到，我会同时检查悬停回复框和键盘操作。',
    like_count: 1,
    created_at: datetime(0, 12, 33),
  }),
  communityComment({
    id: 15,
    post_id: 1,
    commenter: CLIENT_USERNAME,
    comment_text:
      '再补一条带两个自然段的信息，验证多行内容不会压缩底部时间和点赞。\n\n第一段检查换行，第二段检查段落间距。',
    like_count: 5,
    created_at: datetime(0, 12, 27),
  }),
  communityComment({
    id: 16,
    post_id: 1,
    parent_comment_id: 15,
    parent_commenter: CLIENT_USERNAME,
    commenter: DEV_USERNAME,
    comment_text: '两段内容在详情页展示正常，折叠列表里也会保留摘要。',
    like_count: 2,
    created_at: datetime(0, 12, 24),
  }),
  communityComment({
    id: 17,
    post_id: 1,
    commenter: DEV_USERNAME,
    comment_text: '评论时间、点赞数和回复关系都使用这组 mock 数据做核验。',
    like_count: 8,
    created_at: datetime(0, 12, 21),
  }),
  communityComment({
    id: 18,
    post_id: 1,
    parent_comment_id: 17,
    parent_commenter: DEV_USERNAME,
    commenter: CLIENT_USERNAME,
    comment_text: '时间顺序没有问题，最新补充的数据排在当前数组末尾。',
    like_count: 3,
    created_at: datetime(0, 12, 17),
  }),
  communityComment({
    id: 19,
    post_id: 1,
    commenter: CLIENT_USERNAME,
    comment_text: '这是一条简短的测试评论。',
    like_count: 4,
    created_at: datetime(0, 12, 13),
  }),
  communityComment({
    id: 20,
    post_id: 1,
    commenter: DEV_USERNAME,
    comment_text: '补充第 11 条评论，用于测试评论数达到两位数后的展示。',
    like_count: 6,
    created_at: datetime(0, 12, 9),
  }),
  communityComment({
    id: 21,
    post_id: 1,
    commenter: CLIENT_USERNAME,
    comment_text: '最后一条用来确认列表底部的留白和最后一项的点击区域。',
    like_count: 9,
    created_at: datetime(0, 12, 5),
  }),
]
