import { describe, expect, it } from 'vitest'

import {
  buildMenuGroups,
  devWorkbenchItems,
  financeMenuGroup,
  GROUPS_WITHOUT_SECTION_LABEL,
  teamMenuGroup,
  type WorkbenchMenuItem,
} from '@/shared/workbenchMenu'
import { menuItemBadgeText, menuItemTo } from '@/shared/workbenchRoutes'

/** 只填展示层用得到的字段；其余字段与这些断言无关。 */
const itemOf = (overrides: Partial<WorkbenchMenuItem> = {}): WorkbenchMenuItem =>
  ({
    label: '账户详情',
    name: 'workbench-account',
    description: '管理账户',
    ...overrides,
  }) as WorkbenchMenuItem

describe('buildMenuGroups', () => {
  it('用户菜单两个分组，顺序是「我的需求 / 账户服务」', () => {
    // 「我的背包」（积分 / 商城 / 权益）整块下线：后端契约里没有积分与商城相关路径
    expect(buildMenuGroups(false).map((group) => group.key)).toEqual(['collaboration', 'account'])
  })

  it('「我的需求」只剩一个页面：整组收成一条一级条目', () => {
    const [collaboration] = buildMenuGroups(false)

    expect(collaboration?.items).toHaveLength(1)
    expect(collaboration?.items[0]?.name).toBe('workbench-requirements')
  })

  it('实名未通过时没有「我的合同」，通过后出现在账户服务里', () => {
    const before = buildMenuGroups(false)[1]?.items.map((item) => item.name) ?? []
    const after = buildMenuGroups(true)[1]?.items.map((item) => item.name) ?? []

    expect(before).not.toContain('workbench-signatures')
    expect(after).toContain('workbench-signatures')
    expect(after.indexOf('workbench-signatures')).toBe(1)
    expect(after.length).toBe(before.length + 1)
  })

  it('合同详情的编辑页仍高亮「我的合同」', () => {
    const signatures = buildMenuGroups(true)[1]?.items.find(
      (item) => item.name === 'workbench-signatures',
    )

    expect(signatures?.activeNames).toEqual(['workbench-signature-detail'])
  })

  it('不重复划分组小标题的组名集合', () => {
    expect(GROUPS_WITHOUT_SECTION_LABEL).toContain('account')
    expect(GROUPS_WITHOUT_SECTION_LABEL).toContain('team')
    expect(GROUPS_WITHOUT_SECTION_LABEL).toContain('finance')
    expect(GROUPS_WITHOUT_SECTION_LABEL).not.toContain('collaboration')
  })
})

describe('开发者菜单', () => {
  it('一级条目按动线平铺：总览 → 资源 → 需求大厅 → 我的接单', () => {
    expect(devWorkbenchItems.map((item) => item.label)).toEqual([
      '工作台总览',
      '资源项目',
      '需求大厅',
      '我的接单',
    ])
  })

  it('资源项目的子页面（版本 / 编辑主页 / 售出订单）都高亮这一条', () => {
    const resourceItem = devWorkbenchItems.find((item) => item.name === 'dev-resource-list')

    expect(resourceItem?.activeNames).toEqual([
      'dev-resource-homepage-edit',
      'dev-resource-versions',
      'dev-resource-sold-purchases',
    ])
  })

  it('财务中心与团队服务各三条 / 两条子项', () => {
    expect(financeMenuGroup.items.map((item) => item.name)).toEqual([
      'dev-wallet',
      'dev-invoices',
      'dev-tip-settings',
    ])
    expect(teamMenuGroup.items.map((item) => item.name)).toEqual([
      'workbench-teams',
      'workbench-team-resources',
    ])
  })
})

describe('menuItemTo / menuItemBadgeText', () => {
  it('没有 hash 的条目带空串 hash（保留原来的链接形状）', () => {
    expect(menuItemTo(itemOf())).toEqual({ name: 'workbench-account', hash: '' })
    expect(menuItemTo(itemOf({ hash: '#security' }))).toEqual({
      name: 'workbench-account',
      hash: '#security',
    })
  })

  it('只有「我的接单」挂角标，计数为 0 时不显示', () => {
    const myOrders = itemOf({ name: 'dev-my-requirements', label: '我的接单' })

    expect(menuItemBadgeText(myOrders, 3)).toBe('3')
    expect(menuItemBadgeText(myOrders, 0)).toBe('')
    expect(menuItemBadgeText(itemOf(), 3)).toBe('')
  })
})
