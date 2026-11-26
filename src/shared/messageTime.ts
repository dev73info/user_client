import { parseBackendDateTime } from '@/shared/datetime'

/**
 * 消息中心的时间口径（纯函数）：列表排序用的毫秒值、桌面右列的完整时间、
 * 手机档的短时间，以及「近 7 天有没有动静」的判断。
 *
 * 从 messagesThreads.ts 拆出来：那边是「一行会话长什么样」的装配层，
 * 时间格式化单独一层后，两边的模块行数都留出余量（单模块 300 行预算）。
 */

export function parseTime(value?: string | null) {
  if (!value) {
    return 0
  }
  return parseBackendDateTime(value)?.getTime() ?? 0
}

export function formatMessageTime(value?: string | null) {
  if (!value) {
    return '暂无消息'
  }
  const date = parseBackendDateTime(value)
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

/** 手机档的短时间：今天只留时刻、今年留月/日、跨年补两位年份。
 *  完整口径（「11/26 15:30 · 我」）留给桌面右列；手机上右列与预览同行，
 *  一整个「月/日 时:分 · 我」会把标题和预览都压成几个字。 */
export function formatShortMessageTime(value?: string | null) {
  if (!value) {
    return '暂无消息'
  }
  const date = parseBackendDateTime(value)
  if (!date) {
    return '刚刚更新'
  }
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
  const monthDay = `${date.getMonth() + 1}/${date.getDate()}`
  return date.getFullYear() === now.getFullYear()
    ? monthDay
    : `${String(date.getFullYear()).slice(-2)}/${monthDay}`
}

export function isRecent(value?: string | null) {
  const time = parseTime(value)
  if (!time) {
    return false
  }
  return Date.now() - time <= 7 * 24 * 60 * 60 * 1000
}
