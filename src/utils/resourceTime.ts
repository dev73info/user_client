/**
 * 资源详情里的时间展示统一走这一条。
 *
 * 后端给的是「YYYY-MM-DD HH:mm:ss」这种本地格式串（不是带时区的 ISO），
 * 解析失败时**原样返回**，不要兜底成当前时间或空串——那会让用户看到假的时间。
 */
export function formatResourceTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN')
}
