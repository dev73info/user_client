import { describe, expect, it } from 'vitest'

import { canPreviewResource } from '@/shared/resourceNavigation'
import { resourceFixture } from './devResourceHomepageFixtures'

describe('资源主页预览可见性', () => {
  it('已公开普通资源可预览', () => {
    expect(canPreviewResource(resourceFixture({ visibility: 'published' }))).toBe(true)
  })

  it('需求关联资源即使未公开也可由当事人预览', () => {
    expect(
      canPreviewResource(resourceFixture({ visibility: 'review', requirement_id: 'REQ-3' })),
    ).toBe(true)
  })

  it.each(['draft', 'review'] as const)('%s 且未关联需求时不可预览', (visibility) => {
    expect(canPreviewResource(resourceFixture({ visibility, requirement_id: null }))).toBe(false)
  })

  it('接口资源即使已公开也没有公开预览页', () => {
    expect(
      canPreviewResource(resourceFixture({ visibility: 'published', resource_kind: 'api' })),
    ).toBe(false)
  })

  it('资源尚未加载时不可预览', () => {
    expect(canPreviewResource(null)).toBe(false)
  })
})
