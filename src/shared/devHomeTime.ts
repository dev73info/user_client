/**
 * 开发者总览页的时间文案工具（R047 从 `views/DevHomeView.vue` 下沉）。
 *
 * 两处口径相同，拆开写迟早跑偏：曲线横轴的日键、时钟文案、动态流的「今天」判定，
 * 用的都是本地时区的「年-月-日」字符串，且一律两位补零。
 */

/** 两位补零：日期键、时钟与横轴标签共用。 */
export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 本地时区的日键（`YYYY-MM-DD`）：曲线归集与动态流的「今天」都按它比。 */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** 星期文案：看板时钟右上角那一段。 */
export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const
