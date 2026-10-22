/**
 * 接口资源 OAuth 客户端：授权回调地址的解析与校验。
 *
 * 与后端 `normalize_redirect_uris` 同口径：1–5 条、http(s) 绝对地址、长度 ≤ 500、
 * 不能带 fragment 或空白字符；完全相同的地址去重。
 */

export const OAUTH_REDIRECT_URI_MAX_COUNT = 5
export const OAUTH_REDIRECT_URI_MAX_LENGTH = 500

/** 多行文本 → 回调地址数组：按行切、去首尾空白、丢空行、按原样去重。 */
export function parseRedirectUrisInput(text: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim()
    if (!value || seen.has(value)) {
      continue
    }
    seen.add(value)
    result.push(value)
  }
  return result
}

/** 已保存的地址列表 → 多行文本（每行一条）。 */
export function formatRedirectUris(uris: readonly string[]): string {
  return uris.join('\n')
}

/** 单条地址是否合法；不合法时返回原因，合法返回空字符串。 */
export function redirectUriError(value: string): string {
  const text = value.trim()
  if (!text) {
    return '地址不能为空'
  }
  if (text.length > OAUTH_REDIRECT_URI_MAX_LENGTH) {
    return `长度不能超过 ${OAUTH_REDIRECT_URI_MAX_LENGTH}`
  }
  if (text.includes('#') || /\s/.test(text)) {
    return '不能包含 fragment 或空白字符'
  }
  if (!/^https?:\/\//i.test(text)) {
    return '必须是 http(s) 绝对地址'
  }

  try {
    const parsed = new URL(text)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '必须是 http(s) 绝对地址'
    }
    if (!parsed.hostname) {
      return '必须是 http(s) 绝对地址'
    }
  } catch {
    return '必须是 http(s) 绝对地址'
  }

  return ''
}

/** 校验整组回调地址；返回第一条不合法地址的原因，全部合法返回空字符串。 */
export function validateRedirectUris(uris: readonly string[]): string {
  if (uris.length === 0) {
    return '至少需要 1 条回调地址'
  }
  if (uris.length > OAUTH_REDIRECT_URI_MAX_COUNT) {
    return `最多 ${OAUTH_REDIRECT_URI_MAX_COUNT} 条回调地址`
  }
  for (const uri of uris) {
    const error = redirectUriError(uri)
    if (error) {
      return `「${uri}」${error}`
    }
  }
  return ''
}
