/** 共享事件流的复用键：同一 url + 同一令牌只保留一条连接。 */

/** 从请求头里取一个字段（大小写不敏感），兼容 Headers / 数组 / 普通对象三种写法。 */
function readHeader(headers: RequestInit['headers'], name: string): string {
  if (!headers) {
    return ''
  }

  if (headers instanceof Headers) {
    return headers.get(name) ?? ''
  }

  if (Array.isArray(headers)) {
    const hit = headers.find((entry) => String(entry[0]).toLowerCase() === name.toLowerCase())
    return hit ? String(hit[1]) : ''
  }

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) {
      return String(value)
    }
  }

  return ''
}

/**
 * 令牌指纹：仅用作本模块内的流复用键，既不上网也不进日志，
 * 所以用同步的 64 位 FNV-1a（两段独立 32 位）就够了，不需要异步的 crypto.subtle。
 */
function tokenFingerprint(token: string): string {
  let first = 0x811c9dc5
  let second = 0xcbf29ce4

  for (let index = 0; index < token.length; index += 1) {
    const code = token.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193) >>> 0
    second = Math.imul(second ^ (code + index), 0x01000193) >>> 0
  }

  const high = first.toString(16).padStart(8, '0')
  const low = second.toString(16).padStart(8, '0')
  return `${high}${low}:${token.length}`
}

/**
 * 连接复用键：同一个 url + 同一个令牌只保留一条事件流。
 *
 * 消息页与会话弹窗会对同一个 `/conversations/events` 各订阅一次，页面里就是两条连接，
 * 而建连本身有独立配额（每个用户 12 次/分）；不合并的话反复进出会话很快就会被拒绝。
 */
export function streamIdentity(url: string, init: RequestInit): string {
  const authorization = readHeader(init.headers, 'authorization')
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  return token ? `${url}::${tokenFingerprint(token)}` : url
}
