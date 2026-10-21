import { describe, expect, it } from 'vitest'

import {
  avatarText,
  formatDateLabel,
  formatFullDateTime,
  formatMessageClock,
  isMine,
  localDateKey,
  parseDate,
} from '@/shared/conversationTime'

/** 把「本地年月日时分」拼成组件能拿到的后端格式（无时区、空格分隔）。 */
const localStamp = (y: number, mo: number, d: number, h = 12, mi = 0, s = 0) =>
  `${y}-${`${mo}`.padStart(2, '0')}-${`${d}`.padStart(2, '0')} ` +
  `${`${h}`.padStart(2, '0')}:${`${mi}`.padStart(2, '0')}:${`${s}`.padStart(2, '0')}`

describe('会话时间换算', () => {
  it('缺值与非日期串都退回 null，不抛', () => {
    expect(parseDate()).toBeNull()
    expect(parseDate('')).toBeNull()
    expect(parseDate(null)).toBeNull()
    expect(parseDate('不是时间')).toBeNull()
    expect(parseDate('2026-13-45 99:99:99')).toBeNull()
  })

  it('空格分隔与 T 分隔解析成同一时刻', () => {
    const spaced = parseDate('2026-10-21 09:30:00')
    const iso = parseDate('2026-10-21T09:30:00')
    expect(spaced?.getTime()).toBe(iso?.getTime())
  })

  it('本地时间 → ISO → 再解析，年月日时分不变（不因时区漂移跨日）', () => {
    const stamp = localStamp(2026, 3, 1, 0, 5)
    const first = parseDate(stamp)!
    expect(first.getHours()).toBe(0)
    expect(first.getMinutes()).toBe(5)
    // 后端 / 浏览器都爱把时间转成 ISO 传一圈，转回来必须还是同一天同一刻
    const roundTrip = parseDate(first.toISOString())!
    expect(localDateKey(first.toISOString())).toBe('2026-03-01')
    expect(roundTrip.getTime()).toBe(first.getTime())
  })

  it('localDateKey 用本地时区切日，跨日两侧不同键', () => {
    expect(localDateKey(localStamp(2026, 10, 21, 23, 59, 59))).toBe('2026-10-21')
    expect(localDateKey(localStamp(2026, 10, 22, 0, 0, 1))).toBe('2026-10-22')
    // 月、日补零，才能直接比字符串
    expect(localDateKey(localStamp(2026, 1, 5, 8))).toBe('2026-01-05')
    expect(localDateKey('不是时间')).toBe('')
  })

  it('分隔条文案分今天 / 昨天 / 今年 / 跨年四档', () => {
    // now 由参数注入，避免用例在午夜前后飘
    const now = new Date(2026, 9, 21, 10, 0, 0)
    expect(formatDateLabel(localStamp(2026, 10, 21, 0, 1), now)).toBe('今天')
    expect(formatDateLabel(localStamp(2026, 10, 21, 23, 59), now)).toBe('今天')
    expect(formatDateLabel(localStamp(2026, 10, 20, 23, 59), now)).toBe('昨天')
    expect(formatDateLabel(localStamp(2026, 10, 19, 12), now)).toBe('10月19日')
    expect(formatDateLabel(localStamp(2025, 12, 31, 12), now)).toBe('2025年12月31日')
  })

  it('跨年边界：1 月 1 日看去年 12 月 31 日要带年份', () => {
    const now = new Date(2026, 0, 1, 9, 0, 0)
    expect(formatDateLabel(localStamp(2025, 12, 31, 23, 59), now)).toBe('昨天')
    expect(formatDateLabel(localStamp(2025, 12, 30, 12), now)).toBe('2025年12月30日')
  })

  it('非法时间的分隔条文案兜底', () => {
    expect(formatDateLabel(undefined)).toBe('最近消息')
    expect(formatDateLabel('坏时间')).toBe('最近消息')
  })

  it('气泡时钟只到分钟，非法值给空串', () => {
    expect(formatMessageClock(localStamp(2026, 10, 21, 9, 5))).toMatch(/0?9:05/)
    expect(formatMessageClock(null)).toBe('')
    expect(formatMessageClock('坏时间')).toBe('')
  })

  it('会话头时间带月日时分，非法值给「刚刚更新」', () => {
    const label = formatFullDateTime(localStamp(2026, 10, 21, 9, 5))
    // 数值型月 / 日由运行时 ICU 决定分隔符（10/21 或 10月21日），这里钉住「月日 + 时分」两段
    expect(label).toMatch(/10[/月]21/)
    expect(label).toMatch(/0?9:05/)
    expect(formatFullDateTime('')).toBe('刚刚更新')
    expect(formatFullDateTime('坏时间')).toBe('刚刚更新')
  })
})

describe('会话署名', () => {
  it('头像文字取首字母大写，空名给问号', () => {
    expect(avatarText('bob')).toBe('B')
    expect(avatarText('  张三 ')).toBe('张')
    expect(avatarText('')).toBe('?')
    expect(avatarText(null)).toBe('?')
    expect(avatarText('   ')).toBe('?')
  })

  it('是不是我发的：比对当前登录名，无登录名一律不算', () => {
    expect(isMine({ sender: 'alice' }, 'alice')).toBe(true)
    expect(isMine({ sender: 'bob' }, 'alice')).toBe(false)
    expect(isMine({ sender: 'alice' }, '')).toBe(false)
    expect(isMine({ sender: 'alice' }, undefined)).toBe(false)
    expect(isMine({}, 'alice')).toBe(false)
  })
})
