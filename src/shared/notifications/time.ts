/** 与后端「Asia/Shanghai」的 `YYYY-MM-DD HH:MM:SS` 对齐：这种字符串 `new Date()` 在 Safari 上解析不了，补成 ISO 再解析。 */
export function parseNoticeTime(value?: string | null): number {
  if (!value) {
    return 0
  }

  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const time = new Date(normalized).getTime()
  return Number.isNaN(time) ? 0 : time
}
