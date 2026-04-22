export const DEV_PORTAL_URL =
  (import.meta.env.VITE_DEV_PORTAL_URL as string | undefined)?.trim() || 'https://dev.73info.cn'

export function buildDevPortalUrl(token?: string): string {
  const normalizedToken = token?.trim() ?? ''
  if (!normalizedToken) {
    return DEV_PORTAL_URL
  }

  try {
    const url = new URL(DEV_PORTAL_URL, window.location.origin)
    url.searchParams.set('sso_token', normalizedToken)
    return url.toString()
  } catch {
    return DEV_PORTAL_URL
  }
}
