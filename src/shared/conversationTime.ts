/**
 * 需求会话时间线的日期与署名纯函数。
 *
 * 从 `RequirementConversationModal.vue` 里搬出来的：这些函数只做「字符串 → 本地时间」
 * 的换算与展示文案，不碰任何响应式状态，放在这里既能单独测，也不必跟着组件一起长。
 */

/**
 * 把后端时间字符串解析成本地 `Date`。
 *
 * 后端给的是 `2026-10-21 09:30:00`（无时区）或带 `T` 的 ISO 串。前者先补成 `T` 再交给
 * `Date`，否则 Safari 旧版会当非法值；解析不出来返回 `null`，让调用方各自兜底。
 */
export function parseDate(value?: string | null): Date | null {
  if (!value) {
    return null
  }
  const normalizedValue = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(normalizedValue)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 本地时区的日期键（`2026-10-21`）：同一自然日归到同一个分组，跨时区不串行。 */
export function localDateKey(value?: string | null): string {
  const date = parseDate(value)
  if (!date) {
    return ''
  }
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 时间线日期分隔条文案：今天 / 昨天 / 年内省年份 / 跨年带年份。 */
export function formatDateLabel(value?: string | null, now: Date = new Date()): string {
  const date = parseDate(value)
  if (!date) {
    return '最近消息'
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const key = localDateKey(value)

  if (key === localDateKey(now.toISOString())) {
    return '今天'
  }
  if (key === localDateKey(yesterday.toISOString())) {
    return '昨天'
  }

  const options: Intl.DateTimeFormatOptions =
    date.getFullYear() === now.getFullYear()
      ? { month: 'long', day: 'numeric' }
      : { year: 'numeric', month: 'long', day: 'numeric' }
  return date.toLocaleDateString('zh-CN', options)
}

/** 气泡与卡片右下角的时间：只到分钟。 */
export function formatMessageClock(value?: string | null): string {
  const date = parseDate(value)
  if (!date) {
    return ''
  }
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 会话头的「最近 …」：月 / 日 / 时 / 分，不带年份。 */
export function formatFullDateTime(value?: string | null): string {
  const date = parseDate(value)
  if (!date) {
    return '刚刚更新'
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 头像兜底文字：取首字母大写，空名给 `?`。 */
export function avatarText(value?: string | null): string {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
}

/** 这条消息是不是当前登录人发的（靠右上角对齐、不署名的那一侧）。 */
export function isMine(
  message: { sender?: string | null },
  currentUsername?: string | null,
): boolean {
  return Boolean(currentUsername && message.sender === currentUsername)
}
