const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? ''

export const API_BASE_URL = rawBase.replace(/\/$/, '')

const backendStaticPathPrefixes = ['/uploads']

/**
 * 历史短路径 → 后端契约路径的翻译表。
 *
 * 表里左边这些写法是前端内部沿用的短路径（`/contracts/x` 这类），右边是后端 `openapi.json`
 * 里真实存在的前缀；翻译在 `normalizeBackendPath` 里统一做一次，调用点不必逐处改字面量。
 * **新增别名前先确认右边在 `src/api/generated/openapi.json` 里真有对应路径**——
 * 这里写错不会报错，只会在运行时静默 404。
 */
const backendPathAliases: ReadonlyArray<readonly [string, string]> = [
  ['/public/requirements', '/requirements'],
  ['/dev/requirements/mine', '/requirement/dev/mine'],
  ['/dev/requirements', '/requirement'],
  ['/payments', '/payment'],
  ['/coupons', '/coupon'],
  ['/contracts', '/contract'],
  ['/dev/resources', '/resources'],
  ['/dev/payments', '/payment'],
  ['/dev/contracts', '/contract'],
  ['/team/teams', '/teams'],
  ['/team/invitations', '/teams/invitations'],
  ['/requirements', '/requirement'],
  // 会话域后端是单数 `/api/conversation`（actix 逐字匹配，复数路径 404）。
  // 前端与 mock 都沿用了复数写法，在这里统一翻译一次，两边就不会各写一套。
  ['/conversations', '/conversation'],
  ['/settings', '/system/settings'],
  ['/resources/tags', '/tag/tags'],
]

/**
 * 别名翻译的最大轮数。
 *
 * 表里存在「翻译结果还是别名左侧」的链条：`/public/requirements/public-overview`
 * 先翻成 `/requirements/public-overview`，还要再翻一次才落到 `/requirement/public-overview`。
 * 只翻一轮会把中间态当最终结果发出去，后端 404 而前端看不出是路径拼接的问题，
 * 所以这里迭代到稳定为止（轮数封顶，防止表里出现环时死循环）。
 */
const ALIAS_RESOLUTION_LIMIT = 3

function hasPathPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)
}

function replacePathPrefix(path: string, prefix: string, replacement: string): string {
  if (!hasPathPrefix(path, prefix)) {
    return path
  }

  return `${replacement}${path.slice(prefix.length)}`
}

function isBackendStaticPath(path: string): boolean {
  return backendStaticPathPrefixes.some((prefix) => hasPathPrefix(path, prefix))
}

function resolveBackendPathAlias(path: string): string {
  let current = path

  for (let depth = 0; depth < ALIAS_RESOLUTION_LIMIT; depth += 1) {
    const alias = backendPathAliases.find(([from]) => hasPathPrefix(current, from))

    if (!alias) {
      return current
    }

    const [from, to] = alias
    const next = replacePathPrefix(current, from, to)

    if (next === current) {
      return current
    }

    current = next
  }

  return current
}

export function normalizeBackendPath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (isBackendStaticPath(normalizedPath)) {
    return normalizedPath
  }

  const pathWithoutApiPrefix =
    normalizedPath === '/api' || normalizedPath.startsWith('/api/')
      ? normalizedPath.slice('/api'.length) || '/'
      : normalizedPath

  if (isBackendStaticPath(pathWithoutApiPrefix)) {
    return pathWithoutApiPrefix
  }

  const aliasedPath = resolveBackendPathAlias(pathWithoutApiPrefix)

  if (aliasedPath === '/api' || aliasedPath.startsWith('/api/')) {
    return aliasedPath
  }

  return `/api${aliasedPath}`
}

function apiBaseForPath(path: string): string {
  if (isBackendStaticPath(path) && API_BASE_URL.endsWith('/api')) {
    return API_BASE_URL.slice(0, -'/api'.length)
  }

  return API_BASE_URL
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  const normalizedPath = normalizeBackendPath(path)
  const apiBase = apiBaseForPath(normalizedPath)

  if (!apiBase) {
    return normalizedPath
  }

  if (apiBase.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    return `${apiBase}${normalizedPath.slice('/api'.length)}`
  }

  return `${apiBase}${normalizedPath}`
}

export function backendFileUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (!API_BASE_URL) {
    return normalizedPath
  }

  const backendBase = API_BASE_URL.endsWith('/api')
    ? API_BASE_URL.slice(0, -'/api'.length)
    : API_BASE_URL
  return `${backendBase}${normalizedPath}`
}
