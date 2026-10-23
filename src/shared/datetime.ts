/**
 * 后端时间口径：**东八区墙钟字符串，不带时区偏移**。
 *
 * 后端返回的是 `2026-10-24 15:00:00` 这种形态，`Date` 直接解析会按**浏览器本地时区**理解，
 * 非 +08:00 的设备上整体偏移（UTC+0 的设备会差 8 小时，倒计时、日期分组、过期判断全错）。
 * 所以解析一律走这里，不要在页面里写 `new Date(value)`。
 *
 * 两种输入都接受：
 * - 不带偏移的墙钟串（后端常态）→ 按 `+08:00` 解析；
 * - 已带偏移的串（`...Z` / `...+08:00`）→ 原样交给 `Date`，不再补偏移。
 */

/** 带偏移的 ISO 串末尾（`Z` 或 `±hh:mm` / `±hhmm`）。 */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i

/**
 * 把后端时间字符串解析成 `Date`（瞬时正确，与时区无关）。
 *
 * 解析不出来返回 `null`，由调用方各自兜底，不要在这里抛错、也不要回退成「现在」。
 */
export function parseBackendDateTime(value?: string | null): Date | null {
  const raw = value?.trim()
  if (!raw) {
    return null
  }

  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const withZone = HAS_OFFSET.test(normalized) ? normalized : `${normalized}+08:00`
  const date = new Date(withZone)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * 后端时间的展示文案（按浏览器本地时区渲染，默认「月-日 时:分」）。
 *
 * 时刻本身是准的（已按东八区解析），显示成哪个时区的钟点交给 `Intl`——
 * 国内用户看到的仍是东八区钟点，海外用户看到自己的当地时间，符合预期。
 */
export function formatBackendDateTime(
  value?: string | null,
  options: Intl.DateTimeFormatOptions = {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  },
): string {
  const date = parseBackendDateTime(value)
  if (!date) {
    return '时间未知'
  }
  return date.toLocaleString('zh-CN', options)
}
