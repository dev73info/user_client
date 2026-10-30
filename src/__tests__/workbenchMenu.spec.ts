import { describe, expect, it } from 'vitest'

import { workbenchRoutes } from '@/router/routes/workbench'
import {
  buildMenuGroups,
  devWorkbenchItems,
  financeMenuGroup,
  GROUPS_WITHOUT_SECTION_LABEL,
  teamMenuGroup,
  type WorkbenchMenuItem,
} from '@/shared/workbenchMenu'
import { buildRailGroups } from '@/shared/workbenchRailGroups'
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
  it('用户菜单三个分组，顺序是「订单与合同 / 资产与权益 / 账户」', () => {
    expect(buildMenuGroups(false).map((group) => group.key)).toEqual(['orders', 'assets', 'account'])
  })

  it('分组与桌面图标栏共用一份数据，不再是两套排法', () => {
    const fromMenu = buildMenuGroups(true).map((group) => ({
      key: group.key,
      items: group.items.map((item) => item.name),
    }))
    const fromRail = buildRailGroups(true).map((group) => ({
      key: group.key,
      items: group.items.map((item) => item.name),
    }))

    // 前两组逐条相同；账户组是侧栏独有的（桌面端放在齿轮弹层里）
    expect(fromMenu.slice(0, 2)).toEqual(fromRail)
    expect(fromMenu[2]?.key).toBe('account')
  })

  it('我的需求不再单独成组，进了「订单与合同」', () => {
    const orders = buildMenuGroups(false)[0]

    expect(orders?.label).toBe('订单与合同')
    expect(orders?.items.map((item) => item.name)).toContain('workbench-requirements')
  })

  it('需求方旧助手地址直接回到我的需求', () => {
    const assistant = workbenchRoutes
      .find((route) => route.path === '/workbench')
      ?.children?.find((route) => route.path === 'assistant')

    expect(assistant?.redirect).toEqual({ name: 'workbench-requirements' })
    expect(assistant?.name).not.toBe('workbench-assistant')
  })

  it('实名未通过时没有「我的合同」，通过后出现在订单与合同里', () => {
    const before = buildMenuGroups(false)[0]?.items.map((item) => item.name) ?? []
    const after = buildMenuGroups(true)[0]?.items.map((item) => item.name) ?? []

    expect(before).not.toContain('workbench-signatures')
    expect(after.filter((name) => name === 'workbench-signatures')).toHaveLength(1)
    expect(after.length).toBe(before.length + 1)
  })

  it('合同详情的编辑页仍高亮「我的合同」', () => {
    const signatures = buildMenuGroups(true)[0]?.items.find(
      (item) => item.name === 'workbench-signatures',
    )

    expect(signatures?.activeNames).toEqual(['workbench-signature-detail'])
  })

  it('不重复划分组小标题的组名集合', () => {
    expect(GROUPS_WITHOUT_SECTION_LABEL).toContain('account')
    expect(GROUPS_WITHOUT_SECTION_LABEL).toContain('orders')
    expect(GROUPS_WITHOUT_SECTION_LABEL).toContain('assets')
    expect(GROUPS_WITHOUT_SECTION_LABEL).toContain('team')
    expect(GROUPS_WITHOUT_SECTION_LABEL).toContain('finance')
  })
})

describe('开发者菜单', () => {
  it('一级条目按动线平铺', () => {
    expect(devWorkbenchItems.map((item) => item.label)).toEqual([
      '工作台总览',
      '资源项目',
      '接入客户端',
      'AI 需求助手',
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
