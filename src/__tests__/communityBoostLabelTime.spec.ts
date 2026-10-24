import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CommunityPost } from '@/api/community'
import { postBoostLabel } from '@/shared/community/postDisplay'

/**
 * 推广标识的到期判断必须按**东八区**解析后端墙钟串。
 *
 * 这条用例钉的是「判断类」而不是展示类：`bumped_at` 的窗口是「2 天内顶过」，
 * 若按浏览器本地时区解析，非 +08:00 的设备会把窗口算成 2 天 8 小时（UTC+0）
 * 或 1 天 16 小时（UTC+8 以西更少），是误判。
 */

function post(overrides: Partial<CommunityPost>): CommunityPost {
  return {
    id: 1,
    author: 'a',
    title: 't',
    status: 'published',
    tags: [],
    content_html: '',
    like_count: 0,
    comment_count: 0,
    liked_by_me: false,
    favorited_by_me: false,
    published_at: '2026-10-20 10:00:00',
    updated_at: '2026-10-20 10:00:00',
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
  } as CommunityPost
}

describe('postBoostLabel 的到期判断按东八区解析', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('bumped_at 在 2 天内 → 上浮；超过 2 天 → 不上浮', () => {
    // 固定「现在」为东八区 2026-10-24 15:00:00
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-24T07:00:00.000Z'))

    expect(postBoostLabel(post({ bumped_at: '2026-10-23 14:00:00' }))).toContain('上浮')
    expect(postBoostLabel(post({ bumped_at: '2026-10-21 14:00:00' }))).not.toContain('上浮')
  })

  it('highlight_until 未到期才算高亮（边界按东八区）', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-24T07:00:00.000Z')) // = 东八区 15:00

    expect(postBoostLabel(post({ highlight_until: '2026-10-24 15:30:00' }))).toContain('高亮')
    expect(postBoostLabel(post({ highlight_until: '2026-10-24 14:30:00' }))).not.toContain('高亮')
  })

  it('多个到期项同时有效时按固定顺序拼接', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-24T07:00:00.000Z'))

    const label = postBoostLabel(
      post({
        bumped_at: '2026-10-24 10:00:00',
        highlight_until: '2026-10-30 00:00:00',
        hot_until: '2026-10-30 00:00:00',
      }),
    )
    expect(label).toBe('上浮 · 高亮 · 热门展示')
  })

  it('字段缺失或格式非法时不炸、不出标签', () => {
    expect(
      postBoostLabel(post({ bumped_at: '不是时间', highlight_until: '2026-13-45 99:99:99' })),
    ).toBe('')
  })
})
