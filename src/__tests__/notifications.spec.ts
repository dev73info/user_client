import { describe, expect, it } from 'vitest'
import type { AfterSalesCase } from '@/api/afterSales'
import type { CommentWarning, CommunityPost } from '@/api/community'
import type { ConversationHistoryDisclosure } from '@/api/conversations'
import type { ResourceTransferPayload } from '@/api/resourceTransfers'
import {
  announcementPreview,
  buildNotificationCards,
  canVoteHistoryDisclosure,
  countByKind,
  filterNotificationCards,
  parseNoticeTime,
  pendingActionCount,
  pendingVoteCount,
  type NotificationCard,
} from '@/shared/notifications'

/** 三类来源的字段很多，测试只关心被聚合层读到的那些，用工厂补齐其余字段，别在用例里铺一整份对象。 */
function warning(overrides: Partial<CommentWarning> = {}): CommentWarning {
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

function post(overrides: Partial<CommunityPost> = {}): CommunityPost {
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

function disclosure(
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

function afterSalesCase(overrides: Partial<AfterSalesCase> = {}): AfterSalesCase {
  return {
    id: 5,
    caseNo: 'AFTERSALES_1_abc',
    requirementId: 'REQ-1',
    requirementTitle: '企业官网改版',
    requirementStatus: 'completed',
    openedBy: 'cust',
    openerRole: 'customer',
    expectsMoney: true,
    expectsRework: false,
    requiresRework: false,
    description: '交付物未满足验收标准，协商不成。',
    status: 'support_reviewing',
    liableParty: null,
    claimAmountFen: 1000,
    claimAmountCny: '10.00',
    refundAmountFen: 0,
    refundAmountCny: '0.00',
    compensationAmountFen: 0,
    compensationAmountCny: '0.00',
    shortfallFen: 0,
    shortfallCny: '0.00',
    providerRefundId: null,
    providerDepositConfirmId: null,
    resolutionNote: null,
    resolvedBy: null,
    resolvedAt: null,
    decisionDeadlineAt: '2026-04-03T09:00:00+08:00',
    customerDecision: 'opened',
    customerDecidedAt: '2026-04-01T09:00:00+08:00',
    developerDecision: 'reject',
    developerDecidedAt: '2026-04-01T10:00:00+08:00',
    createdAt: '2026-04-01T09:00:00+08:00',
    updatedAt: '2026-04-01T10:00:00+08:00',
    windowClosesAt: '2026-04-16T09:00:00+08:00',
    viewerRole: 'customer',
    ...overrides,
  }
}

function transfer(overrides: Partial<ResourceTransferPayload> = {}): ResourceTransferPayload {
  return {
    transfer_id: 1,
    resource_id: 100,
    resource_name: '企业官网模板',
    from_user: 'dev_old',
    from_team_id: null,
    from_team_name: null,
    to_user: 'dev_new',
    to_team_id: null,
    to_team_name: null,
    status: 'pending',
    message: null,
    from_ownership_type: 'individual',
    initiated_at: '2026-04-10 09:00:00',
    responded_at: null,
    responded_by: null,
    cancelled_at: null,
    ...overrides,
  }
}

const kinds = (cards: NotificationCard[]) => cards.map((card) => card.kind)
const keys = (cards: NotificationCard[]) => cards.map((card) => card.key)

describe('system notification aggregation', () => {
  it('四类来源合成一张列表并按时间倒序', () => {
    const cards = buildNotificationCards({
      warnings: [warning()],
      announcements: [post()],
      disclosures: [disclosure()],
      afterSales: [afterSalesCase()],
      username: 'dev_old',
    })

    // 四类时间格式不一样（公告与警告是后端口径的 `YYYY-MM-DD HH:MM:SS`，公开申请与解除合作案件带时区），
    // 聚合层统一解析后再排序：四月 → 三月 → 二月 → 一月
    expect(kinds(cards)).toEqual([
      'after-sales',
      'history-disclosure',
      'announcement',
      'comment-warning',
    ])
    // 跨类别唯一的键：四类 id 都从 1 开始，只拼 id 会撞在一起
    expect(keys(cards)).toEqual([
      'after-sales-5',
      'history-disclosure-3',
      'announcement-7',
      'comment-warning-1',
    ])
    expect(cards[0]?.kindLabel).toBe('解除合作案件')
    expect(cards[1]?.kindLabel).toBe('公开申请')
    expect(cards[2]?.kindLabel).toBe('平台公告')
    expect(cards[3]?.kindLabel).toBe('评论警告')
  })

  it('解除合作案件卡片只读：标题取需求名，正文写清诉求额度与当前状态', () => {
    const [card] = buildNotificationCards({ afterSales: [afterSalesCase()], username: 'cust' })

    expect(card?.title).toBe('企业官网改版')
    expect(card?.body).toEqual([
      'AFTERSALES_1_abc · 需求 REQ-1',
      '诉求：要钱（主张金额 10.00 元） · 当前状态：平台裁决中',
    ])
    expect(card?.meta).toBe('2026-04-01T09:00:00+08:00 由 cust 发起')
    // 发起、表态、撤回都在需求列表的解除合作弹窗里做，通知卡片不带动作
    expect(card?.canVote).toBe(false)
    expect(card?.postId).toBeUndefined()
  })

  it('解除合作案件没有主张金额时不显示额度括号', () => {
    const [card] = buildNotificationCards({
      afterSales: [afterSalesCase({ expectsMoney: false, expectsRework: true, claimAmountFen: 0 })],
      username: 'cust',
    })
    expect(card?.body[1]).toBe('诉求：要返工 · 当前状态：平台裁决中')
  })

  it('时间解析不出来时排在最后——格式异常的旧通知不该被顶到最上面', () => {
    const cards = buildNotificationCards({
      warnings: [warning({ id: 9, created_at: '不是时间' }), warning({ id: 1 })],
      username: 'cust',
    })

    expect(keys(cards)).toEqual(['comment-warning-1', 'comment-warning-9'])
    expect(parseNoticeTime('2026-01-02 10:00:00')).toBeGreaterThan(0)
    expect(parseNoticeTime('')).toBe(0)
    expect(parseNoticeTime(null)).toBe(0)
  })

  it('评论警告卡片带原评论快照与原因两行，公告卡片带要跳的帖子 id', () => {
    const [warningCard] = buildNotificationCards({ warnings: [warning()], username: 'cust' })
    expect(warningCard?.title).toBe('社区评论被平台警告')
    expect(warningCard?.body).toEqual(['原评论：这条评论被删了', '警告原因：包含广告信息'])
    expect(warningCard?.postId).toBeUndefined()
    expect(warningCard?.canVote).toBe(false)

    const [resourceWarning] = buildNotificationCards({
      warnings: [warning({ comment_type: 'resource' })],
      username: 'cust',
    })
    expect(resourceWarning?.title).toBe('资源评论被平台警告')

    const [announcement] = buildNotificationCards({ announcements: [post()], username: 'cust' })
    expect(announcement?.postId).toBe(7)
    expect(announcement?.title).toBe('平台维护公告')
    expect(announcement?.meta).toBe('2026-02-01 12:00:00 发布')
  })

  it('公告摘要先净化再剥标签并截断', () => {
    expect(announcementPreview('<p>本周凌晨<strong>维护</strong></p>')).toBe('本周凌晨维护')
    expect(announcementPreview('<p>   </p>')).toBe('点击查看公告全文。')
    expect(announcementPreview('<p>abc</p>', 2)).toBe('ab…')
  })
})

describe('history disclosure voting', () => {
  it('只有轮到我这一票时才判定为可投', () => {
    const item = disclosure()
    // 前任开发者投 developer_consent、客户投 customer_consent
    expect(canVoteHistoryDisclosure(item, 'dev_old')).toBe(true)
    expect(canVoteHistoryDisclosure(item, 'cust')).toBe(true)
    // 现任开发者是申请人，申请本身等他确认，但他不投这两票
    expect(canVoteHistoryDisclosure(item, 'dev_new')).toBe(false)
    // 不相干的人没有票
    expect(canVoteHistoryDisclosure(item, 'someone_else')).toBe(false)
  })

  it('已经投过的那一票不再给按钮', () => {
    expect(canVoteHistoryDisclosure(disclosure({ developer_consent: 'approved' }), 'dev_old')).toBe(
      false,
    )
    expect(canVoteHistoryDisclosure(disclosure({ customer_consent: 'rejected' }), 'cust')).toBe(
      false,
    )
    // 另一方仍可投
    expect(canVoteHistoryDisclosure(disclosure({ developer_consent: 'approved' }), 'cust')).toBe(
      true,
    )
  })

  it('申请已终结（通过或未通过）后双方都不再可投', () => {
    for (const status of ['approved', 'rejected'] as const) {
      expect(canVoteHistoryDisclosure(disclosure({ status }), 'dev_old')).toBe(false)
      expect(canVoteHistoryDisclosure(disclosure({ status }), 'cust')).toBe(false)
    }
  })

  it('卡片上的投票状态说明按「等谁」分三种说法', () => {
    const [mine] = buildNotificationCards({ disclosures: [disclosure()], username: 'dev_old' })
    expect(mine?.canVote).toBe(true)
    expect(mine?.voteHint).toContain('还在等你这一票')

    const [applicant] = buildNotificationCards({ disclosures: [disclosure()], username: 'dev_new' })
    expect(applicant?.canVote).toBe(false)
    expect(applicant?.voteHint).toContain('等双方确认后自动公开')

    const [bystander] = buildNotificationCards({ disclosures: [disclosure()], username: 'other' })
    expect(bystander?.voteHint).toBe('前任开发者 待表决 · 客户 待表决')

    const [settled] = buildNotificationCards({
      disclosures: [
        disclosure({
          status: 'approved',
          developer_consent: 'approved',
          customer_consent: 'approved',
        }),
      ],
      username: 'dev_old',
    })
    expect(settled?.voteHint).toContain('已公开')
    expect(settled?.canVote).toBe(false)
  })

  it('公开申请卡片的标题取需求名，正文写清前后任与公开规则', () => {
    const [card] = buildNotificationCards({ disclosures: [disclosure()], username: 'cust' })
    expect(card?.title).toBe('企业官网改版')
    expect(card?.body[0]).toBe('REQ-1 · 前任开发者 dev_old，现任开发者 dev_new')
    expect(card?.meta).toBe('2026-03-05T09:00:00+08:00 发起')
  })
})

describe('resource transfer notifications', () => {
  it('待我同意的过户：标题、来源、留言与后果，并给同意/拒绝动作', () => {
    const [card] = buildNotificationCards({
      transferInbox: [transfer({ message: '麻烦接手一下' })],
      username: 'dev_new',
    })

    expect(card?.kind).toBe('resource-transfer')
    expect(card?.kindLabel).toBe('资源过户')
    expect(card?.title).toBe('接收资源「企业官网模板」')
    expect(card?.body).toEqual([
      '来自 开发者 dev_old · 发起于 2026-04-10 09:00:00',
      '留言：麻烦接手一下',
      '同意后资源归你所有，原所有者将不再拥有它。',
    ])
    expect(card?.transferId).toBe(1)
    expect(card?.transferAction).toBe('respond')
    // 收件箱里的申请已经轮到我处理
    expect(pendingActionCount([card!])).toBe(1)
  })

  it('团队发起的过户取团队名', () => {
    const [card] = buildNotificationCards({
      transferInbox: [transfer({ from_team_id: 9, from_team_name: '设计组' })],
      username: 'dev_new',
    })
    expect(card?.body[0]).toBe('来自 团队 设计组 · 发起于 2026-04-10 09:00:00')
  })

  it('我发起的：pending 给撤销，已处理的不再给动作', () => {
    const [pending] = buildNotificationCards({
      myTransfers: [transfer({ to_user: 'dev_new', status: 'pending' })],
      username: 'dev_old',
    })
    expect(pending?.title).toBe('转出资源「企业官网模板」')
    expect(pending?.body[0]).toBe('转给 开发者 dev_new · 当前状态：等待对方同意')
    expect(pending?.transferAction).toBe('cancel')
    // 自己发起的申请不占「待我处理」
    expect(pendingActionCount([pending!])).toBe(0)

    const [accepted] = buildNotificationCards({
      myTransfers: [transfer({ status: 'accepted', responded_at: '2026-04-11 10:00:00' })],
      username: 'dev_old',
    })
    expect(accepted?.transferAction).toBeUndefined()
    expect(accepted?.body).toContain('对方处理于 2026-04-11 10:00:00')
  })
})

describe('notification filtering and counts', () => {
  const cards = buildNotificationCards({
    warnings: [warning()],
    announcements: [post()],
    disclosures: [disclosure()],
    afterSales: [afterSalesCase()],
    transferInbox: [transfer()],
    username: 'dev_old',
  })

  it('类别筛选与关键字搜索覆盖标题、正文与弱信息行', () => {
    expect(kinds(filterNotificationCards(cards, 'announcement', ''))).toEqual(['announcement'])
    expect(kinds(filterNotificationCards(cards, 'all', ''))).toEqual(kinds(cards))
    // 搜正文里的词：用户记得的多半是「公告里提过什么」，只搜标题会搜不到
    expect(keys(filterNotificationCards(cards, 'all', '维护'))).toEqual(['announcement-7'])
    // 搜弱信息行（操作人）
    expect(keys(filterNotificationCards(cards, 'all', 'admin'))).toContain('comment-warning-1')
    // 类别与关键字同时生效
    expect(filterNotificationCards(cards, 'comment-warning', '维护')).toEqual([])
    // 大小写不敏感 + 首尾空格不影响结果
    expect(keys(filterNotificationCards(cards, 'all', '  ADMIN  '))).toContain('comment-warning-1')
  })

  it('读数条与筛选胶囊的计数取自同一处', () => {
    expect(countByKind(cards)).toEqual({
      'comment-warning': 1,
      'history-disclosure': 1,
      'resource-transfer': 1,
      'after-sales': 1,
      announcement: 1,
    })
    // 还在等我投票的公开申请
    expect(pendingVoteCount(cards)).toBe(1)
    expect(
      pendingVoteCount(
        buildNotificationCards({ disclosures: [disclosure()], username: 'dev_new' }),
      ),
    ).toBe(0)
    // 「待我处理」= 等我投的一票 + 等我同意的过户
    expect(pendingActionCount(cards)).toBe(2)
  })
})
