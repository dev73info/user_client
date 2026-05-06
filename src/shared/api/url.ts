const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? ''

export const API_BASE_URL = rawBase.replace(/\/$/, '')

const backendStaticPathPrefixes = ['/uploads']

const backendPathAliases: ReadonlyArray<readonly [string, string]> = [
  ['/public/requirements', '/requirements'],
  ['/dev/requirements', '/requirement'],
  ['/payments', '/payment'],
  ['/coupons', '/coupon'],
  ['/contracts', '/contract'],
  ['/dev/resources', '/resources'],
  ['/dev/payments', '/payment'],
  ['/dev/contracts', '/contract'],
  ['/dev/credit', '/credit/credit'],
  ['/requirements', '/requirement'],
  ['/settings', '/system/settings'],
  ['/resources/tags', '/tag/tags'],
]

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
  const alias = backendPathAliases.find(([from]) => hasPathPrefix(path, from))

  if (!alias) {
    return path
  }

  const [from, to] = alias
  return replacePathPrefix(path, from, to)
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
