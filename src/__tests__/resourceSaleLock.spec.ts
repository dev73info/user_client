import { describe, expect, it } from 'vitest'

import { checkHomepageSave, type HomepageSaveGuard } from '@/shared/resourceHomepageSave'
import {
  isClaimedCustomResource,
  isResourceSaleLockedByRequirement,
} from '@/shared/resourcePresentation'
import { canSwitchToPointsPrice } from '@/shared/resourceSale'

/**
 * 定制资源（绑定需求单）的 claim 口径：
 * - 未 claim：售价与公开申请锁定；
 * - claim 后：按普通资源售卖，免费 ↔ 现金可以来回改；
 * - `cash_price_locked` 只锁「现金 → 积分」一个方向，不误伤免费 ↔ 现金。
 */

function guard(part: Partial<HomepageSaveGuard> = {}): HomepageSaveGuard {
  return {
    title: '示例资源',
    description: '一套手绘笔刷与配套示例工程。',
    isApiKind: false,
    keepSavedTags: false,
    platformGroupCount: 1,
    selectedTagCount: 1,
    ownershipType: 'individual',
    teamId: '',
    effectiveOriginType: 'original',
    originUrl: '',
    priceYuan: '0',
    pricePoints: '0',
    promoSharePercent: 0,
    pointsLockedBySavedCash: false,
    saleLockedByRequirement: false,
    copyrightDeclared: true,
    visibility: 'draft',
    ...part,
  }
}

describe('定制资源：claim 前锁定售价与公开申请', () => {
  it('绑定需求且未 claim 才是锁定；claim 后放行', () => {
    expect(isResourceSaleLockedByRequirement({ requirement_id: '2026-1' })).toBe(true)
    expect(
      isResourceSaleLockedByRequirement({ requirement_id: '2026-1', requirement_claimed: false }),
    ).toBe(true)
    expect(
      isResourceSaleLockedByRequirement({ requirement_id: '2026-1', requirement_claimed: true }),
    ).toBe(false)
    // 非定制资源永远不锁
    expect(isResourceSaleLockedByRequirement({ requirement_id: null })).toBe(false)
    expect(isResourceSaleLockedByRequirement({})).toBe(false)
  })

  it('「我的资源」只收已 claim 的定制交付', () => {
    expect(isClaimedCustomResource({ requirement_id: '2026-1', requirement_claimed: true })).toBe(
      true,
    )
    expect(isClaimedCustomResource({ requirement_id: '2026-1', requirement_claimed: false })).toBe(
      false,
    )
    expect(isClaimedCustomResource({ requirement_id: null, requirement_claimed: true })).toBe(false)
  })

  it('未 claim 时现金 / 积分定价都被保存校验拒绝', () => {
    expect(
      checkHomepageSave(guard({ saleLockedByRequirement: true, priceYuan: '12.34' })).message,
    ).toBe('需求方尚未转为我的资源，暂不可定价')
    expect(
      checkHomepageSave(guard({ saleLockedByRequirement: true, pricePoints: '20' })).message,
    ).toBe('需求方尚未转为我的资源，暂不可定价')
    // 免费（0）不触发锁定：未 claim 期间仍可保存其它主页字段
    expect(checkHomepageSave(guard({ saleLockedByRequirement: true })).message).toBeNull()
  })

  it('claim 后免费 ↔ 现金可以来回保存', () => {
    // 现金价 > 0
    expect(checkHomepageSave(guard({ priceYuan: '12.34' })).message).toBeNull()
    // 改回免费
    expect(checkHomepageSave(guard({ priceYuan: '0' })).message).toBeNull()
    // 再从免费改回现金
    expect(checkHomepageSave(guard({ priceYuan: '99.90' })).message).toBeNull()
  })

  it('cash_price_locked 只拦「现金 → 积分」，不拦免费 ↔ 现金', () => {
    // 曾设过现金价：积分价 > 0 被拒
    expect(
      checkHomepageSave(guard({ pointsLockedBySavedCash: true, pricePoints: '20' })).message,
    ).toBe('设过现金售价的资源不可改为积分售价')
    // 同一份「曾设过现金」的状态下，免费与现金价都不受影响
    expect(
      checkHomepageSave(guard({ pointsLockedBySavedCash: true, priceYuan: '0' })).message,
    ).toBeNull()
    expect(
      checkHomepageSave(guard({ pointsLockedBySavedCash: true, priceYuan: '12.34' })).message,
    ).toBeNull()
  })

  it('积分价开关只看「是否设过现金」，与 claim 无关', () => {
    expect(canSwitchToPointsPrice(0, false)).toBe(true)
    expect(canSwitchToPointsPrice(0, true)).toBe(false)
    expect(canSwitchToPointsPrice(100, false)).toBe(false)
    expect(canSwitchToPointsPrice(0, null)).toBe(true)
  })
})
