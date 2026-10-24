import { describe, expect, it } from 'vitest'

import { requirementBoundResourceSlug } from '@/shared/resourceNavigation'

/**
 * 需求行绑定资源的深链 slug：`<作者>--<id>`（见 ResourceDetailRedirectView）。
 *
 * 作者口径与拆分前逐字一致：需求发布人 → 当前登录用户 → 资源作者 → 需求标题。
 * 这四条是纯函数层的唯一回归网（这个视图没有挂载测试），口径一换，
 * 需求行的「主页」就会指到另一个人的资源页去。
 */

const BOUND_RESOURCE_ID = 42

describe('requirementBoundResourceSlug', () => {
  it('优先用需求发布人做作者段', () => {
    expect(
      requirementBoundResourceSlug(
        {
          creator: 'Alice',
          title: '订单页改版',
          bound_resource_id: BOUND_RESOURCE_ID,
          bound_resource_author: 'Bob',
        },
        'carol',
      ),
    ).toBe('alice--42')
  })

  it('发布人为空时回退当前登录用户，再回退资源作者、需求标题', () => {
    const base = { creator: '   ', title: '订单页改版', bound_resource_id: BOUND_RESOURCE_ID }

    expect(requirementBoundResourceSlug({ ...base, bound_resource_author: 'Bob' }, 'carol')).toBe(
      'carol--42',
    )
    expect(requirementBoundResourceSlug({ ...base, bound_resource_author: 'Bob' }, '')).toBe(
      'bob--42',
    )
    // 标题是中文时 slug 段归一化后为空，按 `getResourceDetailSlug` 的口径回退成 `resource`。
    expect(requirementBoundResourceSlug(base, undefined)).toBe('resource--42')
  })

  it('作者段做 slug 归一化：去音标、折成小写连字符', () => {
    expect(
      requirementBoundResourceSlug(
        { creator: 'Zhāng  Wei', title: '', bound_resource_id: 7 },
        undefined,
      ),
    ).toBe('zhang-wei--7')
  })
})
