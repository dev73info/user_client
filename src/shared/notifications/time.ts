import { parseBackendDateTime } from '@/shared/datetime'

/** 通知时间 → 毫秒。后端串是东八区墙钟串，一律经 `parseBackendDateTime` 按 `+08:00` 解析。 */
export function parseNoticeTime(value?: string | null): number {
  if (!value) {
    return 0
  }

  return parseBackendDateTime(value)?.getTime() ?? 0
}
