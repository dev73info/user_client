import { describe, expect, it } from 'vitest'

import {
  buildDevRailGroups,
  buildRailGroups,
  railGroupItemActive,
  railGroupItemTo,
  railGroupOf,
} from '@/shared/workbenchRailGroups'
import { workbenchRailAccountMenuItems } from '@/shared/workbenchRailAccountMenu'

/** 图标栏能到的全部入口：两个分组里的页面 + 齿轮弹层里的账户三条 + 工作台根页。 */
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

  it('订单与合同按成交动线排：需求 → 我的资源 → 合同 → 发票 → 已购 → 过户', () => {
    expect(buildRailGroups(true)[0]?.items.map((item) => item.label)).toEqual([
      '我的需求',
      '我的资源',
      '我的合同',
      '我的发票',
      '我的已购',
      '过户与转移',
    ])
  })

  it('资产与权益按券 / 积分 / 权益排（积分商城不在这里，走顶栏）', () => {
    expect(buildRailGroups(true)[1]?.items.map((item) => item.label)).toEqual([
      '我的帖子',
      '优惠券中心',
      '我的积分',
      '我的权益',
      '勋章与邀请',
      '活动中心',
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

describe('buildDevRailGroups', () => {
  it('开发者图标栏同样收成两个分组：接单与交付、收益与服务', () => {
    expect(buildDevRailGroups().map((group) => group.key)).toEqual(['dev-delivery', 'dev-services'])
    expect(buildDevRailGroups().map((group) => group.label)).toEqual(['接单与交付', '收益与服务'])
  })

  it('接单与交付按总览 → 资源 → 接单 → 大厅排', () => {
    expect(buildDevRailGroups()[0]?.items.map((item) => item.label)).toEqual([
      '开发者总览',
      '资源项目',
      '我的接单',
      '需求大厅',
    ])
  })

  it('收益与服务包含客户端、团队、钱包与发票', () => {
    expect(buildDevRailGroups()[1]?.items.map((item) => item.label)).toEqual([
      '接入客户端',
      '团队服务',
      '收益钱包',
      '我的发票',
    ])
  })

  it('资源/需求/团队的子页面仍高亮所属父条目', () => {
    const groups = buildDevRailGroups()

    expect(railGroupOf(groups, 'dev-resource-versions')?.key).toBe('dev-delivery')
    expect(railGroupOf(groups, 'dev-requirement-detail')?.key).toBe('dev-delivery')
    expect(railGroupOf(groups, 'workbench-team-detail')?.key).toBe('dev-services')
  })

  it('消息与系统通知不在开发者分组里', () => {
    const groups = buildDevRailGroups()

    expect(railGroupOf(groups, 'dev-messages')).toBeNull()
    expect(railGroupOf(groups, 'dev-notifications')).toBeNull()
  })
})

describe('图标栏不重复、也不漏入口', () => {
  it('每个路由名只出现一次（齿轮与分组不再各列一遍）', () => {
    const names = reachableRouteNames(true)
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index)

    expect(duplicates).toEqual([])
  })

  it('用户点名的入口全部可达（积分商城走顶栏，见 usePortalTopNavNav）', () => {
    const names = reachableRouteNames(true)

    for (const name of [
      'workbench', // 工作台根页（消息入口）
      'workbench-account',
      'workbench-authorized-apps',
      'workbench-tickets',
      'workbench-signatures',
      'workbench-invoices',
      'workbench-favorites',
      'workbench-coupons',
      'workbench-points',
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
