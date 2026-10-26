import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import { buildPublicShareRedirectPath } from '@/router/routes/portal'
import { routes } from '@/router/routes'

describe('社区路由与短链', () => {
  it('社区列表和详情先于通用资源路由匹配', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/community').name).toBe('community')
    expect(router.resolve('/community/posts/7').name).toBe('community-post')
    expect(router.resolve('/community/posts/7').name).not.toBe('resource-catalog')
  })

  it('community_post 短链落到真实帖子详情', () => {
    expect(buildPublicShareRedirectPath('community_post', '7', '')).toBe('/community/posts/7')
    expect(buildPublicShareRedirectPath('community_post', '7', '/community')).toBe('/community')
    expect(buildPublicShareRedirectPath('community_post', 'invalid', '')).toBe('/')
  })

  it('原有资源和需求短链行为不变', () => {
    expect(buildPublicShareRedirectPath('resource', '9', '', 'PROMO')).toBe(
      '/resources/resource--9?promo=PROMO',
    )
    expect(buildPublicShareRedirectPath('requirement', 'REQ-1', '')).toBe(
      '/requirement-hall?requirement_id=REQ-1',
    )
  })
})
