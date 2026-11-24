import { describe, expect, it } from 'vitest'

import { deviceTypeFor, isDevRoute, routePattern } from '@/shared/telemetry'
import type { RouteLike } from '@/shared/telemetry'

function route(path: string, matched: RouteLike['matched']): RouteLike {
  return { path, matched }
}

describe('ops web telemetry', () => {
  it('joins nested route records into a stable template', () => {
    expect(
      routePattern(route('/workbench/account', [{ path: '/workbench' }, { path: 'account' }])),
    ).toBe('/workbench/account')
    expect(routePattern(route('/resources/1024', [{ path: '/resources/:resourceSlug' }]))).toBe(
      '/resources/:resourceSlug',
    )
    expect(
      routePattern(
        route('/workbench/developer/resources/12/homepage', [
          { path: '/workbench' },
          { path: 'developer/resources/:resourceId(\\d+)/homepage' },
        ]),
      ),
    ).toBe('/workbench/developer/resources/:resourceId(\\d+)/homepage')
  })

  it('classifies device width', () => {
    expect(deviceTypeFor(390)).toBe('mobile')
    expect(deviceTypeFor(800)).toBe('tablet')
    expect(deviceTypeFor(1440)).toBe('desktop')
  })

  it('routes developer workbench to web_dev', () => {
    expect(isDevRoute(route('/dev/resources', [{ path: '/dev/resources' }]))).toBe(true)
    expect(
      isDevRoute(
        route('/workbench/developer/home', [
          { path: '/workbench' },
          { path: 'developer/home', meta: { devArea: true } },
        ]),
      ),
    ).toBe(true)
    expect(
      isDevRoute(route('/workbench/account', [{ path: '/workbench' }, { path: 'account' }])),
    ).toBe(false)
  })
})
