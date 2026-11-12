import { describe, expect, it } from 'vitest'

import { tourForRoute } from '@/features/tour/routeTour'

describe('tourForRoute', () => {
  it('有页面引导的路由映射到对应 tour', () => {
    expect(tourForRoute({ name: 'workbench-requirements' })).toBe('my-requirements')
    expect(tourForRoute({ name: 'workbench-requirement-hall' })).toBe('requirement-hall')
    expect(tourForRoute({ name: 'workbench-signatures' })).toBe('signatures')
    expect(tourForRoute({ name: 'workbench-account' })).toBe('account')
  })

  it('没有页面引导时回落到 basic（含未命名路由）', () => {
    expect(tourForRoute({ name: 'workbench-home' })).toBe('basic')
    expect(tourForRoute({ name: undefined })).toBe('basic')
  })
})
