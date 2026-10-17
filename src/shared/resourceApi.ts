/**
 * R028 接口资源：资源类别判定、回调地址与「允许来源」的解析 / 校验、渠道配置完整度的纯函数。
 *
 * 这里只放可单独测试的纯逻辑，不做请求、不碰 DOM——表单页与列表页共用同一份口径，
 * 免得「页面上能填」与「后端能收」两套规则各写一遍。
 */

/** 资源类别：`normal` = 大厅公开展示（默认）；`api` = 不在公开面展示，只能由指定来源下单。 */
export type McResourceKindLike = 'normal' | 'api'

/** 允许来源的单条长度上限（后端同口径，见任务-01 3.5 第 3 条）。 */
export const ALLOWED_ORIGIN_MAX_LENGTH = 253

/** 回调地址长度上限（后端同口径）。 */
export const CALLBACK_URL_MAX_LENGTH = 500

/** 渠道配置的读 / 写响应里与本页有关的字段（两个接口同构）。 */
export type ResourceApiChannelLike = {
  callback_url?: string | null
  allowed_origins?: string[] | null
}

/** 单条来源的三种合法形态：完整源、通配域名、纯 IP。 */
export function isApiResourceKind(kind: string | null | undefined): boolean {
  return (kind ?? '').trim().toLowerCase() === 'api'
}

/** 资源类别的中文名（列表标记与表单选项共用）。 */
export function resourceKindLabel(kind: string | null | undefined): string {
  return isApiResourceKind(kind) ? '接口资源' : '普通资源'
}

/**
 * 路由 query 里的资源类别：只有 `api` 算接口资源（去首尾空白、忽略大小写），
 * 其余——空值、数组（`?kind=a&kind=b`）、数字、不认识的值——一律按普通资源处理。
 */
export function resourceKindFromQuery(value: unknown): McResourceKindLike {
  return isApiResourceKind(typeof value === 'string' ? value : null) ? 'api' : 'normal'
}

/**
 * 「允许来源」多行文本 → 数组：按行切、去首尾空白、丢空行、按不区分大小写去重。
 * 保留首次出现的写法（域名大小写不敏感，展示时按开发者填的原样回显）。
 */
export function parseAllowedOriginsInput(raw: string | null | undefined): string[] {
  const text = typeof raw === 'string' ? raw : ''
  const seen = new Set<string>()
  const result: string[] = []

  for (const line of text.split(/\r?\n/)) {
    const item = line.trim()
    if (!item) {
      continue
    }

    const key = item.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(item)
  }

  return result
}

/** 来源数组 → 回显文本（一行一个）。 */
export function formatAllowedOriginsText(origins: string[] | null | undefined): string {
  return (origins ?? [])
    .map((item) => (item ?? '').trim())
    .filter((item) => item.length > 0)
    .join('\n')
}

const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

/** 主机名：每段字母 / 数字 / 连字符（不以连字符开头或结尾）。单段（`localhost`）也收。 */
function isHostName(host: string): boolean {
  if (!host || host.length > ALLOWED_ORIGIN_MAX_LENGTH) {
    return false
  }

  return host.split('.').every((label) => DOMAIN_LABEL_PATTERN.test(label))
}

/** 通配域名里的域名部分：必须有至少两段（`*.com` 这种通配没有意义）。 */
function isWildcardDomain(host: string): boolean {
  return host.includes('.') && isHostName(host)
}

/** IPv4 点分十进制：四段、每段 0—255。 */
function isIpv4Literal(raw: string): boolean {
  const parts = raw.split('.')
  if (parts.length !== 4) {
    return false
  }

  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/**
 * IPv6：只做形态检查（字符集、`::` 至多一次、组数上限）。
 * 允许 `::ffff:203.0.113.9` 这种以 IPv4 结尾的写法，也允许 `[::1]` 带方括号。
 */
function isIpv6Literal(raw: string): boolean {
  const value = raw.trim().replace(/^\[|\]$/g, '')
  if (!value.includes(':') || !/^[0-9a-fA-F:.]+$/.test(value)) {
    return false
  }

  const lastColon = value.lastIndexOf(':')
  if (value.includes('.') && !isIpv4Literal(value.slice(lastColon + 1))) {
    return false
  }

  const body = value.includes('.') ? value.slice(0, lastColon + 1) : value
  const doubleColonCount = body.split('::').length - 1
  if (doubleColonCount > 1) {
    return false
  }

  const groups = body.split(':').filter((part) => part.length > 0)
  if (groups.length > 8 || groups.some((part) => part.length > 4)) {
    return false
  }

  // 没有 `::` 压缩时必须是完整的八组
  return doubleColonCount > 0 || groups.length === 8
}

/** 端口：1—65535。 */
function isPortNumber(raw: string): boolean {
  if (!/^\d{1,5}$/.test(raw)) {
    return false
  }

  const port = Number(raw)
  return port >= 1 && port <= 65535
}

/** 完整源（`https://shop.example.com`、可带端口，host 可以是域名或 IP）。 */
function isFullOrigin(raw: string): boolean {
  const match = /^(https?):\/\/([^/?#\s]+)$/i.exec(raw)
  if (!match) {
    return false
  }

  const hostPort = match[2] ?? ''
  let host = hostPort
  let port: string | null = null

  if (hostPort.startsWith('[')) {
    const end = hostPort.indexOf(']')
    if (end < 0) {
      return false
    }

    host = hostPort.slice(1, end)
    const rest = hostPort.slice(end + 1)
    if (rest) {
      if (!rest.startsWith(':')) {
        return false
      }
      port = rest.slice(1)
    }

    if (!isIpv6Literal(host)) {
      return false
    }
  } else {
    const colon = hostPort.lastIndexOf(':')
    if (colon >= 0) {
      host = hostPort.slice(0, colon)
      port = hostPort.slice(colon + 1)
    }

    if (!isHostName(host) && !isIpv4Literal(host)) {
      return false
    }
  }

  return port === null || isPortNumber(port)
}

/** 单条来源是否合法：完整源 / 通配域名（`*.example.com`）/ 纯 IP（v4、v6）。 */
export function isValidAllowedOrigin(raw: string | null | undefined): boolean {
  const value = (raw ?? '').trim()
  if (!value || value.length > ALLOWED_ORIGIN_MAX_LENGTH) {
    return false
  }

  if (value.startsWith('*.')) {
    return isWildcardDomain(value.slice(2))
  }

  if (value.includes('://')) {
    return isFullOrigin(value)
  }

  return isIpv4Literal(value) || isIpv6Literal(value)
}

/** 找第一条不合法的来源；全部合法时返回 `null`。 */
export function findInvalidAllowedOrigin(origins: (string | null | undefined)[]): string | null {
  for (const item of origins ?? []) {
    const value = (item ?? '').trim()
    if (!value) {
      continue
    }

    if (!isValidAllowedOrigin(value)) {
      return value
    }
  }

  return null
}

/**
 * 回调地址校验：http(s) 绝对地址。
 * 本地开发允许 `http://127.0.0.1:*` 与 `http://localhost:*`，所以这里不额外强制 https——
 * 「生产必须 https」由后端按环境判（任务-01 3.5 第 2 条）。
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

/** 回调验签口径，页面提示与开发者文档必须一字不差。 */
export const API_CALLBACK_SIGNATURE_RULE = 'HMAC-SHA256(secret, "{timestamp}.{raw_body}")'

/**
 * 接入示例（`curl`）：开发者复制到自己站点的**服务端**执行。
 *
 * 开放下单接口走接口密钥（`X-Api-Key`），`origin` 是本次调用来源，
 * 命中该资源的允许来源才会建单。
 */
export function buildApiPurchaseCurl(
  resourceId: number | null | undefined,
  options: { apiBase?: string; origin?: string } = {},
): string {
  const apiBase = (options.apiBase ?? '').trim().replace(/\/$/, '') || 'https://api.73info.cn'
  const origin = (options.origin ?? '').trim() || 'https://shop.example.com'
  const id =
    Number.isInteger(resourceId) && Number(resourceId) > 0 ? String(resourceId) : '{你的资源编号}'

  return [
    `curl -X POST "${apiBase}/api/resource/open/api-purchase" \\`,
    '  -H "Content-Type: application/json" \\',
    '  -H "X-Api-Key: sk-73info-你的接口密钥" \\',
    `  -d '{"resource_id": ${id}, "origin": "${origin}", "buyer_ref": "shop-order-0001", "pay_channel": "alipay", "client_platform": "pc"}'`,
  ].join('\n')
}
