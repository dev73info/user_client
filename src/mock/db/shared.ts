import { MOCK_IDENTITY_PROFILES } from '../identity'

export const CLIENT_USERNAME = MOCK_IDENTITY_PROFILES.client.username
export const DEV_USERNAME = MOCK_IDENTITY_PROFILES.dev.username

export const CLIENT_NICKNAME = MOCK_IDENTITY_PROFILES.client.nickname
export const DEV_NICKNAME = MOCK_IDENTITY_PROFILES.dev.nickname

/* ------------------------------------------------------------------ 时间工具 */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDate(date: Date, separator: string): string {
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(separator)
}

function shiftDate(days: number, hour: number, minute: number): Date {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, minute, 0, 0)
  return date
}

/** 后端时间口径：`YYYY-MM-DD HH:mm:ss`（东八区本地时间）。 */
export function datetime(days = 0, hour = 10, minute = 0): string {
  const date = shiftDate(days, hour, minute)
  return `${formatDate(date, '-')} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}

/** 资源时间口径：ISO 风格 `YYYY-MM-DDTHH:mm:00`。 */
export function iso(days = 0, hour = 10, minute = 0): string {
  const date = shiftDate(days, hour, minute)
  return `${formatDate(date, '-')}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}
