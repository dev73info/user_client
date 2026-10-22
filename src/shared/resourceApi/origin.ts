import { ALLOWED_ORIGIN_MAX_LENGTH } from './limits'

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
