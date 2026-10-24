/** 后端时间口径是本地时间的「YYYY-MM-DD HH:mm:ss」，这里从当前时间往前推，保证演示数据不会过期。 */
export function daysAgo(days: number, hour: number, minute: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, minute, 0, 0)

  const pad = (value: number) => String(value).padStart(2, '0')

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:00`,
  ].join('T')
}

/** 看板接口的时间口径是空格分隔的「YYYY-MM-DD HH:mm:ss」。 */
export function dashboardTime(days: number, hour: number, minute: number): string {
  return daysAgo(days, hour, minute).replace('T', ' ')
}
