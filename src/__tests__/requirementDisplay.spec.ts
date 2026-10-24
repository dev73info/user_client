import { describe, expect, it } from 'vitest'

import type { PublicRequirementSpotlightItem, RequirementOverviewResp } from '@/api/requirements'
import {
  REQUIREMENT_GUARANTEE_FILTERS,
  canOpenRequirementWorkbench,
  dealCommentPreview,
  dealStarClass,
  formatCnDateTime,
  formatCny,
  normalizeRequirementGuaranteeFilter,
  requirementDetailAcceptanceHtml,
  requirementDetailDescriptionHtml,
  requirementGuaranteeRequestMode,
  requirementHallEmptyTitle,
  requirementHallStats,
  requirementMatchesKeyword,
  requirementOwnedByCurrentUser,
  requirementPaymentModeLabel,
  requirementRecentDeals,
} from '@/shared/requirementDisplay'

/**
 * 需求大厅拆分出来的展示层纯函数。
 *
 * 这些口径原先散在 `views/RequirementHallView.vue` 的 computed / 内联函数里，拆分时原样搬进
 * `@/shared/requirementDisplay`；这里逐条钉住，避免「搬家顺手改口径」这类回归。
 */

function spotlight(overrides: Partial<PublicRequirementSpotlightItem> = {}) {
  return {
    requirement_id: 'REQ-1001',
    title: '企业官网改版',
    description: '<p>重做首页与产品页</p>',
    acceptance_criteria: '交付源码与设计稿',
    budget: 8000,
    payment_mode: 'platform_guarantee',
    status: 'pending_deposit',
    creator: 'alice',
    claimable: true,
    created_at: '2026-10-01 10:00:00',
    updated_at: '2026-10-02 10:00:00',
    ...overrides,
  } as PublicRequirementSpotlightItem
}

describe('发布方式与金额格式', () => {
  it('两种支付模式的文案与卡片胶囊同一口径', () => {
    expect(requirementPaymentModeLabel('platform_guarantee')).toBe('电签担保')
    expect(requirementPaymentModeLabel('self_managed')).toBe('无电签约定')
  })

  it('预算为空时给「待议价」，整数不带小数、带小数保留两位', () => {
    expect(formatCny(null)).toBe('待议价')
    expect(formatCny(undefined)).toBe('待议价')
    expect(formatCny(8000)).toContain('8,000')
    expect(formatCny(8000)).not.toContain('.00')
    expect(formatCny(1999.5)).toContain('1,999.50')
  })

  it('时间格式取月日时分，非法时间给「时间未知」', () => {
    expect(formatCnDateTime('2026-10-02T02:30:00Z')).toMatch(/\d{2}\/\d{2}/)
    expect(formatCnDateTime('不是时间')).toBe('时间未知')
  })
})

describe('担保方式筛选的取值与请求参数序列化', () => {
  it('下拉三档：全部 + 两档担保方式，文案跟着发布方式口径走', () => {
    expect(REQUIREMENT_GUARANTEE_FILTERS).toEqual([
      { label: '全部', value: 'all' },
      { label: '电签担保', value: 'platform_guarantee' },
      { label: '无电签约定', value: 'self_managed' },
    ])
  })

  it('下拉回传的杂值一律收敛成 all，合法取值原样保留', () => {
    expect(normalizeRequirementGuaranteeFilter('platform_guarantee')).toBe('platform_guarantee')
    expect(normalizeRequirementGuaranteeFilter('self_managed')).toBe('self_managed')
    expect(normalizeRequirementGuaranteeFilter('all')).toBe('all')
    // 清空（null / undefined / 空串）与不认识的取值都当「不筛」
    expect(normalizeRequirementGuaranteeFilter(null)).toBe('all')
    expect(normalizeRequirementGuaranteeFilter(undefined)).toBe('all')
    expect(normalizeRequirementGuaranteeFilter('')).toBe('all')
    expect(normalizeRequirementGuaranteeFilter(42)).toBe('all')
  })

  it('all 不往请求里带 payment_mode，其余两档原样透传（服务端筛选）', () => {
    expect(requirementGuaranteeRequestMode('all')).toBeUndefined()
    expect(requirementGuaranteeRequestMode('platform_guarantee')).toBe('platform_guarantee')
    expect(requirementGuaranteeRequestMode('self_managed')).toBe('self_managed')
  })
})

describe('关键词筛选', () => {
  it('关词为空时一律命中，不做过滤', () => {
    expect(requirementMatchesKeyword(spotlight(), '')).toBe(true)
    expect(requirementMatchesKeyword(spotlight(), '   ')).toBe(true)
  })

  it('编号、标题与说明正文都能命中，且大小写不敏感', () => {
    expect(requirementMatchesKeyword(spotlight(), 'REQ-1001')).toBe(true)
    expect(requirementMatchesKeyword(spotlight(), 'req-1001')).toBe(true)
    expect(requirementMatchesKeyword(spotlight(), '官网')).toBe(true)
    // 说明是富文本，按纯文本预览参与搜索（标签不参与）
    expect(requirementMatchesKeyword(spotlight(), '产品页')).toBe(true)
  })

  it('担保方式与状态文案也进搜索串（用户按「待付定金」能搜到）', () => {
    expect(requirementMatchesKeyword(spotlight(), '电签担保')).toBe(true)
    expect(requirementMatchesKeyword(spotlight(), '待付定金')).toBe(true)
    // deposit_paid 一码两义：按该条需求自己的支付模式取文案
    expect(requirementMatchesKeyword(spotlight({ status: 'deposit_paid' }), '已付定金')).toBe(true)
    expect(
      requirementMatchesKeyword(
        spotlight({ status: 'deposit_paid', payment_mode: 'self_managed' }),
        '待开发',
      ),
    ).toBe(true)
  })

  it('关词与任一字段都不沾边时不命中', () => {
    expect(requirementMatchesKeyword(spotlight(), '完全不相干的词')).toBe(false)
  })
})

describe('大厅读数、空态与最近交付', () => {
  const overview = {
    total_orders: 12,
    positive_rate: 98.25,
    total_orders_change_rate: 0,
    positive_rate_change_rate: 0,
    total_turnover_cny: 0,
    total_turnover_change_rate: 0,
    recent_deals: [],
  } as unknown as RequirementOverviewResp

  it('三格读数：可浏览需求取后端 total，概览缺失时其余两格归零', () => {
    expect(requirementHallStats(25, overview)).toEqual([
      { label: '可浏览需求', value: '25 条' },
      { label: '已完成需求', value: '12 单' },
      { label: '好评率', value: '98.3%' },
    ])
    expect(requirementHallStats(0, null)).toEqual([
      { label: '可浏览需求', value: '0 条' },
      { label: '已完成需求', value: '0 单' },
      { label: '好评率', value: '0.0%' },
    ])
  })

  it('空态标题按优先级取：关词 > 担保方式 > 大厅本来就没单', () => {
    expect(requirementHallEmptyTitle('改版', 'platform_guarantee')).toBe('没有匹配的需求')
    expect(requirementHallEmptyTitle('  ', 'platform_guarantee')).toBe('当前没有电签担保的需求')
    expect(requirementHallEmptyTitle('', 'self_managed')).toBe('当前没有无电签约定的需求')
    expect(requirementHallEmptyTitle('', 'all')).toBe('当前没有可展示的需求')
  })

  it('最近交付只取前 3 条，概览没回来时是空列表', () => {
    const deals = [1, 2, 3, 4].map((id) => ({ payment_id: id }))
    expect(requirementRecentDeals(deals).map((deal) => deal.payment_id)).toEqual([1, 2, 3])
    expect(requirementRecentDeals(undefined)).toEqual([])
    expect(requirementRecentDeals([], 3)).toEqual([])
  })

  it('星级按 0.5 步算满星 / 半星 / 空星，没有评分全空', () => {
    expect(dealStarClass(4.5, 1)).toBe('is-full')
    expect(dealStarClass(4.5, 4)).toBe('is-full')
    // 第 5 颗：4.5 >= 4.5 但 < 5 → 半星
    expect(dealStarClass(4.5, 5)).toBe('is-half')
    expect(dealStarClass(4, 5)).toBe('')
    expect(dealStarClass(null, 1)).toBe('')
    expect(dealStarClass(undefined, 1)).toBe('')
    expect(dealStarClass(Number.NaN, 1)).toBe('')
  })

  it('评论预览丢掉「只填了数字」的脏数据与过短内容', () => {
    expect(dealCommentPreview('  合作很顺利 ')).toBe('合作很顺利')
    expect(dealCommentPreview('4.5')).toBe('')
    expect(dealCommentPreview('5')).toBe('')
    expect(dealCommentPreview('好')).toBe('')
    expect(dealCommentPreview('  ')).toBe('')
    expect(dealCommentPreview(null)).toBe('')
  })
})

describe('详情浮层的富文本回退', () => {
  it('描述留空时给占位文案，有内容时洗掉脚本标签', () => {
    expect(requirementDetailDescriptionHtml('')).toBe('当前需求暂未补充详细描述。')
    expect(requirementDetailDescriptionHtml(null)).toBe('当前需求暂未补充详细描述。')
    const html = requirementDetailDescriptionHtml('<p>做首页</p><script>alert(1)</script>')
    expect(html).toContain('做首页')
    expect(html).not.toContain('<script')
  })

  it('验收标准缺失时：补详情期间写「加载中」，否则写「暂未补充」', () => {
    expect(requirementDetailAcceptanceHtml('', true)).toBe('验收标准加载中...')
    expect(requirementDetailAcceptanceHtml('', false)).toBe('当前需求暂未补充验收标准。')
    expect(requirementDetailAcceptanceHtml(null)).toBe('当前需求暂未补充验收标准。')
    expect(requirementDetailAcceptanceHtml('<p>交付源码</p>')).toContain('交付源码')
  })
})

describe('详情浮层的接取入口判定', () => {
  it('自己的需求不给接取入口，别人的给', () => {
    expect(requirementOwnedByCurrentUser(true, 'alice', spotlight({ creator: 'alice' }))).toBe(true)
    expect(requirementOwnedByCurrentUser(true, 'alice', spotlight({ creator: 'bob' }))).toBe(false)
    // 没登录、或列表里没带 creator 时都不算「自己的」
    expect(requirementOwnedByCurrentUser(false, 'alice', spotlight({ creator: 'alice' }))).toBe(
      false,
    )
    // 契约里 `creator` 是必填，但列表侧历史上可能拿不到这份数据——缺了就按「不是自己的」处理
    expect(requirementOwnedByCurrentUser(true, 'alice', {} as PublicRequirementSpotlightItem)).toBe(
      false,
    )
    expect(requirementOwnedByCurrentUser(true, 'alice', null)).toBe(false)
  })

  it('未登录不显示接取入口，登录后按「是不是自己发的」决定', () => {
    expect(canOpenRequirementWorkbench(false, 'alice', spotlight({ creator: 'bob' }))).toBe(false)
    expect(canOpenRequirementWorkbench(true, 'alice', spotlight({ creator: 'bob' }))).toBe(true)
    expect(canOpenRequirementWorkbench(true, 'alice', spotlight({ creator: 'alice' }))).toBe(false)
    expect(canOpenRequirementWorkbench(true, 'alice', null)).toBe(false)
  })
})
