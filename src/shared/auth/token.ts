export const REFRESH_BEFORE_EXPIRY_MS = 2 * 60 * 1000
export const MIN_REFRESH_DELAY_MS = 15_000
export const RETRY_AFTER_FAILURE_MS = 30_000

export function getTokenExpMs(jwt: string): number {
  try {
    const payload = jwt.split('.')[1]
    if (!payload) return NaN
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const json = JSON.parse(atob(padded)) as { exp?: unknown }
    return typeof json.exp === 'number' ? json.exp * 1000 : NaN
  } catch {
    return NaN
  }
}

export function isTokenExpired(jwt: string): boolean {
  const exp = getTokenExpMs(jwt)
  return Number.isFinite(exp) && Date.now() >= exp
}
