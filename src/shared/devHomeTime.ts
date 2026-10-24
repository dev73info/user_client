/**
 * 开发者工作台总览（`views/DevHomeView.vue`）的时间口径：**一律按东八区自然日**，不过浏览器时区。
 *
 * 后端时间串（`2026-10-24 15:00:00`）本身就是东八区墙钟，切前 10 位就是那一笔的「北京日期」；
 * 而 `new Date('2026-10-24 15:00:00')` 会按**本地时区**理解，UTC 设备上「今天」会差 8 小时，
 * 曲线归集与横轴标签一起偏。日期不是时刻，所以这里只做字符串与日历换算。
 */

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** 两位补零：日期键与横轴标签共用。 */
export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 后端时间串的东八区日期键（`YYYY-MM-DD`）：直接切字符串，不解析成时刻。 */
export function backendDayKey(value?: string | null): string | null {
  const raw = value?.trim()
  if (!raw || raw.length < 10) {
    return null
  }

  return raw.slice(0, 10)
}

/** 某个时刻落在东八区的日期键（`YYYY-MM-DD`）：先平移到东八区再读 UTC 字段。 */
export function beijingDayKey(at: number | Date): string {
  const ms = typeof at === 'number' ? at : at.getTime()
  const shifted = new Date(ms + BEIJING_OFFSET_MS)

  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`
}

/** 近 N 天的日期键，最早一天在左、今天在右。 */
export function recentDayKeys(days: number, now: number | Date = Date.now()): string[] {
  const ms = typeof now === 'number' ? now : now.getTime()
  const keys: string[] = []

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(beijingDayKey(new Date(ms - offset * DAY_MS)))
  }

  return keys
}

/** 日期键 → 横轴标签（`2026-10-24` → `10/24`）。 */
export function dayLabel(dayKey: string): string {
  return `${dayKey.slice(5, 7)}/${dayKey.slice(8, 10)}`
}
