import { CALLBACK_URL_MAX_LENGTH } from './limits'

/** 渠道配置的读 / 写响应里与本页有关的字段（两个接口同构）。 */
export type ResourceApiChannelLike = {
  callback_url?: string | null
  allowed_origins?: string[] | null
}

/** 本地调试放行的 HTTP 回环主机名（精确匹配，不接受 `localhost.evil.com` 这类前缀）。 */
const LOCAL_HTTP_CALLBACK_HOSTS = new Set(['localhost', '127.0.0.1'])

/**
 * 回调地址校验（与后端 `callback_url` 同口径）：
 * - `https://` 绝对地址一律允许；
 * - `http://` 只允许 hostname 精确为 `localhost` 或 `127.0.0.1`（可带端口）；
 * - 公网、私网等其它 HTTP 地址一律拒绝。
 */
export function isValidCallbackUrl(raw: string | null | undefined): boolean {
  const value = (raw ?? '').trim()
  if (!value || value.length > CALLBACK_URL_MAX_LENGTH) {
    return false
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false
  }

  if (url.protocol === 'http:' && !LOCAL_HTTP_CALLBACK_HOSTS.has(url.hostname)) {
    return false
  }

  return Boolean(url.hostname)
}

/**
 * 接口资源「暂不可被下单」的原因（空数组 = 可以下单）。
 * 保存不做要求（草稿允许半成品），但页面要把这些原因显出来，
 * 免得开发者以为「存上了就能卖」。
 */
export function listApiChannelBlockers(input: ResourceApiChannelLike): string[] {
  const blockers: string[] = []

  if (!(input.callback_url ?? '').trim()) {
    blockers.push('未配置回调地址，暂不可被下单')
  }

  const origins = (input.allowed_origins ?? []).map((item) => (item ?? '').trim()).filter(Boolean)
  if (origins.length === 0) {
    blockers.push('未配置允许来源，暂不可被下单')
  }

  return blockers
}
