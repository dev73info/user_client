export const AUTH_UNAUTHORIZED_EVENT = '73info:auth-unauthorized'

export type AuthUnauthorizedEventDetail = {
  status: number
  path: string
  message: string
}

export function dispatchAuthUnauthorized(detail: AuthUnauthorizedEventDetail) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent<AuthUnauthorizedEventDetail>(AUTH_UNAUTHORIZED_EVENT, { detail }))
}