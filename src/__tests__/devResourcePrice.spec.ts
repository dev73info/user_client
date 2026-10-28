import { describe, expect, it } from 'vitest'

import { formatDevResourcePrice, hasDevResourcePrice } from '@/shared/devResourceList'
import { resourceFixture } from './devResourceHomepageFixtures'

describe('开发者资源售价展示', () => {
  it('普通资源没有买断价时展示当前单版本价', () => {
    const resource = resourceFixture({ id: 22, buyout_price_fen: 0, price_points: 0 })
    expect(formatDevResourcePrice(resource, { 22: 100 })).toBe('单版本 ¥1.00')
    expect(hasDevResourcePrice(resource, { 22: 100 })).toBe(true)
  })

  it('没有单版本价的普通资源仍是免费', () => {
    const resource = resourceFixture({ id: 22, buyout_price_fen: 0, price_points: 0 })
    expect(formatDevResourcePrice(resource, { 22: 0 })).toBe('免费')
    expect(hasDevResourcePrice(resource, { 22: 0 })).toBe(false)
  })

  it('接口资源不按普通单版本资源处理', () => {
    const resource = resourceFixture({
      id: 22,
      resource_kind: 'api',
      buyout_price_fen: 990,
      price_points: 0,
    })
    expect(formatDevResourcePrice(resource, { 22: 100 })).toBe('¥9.90')
  })

  it('积分买断仍展示积分', () => {
    const resource = resourceFixture({ id: 22, buyout_price_fen: 0, price_points: 25 })
    expect(formatDevResourcePrice(resource, {})).toBe('25 积分')
  })
})
