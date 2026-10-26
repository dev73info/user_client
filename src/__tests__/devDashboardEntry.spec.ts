import { describe, expect, it } from 'vitest'

import { devWorkbenchItems } from '@/shared/workbenchMenu'
import { devWorkbenchSharedRoutes } from '@/router/dev/workbenchShared'

describe('实时看板是总览的全屏版，不是独立菜单页', () => {
  it('侧边栏不再有「实时看板」菜单项', () => {
    expect(devWorkbenchItems.some((item) => item.name === 'dev-dashboard')).toBe(false)
    expect(devWorkbenchItems.some((item) => item.name === 'dev-home')).toBe(true)
  })

  it('旧深链 /developer/dashboard 重定向到总览的全屏版', () => {
    const route = devWorkbenchSharedRoutes.find((item) => item.path === 'developer/dashboard')
    expect(route?.name).toBe('dev-dashboard')
    expect(route?.redirect).toEqual({ name: 'dev-home', query: { dashboard: '1' } })
    expect(route?.component).toBeUndefined()
  })
})
