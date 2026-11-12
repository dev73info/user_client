/**
 * 语音引导的文案与锚点（唯一音频来源）。
 *
 * 本文件必须自包含：根仓 `scripts/gen-tour-audio.mjs` 直接 import 它生成
 * `public/audio/tour/<key>-<step>.mp3`，任何 import（含类型导入）都会让脚本失败。
 * 改完文案后重跑脚本，音频与 manifest 跟这份文件同一提交。
 *
 * body 是纯朗读文本：单引号、单行、五十到一百二十个汉字，不写 Markdown、emoji 或网址。
 * target 缺省或元素不存在时，卡片居中显示，流程照常继续。
 */
export type TourPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface TourStep {
  title: string
  body: string
  /** 目标元素选择器；优先用 data-tour 锚点。 */
  target?: string
  /** 卡片优先方位，空间不足时自动翻转。 */
  placement?: TourPlacement
}

export interface TourDefinition {
  key?: string
  title: string
  steps: TourStep[]
}

export const TOURS: Record<string, TourDefinition> = {
  basic: {
    title: '工作台导览',
    steps: [
      {
        title: '欢迎来到工作台',
        body: '这里是需求方工作台，发布的需求、合同、会话和账户资产都汇总在这一页。接下来用几步带你熟悉每个入口，随时可以跳过。',
        target: '[data-tour="basic:1"]',
        placement: 'bottom',
      },
      {
        title: '左侧图标栏',
        body: '左侧图标栏用来切换工作台的主要区域。最上面是工作台总览和消息，往下是我的需求、合同等分组，底部是账户菜单和引导帮助。',
        target: '[data-tour="basic:2"]',
        placement: 'right',
      },
      {
        title: '总览读数',
        body: '顶部的读数条汇总了需求总数、待处理数量、进行中的会话和可用优惠券。数字会随着你的操作变化，点右侧刷新可以立即更新。',
        target: '[data-tour="basic:3"]',
        placement: 'bottom',
      },
      {
        title: '快捷入口',
        body: '快捷入口把发布需求、我的需求、消息中心和优惠券中心放在一起，常用操作一步直达，不用在菜单里逐层查找。',
        target: '[data-tour="basic:4"]',
        placement: 'bottom',
      },
      {
        title: '消息与通知',
        body: '消息图标上出现数字，表示有新的会话或未读回复。点开以后可以在右侧和开发者继续沟通，系统通知也在图标栏里单独列出。',
        target: '[data-tour="basic:5"]',
        placement: 'right',
      },
      {
        title: '账户菜单',
        body: '底部的账户头像打开账户菜单，里面有账户与安全、我的合同等入口，也可以从菜单退出登录。头像点亮表示当前停在账户页面。',
        target: '[data-tour="basic:6"]',
        placement: 'right',
      },
      {
        title: '需求大厅与资源',
        body: '顶部导航的需求大厅展示平台上的公开需求，资源项目里有可以购买的数字化资源。两处都可以从工作台直接跳转过去。',
        target: '[data-tour="basic:7"]',
        placement: 'bottom',
      },
      {
        title: '引导帮助',
        body: '左下角的引导帮助按钮会播放当前页面的操作讲解；没有单独讲解的页面会播放这段基础导览。',
        target: '[data-tour="basic:8"]',
        placement: 'right',
      },
      {
        title: '最近需求',
        body: '最近需求按创建时间列出五条，点任意一条可以查看详情或继续沟通。需要你处理的事项会优先出现在待处理需求里。',
        target: '[data-tour="basic:9"]',
        placement: 'top',
      },
    ],
  },
  'requirement-hall': {
    title: '需求大厅导览',
    steps: [
      {
        title: '筛选与排序',
        body: '工具栏可以按担保方式和发布时间筛选需求，换一个条件列表就会重新加载。右侧同时显示当前筛选结果的数量。',
        target: '[data-tour="requirement-hall:1"]',
        placement: 'bottom',
      },
      {
        title: '搜索需求',
        body: '搜索框支持按标题和编号查找需求。输入关键词后列表会立即过滤，清空关键词就恢复完整列表，不会改变已经选好的筛选条件。',
        target: '.requirement-hall__search',
        placement: 'bottom',
      },
      {
        title: '需求卡片',
        body: '每张卡片展示需求标题、预算、担保方式和当前状态。点卡片可以查看详情，详情里能看到完整的说明和验收要求。',
        target: '[data-tour="requirement-hall:3"]',
        placement: 'top',
      },
      {
        title: '发布需求',
        body: '点发布需求可以提交一条新的需求。填写标题、说明、预算和验收标准后提交审核，审核通过就会出现在大厅里。',
        target: '[data-tour="requirement-hall:4"]',
        placement: 'bottom',
      },
      {
        title: '大厅概览',
        body: '右侧概览统计大厅里的需求总量和交付情况，下方的最近交付可以了解平台近期的成交节奏，帮助你判断接单时机。',
        target: '[data-tour="requirement-hall:5"]',
        placement: 'left',
      },
    ],
  },
  'my-requirements': {
    title: '我的需求导览',
    steps: [
      {
        title: '状态筛选',
        body: '顶部读数条同时也是筛选入口，点全部、审核中、开发中或已完成，可以只看对应阶段的需求，数量和列表会一起收窄。',
        target: '[data-tour="my-requirements:1"]',
        placement: 'bottom',
      },
      {
        title: '列表与空态',
        body: '需求列表按状态和关键词过滤。没有符合条件的需求时会出现空态提示，可以清除筛选重新查看，列表会按当前条件即时更新。',
        target: '[data-tour="my-requirements:2"]',
        placement: 'top',
      },
      {
        title: '操作按钮',
        body: '工具栏右侧的发布新需求用来提交新的需求单，左边的搜索框可以按标题、编号或发布人查找已有需求，筛完还能一键恢复。',
        target: '[data-tour="my-requirements:3"]',
        placement: 'bottom',
      },
      {
        title: '详情入口',
        body: '点列表里的任意一条需求可以打开沟通记录和详情，支付、合同、验收等操作也会随着进度出现在这一行下面，按状态提示处理即可。',
        target: '.requirement-list',
        placement: 'top',
      },
    ],
  },
  signatures: {
    title: '我的合同导览',
    steps: [
      {
        title: '状态筛选',
        body: '顶部读数条统计合同总数、待我签署、等待他方和已完成的数量。下方的下拉框可以只看某一种签署状态，搜索框还能按名称和编号找合同。',
        target: '[data-tour="signatures:1"]',
        placement: 'bottom',
      },
      {
        title: '合同列表',
        body: '合同列表按签署状态和关键词过滤。没有合同时会提示暂无签署记录，加载失败可以直接重新加载，筛完也可以清除筛选恢复全部。',
        target: '[data-tour="signatures:2"]',
        placement: 'top',
      },
      {
        title: '签署操作',
        body: '每份合同的右侧显示当前签署状态。待我签署的合同点进去可以查看正文并完成签署，等待他方时只需等待对方处理。',
        target: '.signature-list',
        placement: 'top',
      },
      {
        title: '实名提示',
        body: '签署合同前需要完成实名认证。未实名时进入本页会被引导去认证，认证通过后合同才会生效，之后回到本页即可继续签署。',
        target: '[data-tour="signatures:4"]',
        placement: 'bottom',
      },
    ],
  },
  account: {
    title: '账户与安全导览',
    steps: [
      {
        title: '个人资料',
        body: '顶部卡片显示当前账号的实名状态和渠道会员状态。状态变化后会实时更新，审核中可以用继续认证回到认证流程。',
        target: '[data-tour="account:1"]',
        placement: 'bottom',
      },
      {
        title: '账号与安全',
        body: '账号与安全里可以修改邮箱、密码和用户名，也可以开启两步验证、绑定微信和第三方账号，入口上的状态会显示当前是否已经绑定。',
        target: '[data-tour="account:2"]',
        placement: 'bottom',
      },
      {
        title: '实名认证',
        body: '认证管理里发起实名认证，个人和企业走不同的材料。审核通过后才能签署合同和绑定结算账户，审核中可以回到这里继续认证。',
        target: '[data-tour="account:3"]',
        placement: 'top',
      },
      {
        title: '收款与结算',
        body: '收款与结算用于绑定和查看结算账户。资料不齐时会列出缺少的项，绑定完成后的尾号会显示在入口上，审核进度也会同步显示。',
        target: '[data-tour="account:4"]',
        placement: 'top',
      },
    ],
  },
}

export function getTour(key: string): TourDefinition | undefined {
  return TOURS[key]
}
