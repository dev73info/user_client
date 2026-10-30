import type { Component } from 'vue'

import { Box, Tickets } from 'ui_73info'

/**
 * 桌面图标栏的「分组」：图标只负责开一组，组内页面在图标右侧的列表里选，内容在再右侧展示。
 *
 * 为什么要有这一层：图标栏上原本平铺着「我的需求 / 我的已购 / 我的收藏 / 我的权益」，
 * 齿轮弹层里又把同一批入口连同账户那几条重复列了一遍（14 条挤在一个 218px 的浮层里），
 * 同一件事在两处、两个形状。现在按「一组一件事」收敛成两个分组，账户类留在齿轮里：
 *
 * - 订单与合同：成交全流程（我的需求 → 我的合同 → 我的发票 → 我的已购 → 过户与转移）；
 * - 资产与权益：券、积分、商城、权益、徽章这些「账户里的东西」。
 *
 * 与侧边栏的 `buildMenuGroups`（`workbenchMenu.ts`）分开放：那一份还喂着移动端抽屉的
 * 「账户服务」折叠组，两边的分组方式本来就不该绑在一起改。
 */

export type RailGroupItem = {
  key: string
  label: string
  /** 目标路由名。 */
  name: string
  /** 列表第二行的说明，悬浮 / 当前页时展开。 */
  description: string
  /** 停在子页面时也高亮这一条（合同详情仍算「我的合同」）。 */
  activeNames?: string[]
}

export type RailGroup = {
  key: string
  label: string
  icon: Component
  /** 组的落地页是第一条：点图标就进这里，之后在列表里横向换。 */
  items: RailGroupItem[]
}

/** 「我的合同」要实名通过才出现（没通过时点进去也会被弹去实名页）。 */
export function buildRailGroups(realnameApproved: boolean): RailGroup[] {
  const orders: RailGroupItem[] = [
    {
      key: 'requirements',
      label: '我的需求',
      name: 'workbench-requirements',
      description: '查看支付、交付与验收进度',
    },
    ...(realnameApproved
      ? [
          {
            key: 'signatures',
            label: '我的合同',
            name: 'workbench-signatures',
            description: '查看合同与签署进度',
            activeNames: ['workbench-signature-detail'],
          },
        ]
      : []),
    {
      key: 'invoices',
      label: '我的发票',
      name: 'workbench-invoices',
      description: '获取发票、查看与下载',
    },
    {
      key: 'resource-purchases',
      label: '我的已购',
      name: 'workbench-resource-purchases',
      description: '已购数字资源，退款由卖家或平台发起',
    },
    {
      key: 'purchase-transfers',
      label: '过户与转移',
      name: 'workbench-purchase-transfers',
      description: '处理资源所有权与订单使用权申请',
    },
  ]

  const assets: RailGroupItem[] = [
    {
      key: 'favorites',
      label: '我的收藏',
      name: 'workbench-favorites',
      description: '查看收藏的社区帖子',
    },
    {
      key: 'coupons',
      label: '优惠券中心',
      name: 'workbench-coupons',
      description: '查看券包并复制券码',
    },
    {
      key: 'points',
      label: '积分中心',
      name: 'workbench-points',
      description: '签到、积分明细与打赏',
    },
    { key: 'mall', label: '积分商城', name: 'mall', description: '兑换权益与道具卡' },
    {
      key: 'perks',
      label: '我的权益',
      name: 'workbench-perks',
      description: '佩戴主页与用户名权益',
    },
    {
      key: 'badges',
      label: '勋章与邀请',
      name: 'workbench-badges',
      description: '查看与佩戴徽章、邀请好友与邀请记录',
      activeNames: ['workbench-invite-leaderboard'],
    },
  ]

  return [
    { key: 'orders', label: '订单与合同', icon: Tickets, items: orders },
    { key: 'assets', label: '资产与权益', icon: Box, items: assets },
  ]
}

/** 这条子项是否就是当前页（`activeNames` 让子页面也点亮父项）。 */
export function railGroupItemActive(item: RailGroupItem, routeName: string): boolean {
  return item.name === routeName || (item.activeNames?.includes(routeName) ?? false)
}

/** 当前页落在哪个分组里；不在任何分组里（消息、系统通知、开发者页面）就是 null。 */
export function railGroupOf(groups: RailGroup[], routeName: string): RailGroup | null {
  return (
    groups.find((group) => group.items.some((item) => railGroupItemActive(item, routeName))) ?? null
  )
}

export function railGroupItemTo(item: RailGroupItem) {
  return { name: item.name }
}
