import type { CommentWarning, CommunityPost } from '@/api/community'
import type { ConversationHistoryDisclosure } from '@/api/conversations'

/**
 * 「系统通知」页用例的夹具工厂（R047 拆出的挂载烟测与过户用例共用）。
 *
 * 三类来源的字段都很多，用例只关心被聚合层读到的那几个，所以工厂补齐其余字段，
 * 不在每个用例里铺一整份对象——一份铺开就是几十行，两个 spec 各抄一遍既难比对也超行数预算。
 * 与 `__tests__/notifications.spec.ts` 里的同类工厂同源（那边测纯函数，不跨文件引用，避免耦合）。
 */

export function commentWarningFixture(overrides: Partial<CommentWarning> = {}): CommentWarning {
  return {
    id: 1,
    comment_type: 'community',
    comment_id: 10,
    comment_snapshot: '这条评论被删了',
    reason: '包含广告信息',
    operator: 'admin',
    created_at: '2026-01-02 10:00:00',
    ...overrides,
  }
}

export function communityPostFixture(overrides: Partial<CommunityPost> = {}): CommunityPost {
  return {
    id: 7,
    author: 'admin',
    title: '平台维护公告',
    status: 'published',
    tags: [{ id: 1, name: '公告' }],
    content_html: '<p>本周日凌晨维护，期间暂停下单。</p>',
    like_count: 0,
    comment_count: 0,
    liked_by_me: false,
    favorited_by_me: false,
    published_at: '2026-02-01 12:00:00',
    updated_at: '2026-02-01 12:00:00',
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
    ...overrides,
  }
}

export function historyDisclosureFixture(
  overrides: Partial<ConversationHistoryDisclosure> = {},
): ConversationHistoryDisclosure {
  return {
    id: 3,
    conversation_id: 'CONV-1',
    requirement_id: 'REQ-1',
    requirement_title: '企业官网改版',
    customer: 'cust',
    previous_developer: 'dev_old',
    current_developer: 'dev_new',
    developer_consent: 'pending',
    customer_consent: 'pending',
    status: 'pending',
    created_at: '2026-03-05T09:00:00+08:00',
    ...overrides,
  }
}
