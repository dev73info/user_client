import type { Component } from 'vue'

import {
  Box,
  Compass,
  Connection,
  DataAnalysis,
  Files,
  Tickets,
  UserFilled,
  Wallet,
} from 'ui_73info'

/**
 * 工作台外壳的菜单模型与路由判定（纯数据 + 纯函数）。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来：外壳只负责排版，菜单里「有哪几条、指向哪条路由、
 * 当前停在哪一条」这些判断都收在这里。不读 store、不发请求、不碰 `useRoute`，
 * 调用方把 `route` 上的三个值摊平传进来，便于单测。
 */

/** 侧边栏条目指向的路由名：两种工作台各有一批（见 router/index.ts 与 router/dev.ts）。 */
export type WorkbenchRouteName = string

export type WorkbenchMenuItem = {
  label: string
  name: WorkbenchRouteName
  hash?: string
  description: string
  /** 停在子页面时也高亮这一条（如售出订单仍算「资源项目」，合同详情仍算「我的合同」）。 */
  activeNames?: WorkbenchRouteName[]
}

export type WorkbenchMenuGroup = {
  key: string
  label: string
  icon: Component
  items: WorkbenchMenuItem[]
}

/** 开发者菜单的一级条目：与用户菜单的一级条目同版式，每条带一个图标。 */
export type DevWorkbenchItem = WorkbenchMenuItem & { icon: Component }

/** 把 `useRoute()` 上与高亮有关的三项摊平，避免纯函数里再依赖路由对象。 */
export type MenuRouteContext = {
  /** 当前路由名（`String(route.name ?? '')`）。 */
  name: string
  /** 当前 hash（含 `#`；没有就是空串）。 */
  hash: string
  /** 是否从团队资源列表进到版本管理 / 编辑主页（`route.query.from === 'team-resources'`）。 */
  fromTeamResources: boolean
}

/** 折叠组的 key 里唯一不是菜单分组的一条：消息中心夹在分组之间，展开状态也记在同一份列表里。 */
export const MESSAGES_GROUP_KEY = 'messages'

export const overviewItem: WorkbenchMenuItem = {
  label: '工作台总览',
  name: 'workbench',
  description: '账户、需求与优惠券概览',
}

// 「系统通知」夹在分组之外的底部一级条目里，两种工作台各有一条路由。
export const notificationsItem: WorkbenchMenuItem = {
  label: '系统通知',
  name: 'workbench-notifications',
  description: '待确认的公开申请与系统消息',
}

// 开发者工作台菜单：侧边栏切到开发者模式时展示（此前是底部「开发者工作台」折叠组的内容）。
// 版式与用户菜单的一级条目一致（图标 + 加粗标题），切换模式时侧边栏只有文字在变。
// 一级条目不再分小标题，按开发者每天的动线从上往下排：总览 → 资源 → 接单（交付与到账也在这一页）；
// 与钱有关的三条（收益钱包、我的发票、打赏设置）收进下面的「财务中心」折叠组，
// 团队服务那一段也不顶小标题，靠折叠组的分组头自己报名字。
export const devWorkbenchItems: DevWorkbenchItem[] = [
  {
    label: '工作台总览',
    name: 'dev-home',
    description: '接单收入、保证金与交付概览',
    icon: DataAnalysis,
  },
  {
    label: '资源项目',
    name: 'dev-resource-list',
    description: '管理主页、版本与资源状态',
    // 售出订单从资源「更多」进入，侧栏仍高亮「资源项目」
    activeNames: [
      'dev-resource-homepage-edit',
      'dev-resource-versions',
      'dev-resource-sold-purchases',
    ],
    icon: Files,
  },
  {
    label: '需求大厅',
    name: 'dev-requirement-hall',
    description: '浏览并关联可接需求',
    icon: Compass,
  },
  {
    // 「交付记录」已并进这一页：交付物与到账长在需求单卡片上，菜单不再单列一条。
    label: '我的接单',
    name: 'dev-my-requirements',
    description: '查看已关联需求、交付与到账',
    icon: Tickets,
  },
]

// 财务中心：只跟钱有关的三条收成一组的折叠组。收益钱包原先是开发者菜单的一级条目，
// 发票页原挂在用户模式的「账户服务」下——同一件钱的事被分在了两处，这里合并成一组。
// 打赏设置原也是开发者菜单的一级条目（带图标），按要求移进来作为子项、不再渲染图标。
// 开发者模式下渲染，用户模式看不到；用户模式的账户服务里仍保留「我的发票」那一条。
export const financeMenuGroup: WorkbenchMenuGroup = {
  key: 'finance',
  label: '财务中心',
  icon: Wallet,
  items: [
    { label: '收益钱包', name: 'dev-wallet', description: '查看余额与保证金信息' },
    { label: '我的发票', name: 'dev-invoices', description: '查看与上传开发者发票' },
    // R010 打赏：主页打赏入口的开关、档位、感谢语与公开记录，以及「收到打赏」列表。
    { label: '打赏设置', name: 'dev-tip-settings', description: '设定打赏档位与查看收到打赏' },
  ],
}

// 团队服务已整体移入开发者工作台：用户模式下不出现，开发者模式下按原来的折叠组版式展示。
// 组内条目叫「团队资源」：开发者侧边栏另有一条自己的「资源项目」，重名会让两条菜单分不清。
export const teamMenuGroup: WorkbenchMenuGroup = {
  key: 'team',
  label: '团队服务',
  icon: UserFilled,
  items: [
    { label: '我的团队', name: 'workbench-teams', description: '查看和管理团队' },
    { label: '团队资源', name: 'workbench-team-resources', description: '管理团队共享资源项目' },
  ],
}

// 分组头已经写着组名，因此这几类分组不再额外顶一行灰色小标题：
// 账户服务、团队服务、财务中心都靠分组头识别，再加一行会把组名写成两遍。
export const GROUPS_WITHOUT_SECTION_LABEL = ['account', 'team', 'finance']

/** 用户菜单的两个分组。`realnameApproved` 决定「我的合同」那一条在不在（实名通过后才出现）。 */
export function buildMenuGroups(realnameApproved: boolean): WorkbenchMenuGroup[] {
  return [
    {
      // 只剩一个页面：侧边栏按一级条目渲染成「我的需求」（组名与页名一致，省掉无意义的「需求协作」外壳）。
      key: 'collaboration',
      label: '我的需求',
      icon: Connection,
      items: [
        {
          label: '我的需求',
          name: 'workbench-requirements',
          description: '查看支付、交付与验收进度',
        },
      ],
    },
    {
      key: 'account',
      label: '账户服务',
      icon: Box,
      items: [
        { label: '账户详情', name: 'workbench-account', description: '管理账户' },
        ...(realnameApproved
          ? [
              {
                label: '我的合同',
                name: 'workbench-signatures',
                description: '查看合同与签署进度',
                activeNames: ['workbench-signature-detail'],
              },
            ]
          : []),
        { label: '我的发票', name: 'workbench-invoices', description: '获取发票、查看与下载' },
        { label: '优惠券中心', name: 'workbench-coupons', description: '查看券包并复制券码' },
        {
          label: '我的已购',
          name: 'workbench-resource-purchases',
          description: '已购数字资源，退款由卖家或平台发起',
        },
      ],
    },
  ]
}
