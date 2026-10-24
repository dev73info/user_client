import { describe, expect, it } from 'vitest'

import {
  MILESTONE_TARGETS,
  buildMilestoneStats,
  buildPortalNotices,
  formatMoney,
  formatTimeLabel,
  progressPercent,
  statusToLabel,
} from '@/shared/home/portalDisplay'

/**
 * 首页侧栏「平台公告 / 内测里程碑」的展示层纯函数（R047 从 `views/HomeView.vue` 下沉）。
 *
 * 这个视图没有组件级测试，纯函数层是唯一的回归网：时间与金额的格式化边界、
 * `deposit_paid` 一码两义的消歧、进度百分比不除零、公告取 4 条的截断与回落规则都压在这里。
 */

/** 本地时间 → ISO 再解析回来，避免用例在不同时区下算出不同文案。 */
function localIso(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(year, month - 1, day, hour, minute).toISOString()
}

describe('formatTimeLabel', () => {
  it('合法时间按月日 + 时分显示', () => {
    expect(formatTimeLabel(localIso(2026, 3, 5, 14, 30))).toBe('3/5 14:30')
  })

  it('非法日期与空串都回落「刚刚更新」', () => {
    expect(formatTimeLabel('不是时间')).toBe('刚刚更新')
    expect(formatTimeLabel('')).toBe('刚刚更新')
  })
})

describe('formatMoney', () => {
  it('空值给「待议价」', () => {
    expect(formatMoney(null)).toBe('待议价')
    expect(formatMoney(undefined)).toBe('待议价')
  })

  it('0 元照实显示，不当成空值', () => {
    expect(formatMoney(0)).toBe('¥0')
  })

  it('小数与大数原样带符号（不加千分位，与详情页口径一致）', () => {
    expect(formatMoney(1200.5)).toBe('¥1200.5')
    expect(formatMoney(1234567)).toBe('¥1234567')
  })
})

describe('statusToLabel', () => {
  it('普通状态与支付模式无关', () => {
    expect(statusToLabel('pending_review')).toBe('待审核')
    expect(statusToLabel('in_development', 'self_managed')).toBe('开发中')
  })

  it('deposit_paid 一码两义：拿到支付模式就消歧', () => {
    expect(statusToLabel('deposit_paid', 'platform_guarantee')).toBe('已付定金')
    expect(statusToLabel('deposit_paid', 'self_managed')).toBe('待开发')
  })

  it('deposit_paid 拿不到支付模式时两种含义一起写', () => {
    expect(statusToLabel('deposit_paid')).toBe('已付定金 / 待开发')
  })
})

describe('progressPercent', () => {
  it('目标为 0 时不除零，直接给 0%', () => {
    expect(progressPercent({ current: 3, target: 0 })).toBe('0%')
  })

  it('按四舍五入换算，超出目标夹到 100%', () => {
    expect(progressPercent({ current: 1, target: 3 })).toBe('33%')
    expect(progressPercent({ current: 50, target: 50 })).toBe('100%')
    expect(progressPercent({ current: 80, target: 50 })).toBe('100%')
  })
})

describe('buildPortalNotices', () => {
  const post = (id: number, title: string) => ({
    id,
    title,
    published_at: localIso(2026, 3, 5, 9, id),
  })

  const resource = {
    id: 88,
    title: '联机工具',
    platform: 'Minecraft',
    updated_at: localIso(2026, 3, 4, 10, 0),
    price_fen: 0,
    price_points: 0,
  }

  it('没有任何来源时给空列表（侧栏不渲染条目）', () => {
    expect(buildPortalNotices({ posts: [] })).toEqual([])
  })

  it('公告最多取 3 条', () => {
    const notices = buildPortalNotices({
      posts: [post(1, 'A'), post(2, 'B'), post(3, 'C'), post(4, 'D'), post(5, 'E')],
    })

    expect(notices).toHaveLength(3)
    expect(notices.map((notice) => notice.title)).toEqual(['A', 'B', 'C'])
  })

  it('公告取 3 条 + 三类来源各 1 条时，整体截断到 4 条（需求被挤掉）', () => {
    const notices = buildPortalNotices({
      posts: [post(1, 'A'), post(2, 'B'), post(3, 'C')],
      latestDeal: { title: '成交一单', at: '3/2 20:00' },
      resource,
      resourceRoute: { rootSlug: 'client', entrySlug: 'java' },
      spotlight: {
        title: '做个联机工具',
        updated_at: localIso(2026, 3, 6, 8, 0),
        status: 'pending_review',
        payment_mode: 'self_managed',
      },
    })

    expect(notices).toHaveLength(4)
    expect(notices.map((notice) => notice.tag)).toEqual(['公告', '公告', '公告', 'HOT'])
  })

  it('公告不足 3 条时按「公告 → 成交 → 资源 → 需求」的顺序补齐 4 条', () => {
    const notices = buildPortalNotices({
      posts: [post(1, 'A')],
      latestDeal: { title: '成交一单', at: '3/2 20:00' },
      resource,
      resourceRoute: { rootSlug: 'client', entrySlug: 'java' },
      spotlight: {
        title: '做个联机工具',
        updated_at: localIso(2026, 3, 6, 8, 0),
        status: 'pending_review',
        payment_mode: 'self_managed',
      },
    })

    expect(notices.map((notice) => notice.title)).toEqual([
      'A',
      '最新成交：成交一单',
      '公开资源：联机工具',
      '需求：做个联机工具',
    ])
    expect(notices[3]?.tag).toBe('待审核')
  })

  it('资源能解析出标签路由时深链到详情，解析不到时回落免费资源列表', () => {
    const linked = buildPortalNotices({
      posts: [],
      resource,
      resourceRoute: { rootSlug: 'client', entrySlug: 'java' },
    })
    const fallback = buildPortalNotices({ posts: [], resource, resourceRoute: null })

    expect(linked[0]?.to).toEqual({
      name: 'resource-catalog',
      params: { rootSlug: 'client', entrySlug: 'java' },
      query: { sale: 'free', resource: '88' },
    })
    expect(fallback[0]?.to).toEqual({ name: 'resources', query: { sale: 'free' } })
  })

  it('公告条目的日期走统一时间口径，标签固定为「公告」', () => {
    const notices = buildPortalNotices({ posts: [post(1, 'A')] })

    expect(notices[0]?.tag).toBe('公告')
    expect(notices[0]?.date).toBe('3/5 09:01')
    expect(notices[0]?.to).toEqual({ name: 'community-post', params: { postId: '1' } })
  })
})

describe('buildMilestoneStats', () => {
  it('固定四张卡，顺序即展示顺序（索引决定 --stat-index 与色板）', () => {
    const stats = buildMilestoneStats({ developerCount: 0, resourceCount: 0 })

    expect(stats.map((stat) => [stat.label, stat.icon])).toEqual([
      ['内测开发者', 'developers'],
      ['公开资源', 'resources'],
      ['完成记录', 'orders'],
      ['担保交易', 'escrow'],
    ])
  })

  it('前两张按里程碑目标拼「当前/目标」并带进度', () => {
    const [developers, resources] = buildMilestoneStats({
      developerCount: 128,
      resourceCount: 7,
    })

    expect(developers?.value).toBe(`128/${MILESTONE_TARGETS.developers} 位`)
    expect(developers?.progress).toEqual({
      current: 128,
      target: MILESTONE_TARGETS.developers,
    })
    expect(resources?.value).toBe(`7/${MILESTONE_TARGETS.resources} 条`)
    expect(progressPercent(resources!.progress!)).toBe('14%')
  })

  it('零单时补「首单在路上」，有成交则不补', () => {
    const zero = buildMilestoneStats({
      developerCount: 1,
      resourceCount: 1,
      completedLabel: '0 单',
    })
    const done = buildMilestoneStats({
      developerCount: 1,
      resourceCount: 1,
      completedLabel: '12 单',
    })

    expect(zero[2]?.note).toBe('首单在路上')
    expect(done[2]?.value).toBe('12 单')
    expect(done[2]?.note).toBeUndefined()
  })

  it('overview 还没回来时第三张显示「0 单」但不加提示（与原内联实现一致）', () => {
    const stats = buildMilestoneStats({ developerCount: 0, resourceCount: 0 })

    expect(stats[2]?.value).toBe('0 单')
    expect(stats[2]?.note).toBeUndefined()
  })

  it('第四张是担保交易占位，没有进度条', () => {
    const stats = buildMilestoneStats({ developerCount: 3, resourceCount: 2 })

    expect(stats[3]).toEqual({
      label: '担保交易',
      value: '开发中',
      icon: 'escrow',
      note: '正在开发测试中',
    })
  })
})
