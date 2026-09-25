import type { DevOrderDepositStatus } from '@/api/devOrderDeposit'
import type { RequirementItem } from '@/api/devRequirements'
import type { DevWalletOverview } from '@/api/devWallet'
import type { McResourcePayload } from '@/api/mcResources'

/**
 * 开发者工作台总览的演示数据，用于在没有真实接单记录时预览布局。
 *
 * 只有 `pnpm dev`（mode = development）下才可能生效，且需要二选一打开：
 * `.env.local` 里写 `VITE_DEV_HOME_MOCK=true`，或地址上带 `?mock=1`（`routeMock`）。
 * `pnpm build` 走 production、单测走 test，两个模式都拿不到这份数据，
 * 所以演示数字不会进线上包，也不会影响现有单测的断言。
 */
export function devHomeMockEnabled(routeMock = false): boolean {
  if (import.meta.env.MODE !== 'development') {
    return false
  }

  return import.meta.env.VITE_DEV_HOME_MOCK === 'true' || routeMock
}

/** 后端时间口径是本地时间的「YYYY-MM-DD HH:mm:ss」，这里从当前时间往前推，保证演示数据不会过期。 */
function daysAgo(days: number, hour: number, minute: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, minute, 0, 0)

  const pad = (value: number) => String(value).padStart(2, '0')

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:00`,
  ].join('T')
}

const DEMO_CREATOR = 'client_flow_03562487'

/** 资源列表只有标题会渲染进最近交付，其余字段按 `McResourcePayload` 补齐默认值。 */
function demoResource(id: number, title: string): McResourcePayload {
  return {
    id,
    creator: 'dev_flow_03562487',
    ownership_type: 'individual',
    team_id: null,
    requirement_id: null,
    platform: '自研工具',
    title,
    author: '柒参信息演示账号',
    description: `演示数据：${title}`,
    tag_selections: [],
    file_name: `${title}.zip`,
    source_url: '',
    cover_url: null,
    docs_url: null,
    visibility: 'published',
    release_note: null,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    created_at: daysAgo(30, 9, 0),
    updated_at: daysAgo(2, 15, 20),
  }
}

export const DEMO_DEV_HOME_RESOURCES: McResourcePayload[] = [
  demoResource(9001, '跨境电商订单同步插件'),
  demoResource(9002, '企业微信审批流连接器'),
  demoResource(9003, '小程序订单提醒机器人'),
]

/** 5 条已接取需求单：3 条绑定了资源（因此会进「最近交付」），2 条未绑定。 */
export const DEMO_DEV_HOME_REQUIREMENTS: RequirementItem[] = [
  {
    id: 501,
    requirement_id: 'REQ-20260907-0051',
    bound_resource_id: 9001,
    bound_resource_version_count: 3,
    resource_visibility: 'public',
    created_time: daysAgo(12, 10, 0),
    creator: DEMO_CREATOR,
    title: '跨境电商订单同步插件定制',
    budget: 12800,
    description: '演示数据：多平台订单聚合与库存同步。',
    acceptance_criteria: '演示数据：三平台订单 5 分钟内同步完成。',
    payment_mode: 'platform_guarantee',
    status: 'in_development',
    updated_at: daysAgo(0, 9, 20),
    pending_unbind_request: null,
  },
  {
    id: 502,
    requirement_id: 'REQ-20260828-0042',
    bound_resource_id: 9002,
    bound_resource_version_count: 2,
    resource_visibility: 'public',
    created_time: daysAgo(16, 14, 30),
    creator: DEMO_CREATOR,
    title: '企业微信审批流连接器开发',
    budget: 8600,
    description: '演示数据：对接企业微信审批回调。',
    acceptance_criteria: '演示数据：审批通过后自动触发下游任务。',
    payment_mode: 'platform_guarantee',
    status: 'pending_final',
    updated_at: daysAgo(1, 17, 45),
    pending_unbind_request: null,
  },
  {
    id: 503,
    requirement_id: 'REQ-20260826-0038',
    bound_resource_id: null,
    bound_resource_version_count: null,
    resource_visibility: null,
    created_time: daysAgo(18, 9, 10),
    creator: DEMO_CREATOR,
    title: '经营数据看板前端开发',
    budget: 24000,
    description: '演示数据：尚未绑定资源项目。',
    acceptance_criteria: '演示数据：看板支持按门店筛选并导出。',
    payment_mode: 'platform_guarantee',
    status: 'deposit_paid',
    updated_at: daysAgo(3, 11, 5),
    pending_unbind_request: null,
  },
  {
    id: 504,
    requirement_id: 'REQ-20260814-0029',
    bound_resource_id: 9003,
    bound_resource_version_count: 5,
    resource_visibility: 'public',
    created_time: daysAgo(34, 16, 0),
    creator: DEMO_CREATOR,
    title: '小程序订单提醒机器人',
    budget: 4200,
    description: '演示数据：订单状态变更推送到企业微信。',
    acceptance_criteria: '演示数据：新订单 1 分钟内送达提醒。',
    payment_mode: 'platform_guarantee',
    status: 'completed',
    updated_at: daysAgo(6, 16, 30),
    pending_unbind_request: null,
  },
  {
    id: 505,
    requirement_id: 'REQ-20260805-0017',
    bound_resource_id: null,
    bound_resource_version_count: null,
    resource_visibility: null,
    created_time: daysAgo(42, 10, 20),
    creator: DEMO_CREATOR,
    title: '私有化部署脚本与交付文档整理',
    budget: 3000,
    description: '演示数据：无担保模式，只做部署与文档。',
    acceptance_criteria: '演示数据：客户内网一键部署成功。',
    payment_mode: 'self_managed',
    status: 'completed',
    updated_at: daysAgo(9, 14, 10),
    pending_unbind_request: null,
  },
]

/**
 * 收益只来自已结单的分账，所以「最近收入」里不放进行中的单子。
 * 第三条对应一笔不在上方 5 条之内的历史接单（列表只展示最近 5 条）。
 */
export const DEMO_DEV_HOME_WALLET: DevWalletOverview = {
  total_income_cny: 38600,
  today_income_cny: 1280,
  today_income_change_rate: 12.5,
  total_completed_orders: 8,
  active_requirement_count: 3,
  withdrawable_balance_cny: 18420.5,
  pending_withdraw_cny: 3200,
  paid_withdraw_cny: 16800,
  recent_income: [
    {
      payment_id: 'PAY-DEMO-0006',
      requirement_id: 'REQ-20260814-0029',
      title: '小程序订单提醒机器人',
      customer: DEMO_CREATOR,
      amount_cny: 3780,
      paid_at: daysAgo(6, 16, 35),
      requirement_status: 'completed',
    },
    {
      payment_id: 'PAY-DEMO-0005',
      requirement_id: 'REQ-20260805-0017',
      title: '私有化部署脚本与交付文档整理',
      customer: DEMO_CREATOR,
      amount_cny: 2700,
      paid_at: daysAgo(9, 14, 25),
      requirement_status: 'completed',
    },
    {
      payment_id: 'PAY-DEMO-0003',
      requirement_id: 'REQ-20260715-0003',
      title: '存量订单数据清洗脚本',
      customer: DEMO_CREATOR,
      amount_cny: 6400,
      paid_at: daysAgo(21, 11, 0),
      requirement_status: 'completed',
    },
  ],
}

/**
 * 近 7 天到账金额（最早 → 今天），只给总览页的收入曲线用。
 *
 * 后端没有时间序列接口，真实模式只能把 `recent_income`（接口最多返回 100 笔）
 * 按到账日归集；演示模式给一条完整序列，这样曲线的样子在预览时看得出来。
 * 序列刻意与 `DEMO_DEV_HOME_WALLET` 自洽：最后一位等于 `today_income_cny`，
 * 倒数第二位等于由「今日收入 + 较昨日涨幅」倒推出来的昨日收入，
 * 否则同一屏上「今日收入 / 较昨日」会和曲线互相打架。
 */
export const DEMO_DEV_HOME_DAILY_INCOME: number[] = [420, 680, 960, 1320, 540, 1138, 1280]

export const DEMO_DEV_HOME_DEPOSIT: DevOrderDepositStatus = {
  username: 'dev_flow_03562487',
  role: 'dev',
  has_paid_deposit: true,
  can_bind_requirement: true,
  total_paid_cny: 5000,
  frozen_cny: 1200,
  available_cny: 3800,
  pending_refund_cny: 0,
  pending_withdraw_cny: 0,
  paid_withdraw_cny: 0,
  latest_order: null,
}
