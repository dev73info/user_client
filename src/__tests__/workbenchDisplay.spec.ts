import { describe, expect, it } from 'vitest'

import type { RequirementConversation } from '@/api/conversations'
import {
  conversationMeta,
  conversationTimestamp,
  countUnreadMessages,
  formatConversationTime,
  parseConversationTime,
  partnerLabel,
  sortConversationsByRecency,
  unreadCountText,
} from '@/shared/workbenchDisplay'

/** 只填展示层用得到的字段；其余字段与这些函数无关。 */
function conversationOf(overrides: Partial<RequirementConversation> = {}): RequirementConversation {
  return {
    id: 1,
    conversation_id: 'conv-1',
    requirement_id: 'REQ-001',
    requirement_title: '接口联调',
    customer: 'alice',
    developer: 'bob',
    status: 'open',
    requirement_status: 'in_progress',
    unread_count: 0,
    last_message_at: '2026-10-20T02:30:00.000Z',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-20T02:30:00.000Z',
    ...overrides,
  } as RequirementConversation
}

describe('parseConversationTime', () => {
  it('空值与空串当 0（排在最后，而不是崩在排序里）', () => {
    expect(parseConversationTime(undefined)).toBe(0)
    expect(parseConversationTime(null)).toBe(0)
    expect(parseConversationTime('')).toBe(0)
  })

  it('非法日期当 0', () => {
    expect(parseConversationTime('不是时间')).toBe(0)
  })

  it('正常时间串转成毫秒', () => {
    expect(parseConversationTime('2026-10-20T02:30:00.000Z')).toBe(
      new Date('2026-10-20T02:30:00.000Z').getTime(),
    )
  })
})

describe('formatConversationTime', () => {
  it('合法时间按月日 + 时分显示', () => {
    const label = formatConversationTime('2026-10-20T02:30:00.000Z')

    expect(label).toMatch(/10/)
    expect(label).toMatch(/\d{1,2}:\d{2}/)
  })

  it('非法时间退化成「刚刚更新」', () => {
    expect(formatConversationTime('不是时间')).toBe('刚刚更新')
  })
})

describe('conversationMeta', () => {
  it('没有最后一条消息时直说没有', () => {
    expect(conversationMeta(conversationOf({ last_message_at: null }))).toBe('暂无消息')
  })

  it('有消息时带上「最近」前缀', () => {
    expect(conversationMeta(conversationOf())).toMatch(/^最近 /)
  })
})

describe('partnerLabel', () => {
  it('我是买方时报开发者', () => {
    expect(partnerLabel(conversationOf({ customer: 'alice', developer: 'bob' }), 'alice')).toBe(
      '开发者：bob',
    )
  })

  it('我是乙方时报用户', () => {
    expect(partnerLabel(conversationOf({ customer: 'alice', developer: 'bob' }), 'bob')).toBe(
      '用户：alice',
    )
  })

  it('都不是时并列两方账号', () => {
    expect(partnerLabel(conversationOf({ customer: 'alice', developer: 'bob' }), 'carol')).toBe(
      'alice / bob',
    )
  })
})

describe('unreadCountText', () => {
  it('0 与个位数原样显示', () => {
    expect(unreadCountText(0)).toBe('0')
    expect(unreadCountText(9)).toBe('9')
  })

  it('99 仍显示数字，100 起收成 99+', () => {
    expect(unreadCountText(99)).toBe('99')
    expect(unreadCountText(100)).toBe('99+')
  })
})

describe('countUnreadMessages', () => {
  it('空列表为 0', () => {
    expect(countUnreadMessages([])).toBe(0)
  })

  it('各会话未读求和', () => {
    expect(
      countUnreadMessages([
        conversationOf({ unread_count: 3 }),
        conversationOf({ id: 2, unread_count: 0 }),
        conversationOf({ id: 3, unread_count: 5 }),
      ]),
    ).toBe(8)
  })

  it('缺字段按 0 算', () => {
    expect(
      countUnreadMessages([{ unread_count: undefined } as unknown as RequirementConversation]),
    ).toBe(0)
  })
})

describe('conversationTimestamp', () => {
  it('优先取最后一条消息时间', () => {
    expect(
      conversationTimestamp(
        conversationOf({
          last_message_at: '2026-10-20T02:30:00.000Z',
          updated_at: '2026-10-10T00:00:00.000Z',
        }),
      ),
    ).toBe(new Date('2026-10-20T02:30:00.000Z').getTime())
  })

  it('没有消息时退回最近更新时间，再退回创建时间', () => {
    expect(
      conversationTimestamp(
        conversationOf({ last_message_at: null, updated_at: '2026-10-10T00:00:00.000Z' }),
      ),
    ).toBe(new Date('2026-10-10T00:00:00.000Z').getTime())

    expect(
      conversationTimestamp(
        conversationOf({
          last_message_at: null,
          updated_at: null,
          created_at: '2026-10-01T00:00:00.000Z',
        } as unknown as Partial<RequirementConversation>),
      ),
    ).toBe(new Date('2026-10-01T00:00:00.000Z').getTime())

    // 空串是「有值」：它会把回退链断开，时间按 0 处理（与拆分前同口径，空串排最后）
    expect(
      conversationTimestamp(
        conversationOf({
          last_message_at: null,
          updated_at: '',
          created_at: '2026-10-01T00:00:00.000Z',
        }),
      ),
    ).toBe(0)
  })
})

describe('sortConversationsByRecency', () => {
  it('最近动静在前，且不改动传入的数组', () => {
    const older = conversationOf({ id: 1, last_message_at: '2026-10-01T00:00:00.000Z' })
    const newer = conversationOf({ id: 2, last_message_at: '2026-10-20T00:00:00.000Z' })
    const input = [older, newer]

    expect(sortConversationsByRecency(input).map((item) => item.id)).toEqual([2, 1])
    expect(input.map((item) => item.id)).toEqual([1, 2])
  })

  it('时间缺失的排最后，不会顶到最前', () => {
    const missing = conversationOf({ id: 1, last_message_at: null, updated_at: '', created_at: '' })
    const dated = conversationOf({ id: 2, last_message_at: '2026-10-20T00:00:00.000Z' })

    expect(sortConversationsByRecency([missing, dated]).map((item) => item.id)).toEqual([2, 1])
  })
})
