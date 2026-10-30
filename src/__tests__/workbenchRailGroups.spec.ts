import { describe, expect, it } from 'vitest'

import {
  buildRailGroups,
  railGroupItemActive,
  railGroupItemTo,
  railGroupOf,
} from '@/shared/workbenchRailGroups'
import { workbenchRailAccountMenuItems } from '@/shared/workbenchRailAccountMenu'

/** 图标栏能到的全部入口：两个分组里的页面 + 齿轮弹层里的账户四条 + 个人账户。 */
function reachableRouteNames(realnameApproved: boolean): string[] {
  return [
    ...buildRailGroups(realnameApproved).flatMap((group) => group.items.map((item) => item.name)),
    ...workbenchRailAccountMenuItems.map((item) => item.to.name),
    'workbench',
  ]
}

describe('buildRailGroups', () => {
  it('两个分组：订单与合同、资产与权益', () => {
    expect(buildRailGroups(true).map((group) => group.key)).toEqual(['orders', 'assets'])
    expect(buildRailGroups(true).map((group) => group.label)).toEqual(['订单与合同', '资产与权益'])
  })

  it('订单与合同按成交动线排：需求 → 合同 → 发票 → 已购 → 过户', () => {
    expect(buildRailGroups(true)[0]?.items.map((item) => item.label)).toEqual([
      '我的需求',
      '我的合同',
      '我的发票',
      '我的已购',
      '过户与转移',
    ])
  })

  it('资产与权益按券 / 积分 / 权益排', () => {
    expect(buildRailGroups(true)[1]?.items.map((item) => item.label)).toEqual([
      '我的收藏',
      '优惠券中心',
      '积分中心',
      '积分商城',
      '我的权益',
      '勋章与邀请',
    ])
  })

  it('实名未通过时没有「我的合同」，通过后出现在订单与合同里', () => {
    const before = buildRailGroups(false)[0]?.items.map((item) => item.name) ?? []
    const after = buildRailGroups(true)[0]?.items.map((item) => item.name) ?? []

    expect(before).not.toContain('workbench-signatures')
    expect(after).toContain('workbench-signatures')
    expect(after.length).toBe(before.length + 1)
  })

  it('组内第一条就是组的落地页（点图标进这里）', () => {
    const groups = buildRailGroups(true)

    expect(railGroupItemTo(groups[0]!.items[0]!)).toEqual({ name: 'workbench-requirements' })
    expect(railGroupItemTo(groups[1]!.items[0]!)).toEqual({ name: 'workbench-favorites' })
  })
})

describe('railGroupOf / railGroupItemActive', () => {
  const groups = buildRailGroups(true)

  it('当前页落在哪一组就返回哪一组', () => {
    expect(railGroupOf(groups, 'workbench-requirements')?.key).toBe('orders')
    expect(railGroupOf(groups, 'workbench-coupons')?.key).toBe('assets')
  })

  it('不在任何分组里的页面（消息 / 系统通知 / 开发者页）返回 null', () => {
    expect(railGroupOf(groups, 'workbench')).toBeNull()
    expect(railGroupOf(groups, 'workbench-notifications')).toBeNull()
    expect(railGroupOf(groups, 'dev-home')).toBeNull()
  })

  it('合同详情这种子页面仍算「我的合同」这一条', () => {
    const signatures = groups[0]!.items.find((item) => item.name === 'workbench-signatures')!

    expect(railGroupItemActive(signatures, 'workbench-signature-detail')).toBe(true)
    expect(railGroupOf(groups, 'workbench-signature-detail')?.key).toBe('orders')
  })

  it('邀请排行榜仍算「勋章与邀请」这一条', () => {
    expect(railGroupOf(groups, 'workbench-invite-leaderboard')?.key).toBe('assets')
  })
})

describe('图标栏不重复、也不漏入口', () => {
  it('每个路由名只出现一次（齿轮与分组不再各列一遍）', () => {
    const names = reachableRouteNames(true)
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index)

    expect(duplicates).toEqual([])
  })

  it('用户点名的 15 个入口全部可达', () => {
    const names = reachableRouteNames(true)

    for (const name of [
      'workbench', // 个人账户（?view=profile）
      'workbench-account',
      'workbench-authorized-apps',
      'workbench-tickets',
      'workbench-signatures',
      'workbench-invoices',
      'workbench-favorites',
      'workbench-coupons',
      'workbench-points',
      'mall',
      'workbench-perks',
      'workbench-badges',
      'workbench-resource-purchases',
      'workbench-purchase-transfers',
      'workbench-requirements',
    ]) {
      expect(names).toContain(name)
    }
  })
})
