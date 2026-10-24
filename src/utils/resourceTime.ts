import { parseBackendDateTime } from '@/shared/datetime'

/**
 * 资源详情里的时间展示统一走这一条。
 *
 * 后端给的是「YYYY-MM-DD HH:mm:ss」这种**东八区墙钟串**（不带时区偏移），
 * 必须经 `parseBackendDateTime` 按 `+08:00` 解析——直接 `new Date(str)` 在非东八区设备上会整体偏移。
 * 解析失败时**原样返回**，不要兜底成当前时间或空串——那会让用户看到假的时间。
 */
export function formatResourceTime(value: string): string {
  const date = parseBackendDateTime(value)
  if (!date) {
    return value
  }

  return date.toLocaleString('zh-CN')
}
