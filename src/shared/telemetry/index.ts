import type { RouteLocationNormalized, Router } from 'vue-router'

import { readPersistedAuthProfile } from '@/shared/auth/session'

import { enqueue, flushOnHide, handleOnline, scheduleFlush, setCurrentSession } from './queue'
import { readVisitorId } from './storage'
import { PageTiming } from './timing'
import type { DeviceType } from './types'

export type RouteLike = {
  path: string
  matched: ReadonlyArray<{
    path: string
    meta?: Record<string, unknown>
  }>
}

export function deviceTypeFor(width: number): DeviceType {
  if (width < 768) {
    return 'mobile'
  }
  if (width < 1024) {
    return 'tablet'
  }
  return 'desktop'
}

/** 开发者工作台挂在 `/workbench` 下，靠路由 meta 而不是路径前缀识别。 */
export function isDevRoute(route: RouteLike): boolean {
  return (
    route.path.startsWith('/dev') || route.matched.some((record) => Boolean(record.meta?.devArea))
  )
}

/** 只发送路由模板：动态 id、查询串、hash 与真实 URL 一律不进埋点。 */
export function routePattern(route: RouteLike): string {
  let pattern = ''
  for (const record of route.matched) {
    const segment = record.path
    if (!segment) {
      continue
    }
    pattern = segment.startsWith('/') ? segment : `${pattern.replace(/\/$/, '')}/${segment}`
  }
  return pattern || route.path || '/'
}

export function installWebTelemetry(router: Router): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }
  if (import.meta.env.MODE === 'test') {
    return
  }
  if (import.meta.env.VITE_OPS_TELEMETRY_ENABLED === 'false') {
    return
  }

  const timing = new PageTiming(({ event, sessionId, dev, immediate }) => {
    setCurrentSession(sessionId)
    enqueue(
      {
        session_id: sessionId,
        visitor_id: readVisitorId(),
        app_channel: dev ? 'web_dev' : 'web_user',
        device_type: deviceTypeFor(window.innerWidth),
        viewport_width: Math.max(1, Math.round(window.innerWidth)),
        event,
      },
      immediate,
    )
  })

  const account = () => readPersistedAuthProfile()?.username ?? ''
  const enter = (route: RouteLocationNormalized) => {
    timing.enter(routePattern(route), account(), isDevRoute(route))
  }

  router.afterEach((to) => enter(to))
  if (router.currentRoute.value.matched.length > 0) {
    enter(router.currentRoute.value)
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      timing.show()
      return
    }
    timing.hide()
    scheduleFlush(0)
  })
  window.addEventListener('pagehide', () => {
    timing.leave()
    flushOnHide()
  })
  window.addEventListener('beforeunload', () => {
    timing.leave()
    flushOnHide()
  })
  window.addEventListener('online', () => handleOnline())
  for (const name of ['pointerdown', 'keydown', 'touchstart'] as const) {
    document.addEventListener(name, () => timing.interact(), { passive: true })
  }
  window.addEventListener('scroll', () => timing.scroll(), { passive: true })
}
