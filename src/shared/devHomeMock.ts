import type { DevDashboardIncomeDay, DevDashboardSnapshot } from '@/api/devDashboard'
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
    price_fen: 0,
    price_points: 0,
    copyright_declared: false,
    created_at: daysAgo(30, 9, 0),
    updated_at: daysAgo(2, 15, 20),
    promo_share_bps: 0,
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
      gross_amount_cny: 3780,
      refund_developer_cny: 0,
      amount_cny: 3780,
      paid_at: daysAgo(6, 16, 35),
      requirement_status: 'completed',
      refunded_at: null,
      requirement_refund_cny: 0,
    },
    {
      payment_id: 'PAY-DEMO-0005',
      requirement_id: 'REQ-20260805-0017',
      title: '私有化部署脚本与交付文档整理',
      customer: DEMO_CREATOR,
      gross_amount_cny: 2700,
      refund_developer_cny: 0,
      amount_cny: 2700,
      paid_at: daysAgo(9, 14, 25),
      requirement_status: 'completed',
      refunded_at: null,
      requirement_refund_cny: 0,
    },
    {
      payment_id: 'PAY-DEMO-0003',
      requirement_id: 'REQ-20260715-0003',
      title: '存量订单数据清洗脚本',
      customer: DEMO_CREATOR,
      gross_amount_cny: 6400,
      refund_developer_cny: 0,
      amount_cny: 6400,
      paid_at: daysAgo(21, 11, 0),
      requirement_status: 'completed',
      refunded_at: null,
      requirement_refund_cny: 0,
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

/**
 * 近 30 天到账（最早 → 今天），只给全屏看板的 30 天曲线用。
 * 末 7 位与 `DEMO_DEV_HOME_DAILY_INCOME` 相同：退出全屏回到 7 天曲线时两条线能对上。
 */
export const DEMO_DEV_HOME_DAILY_INCOME_30: number[] = [
  0,
  260,
  0,
  1480,
  720,
  0,
  0,
  2100,
  640,
  0,
  380,
  900,
  0,
  6400,
  0,
  0,
  520,
  1260,
  0,
  0,
  2700,
  0,
  3780,
  ...DEMO_DEV_HOME_DAILY_INCOME,
]

/** 看板接口的时间口径是空格分隔的「YYYY-MM-DD HH:mm:ss」。 */
function dashboardTime(days: number, hour: number, minute: number): string {
  return daysAgo(days, hour, minute).replace('T', ' ')
}

function demoIncomeDaily(): DevDashboardIncomeDay[] {
  const pad = (value: number) => String(value).padStart(2, '0')
  const today = new Date()
  return DEMO_DEV_HOME_DAILY_INCOME_30.map((amount, index) => {
    const date = new Date(today)
    date.setDate(date.getDate() - (DEMO_DEV_HOME_DAILY_INCOME_30.length - 1 - index))
    return {
      date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      amount_cny: amount,
    }
  })
}

/** 全屏看板的演示快照：项目与交付取自上面的演示接单，漏斗读数与之自洽。 */
export function demoDevDashboard(): DevDashboardSnapshot {
  const incomeDaily = demoIncomeDaily()
  const monthPrefix = incomeDaily[incomeDaily.length - 1]?.date.slice(0, 7) ?? ''
  const resourceTitles = new Map(DEMO_DEV_HOME_RESOURCES.map((item) => [item.id, item.title]))
  const incomeByRequirement = new Map(
    DEMO_DEV_HOME_WALLET.recent_income.map((item) => [item.requirement_id, item.amount_cny]),
  )

  return {
    wallet: {
      today_income_cny: DEMO_DEV_HOME_WALLET.today_income_cny,
      today_income_change_rate: DEMO_DEV_HOME_WALLET.today_income_change_rate,
      total_income_cny: DEMO_DEV_HOME_WALLET.total_income_cny,
      withdrawable_balance_cny: DEMO_DEV_HOME_WALLET.withdrawable_balance_cny,
      pending_withdraw_cny: DEMO_DEV_HOME_WALLET.pending_withdraw_cny,
      paid_withdraw_cny: DEMO_DEV_HOME_WALLET.paid_withdraw_cny,
      total_completed_orders: DEMO_DEV_HOME_WALLET.total_completed_orders,
      active_requirement_count: DEMO_DEV_HOME_WALLET.active_requirement_count,
    },
    deposit: {
      available_cny: DEMO_DEV_HOME_DEPOSIT.available_cny,
      frozen_cny: DEMO_DEV_HOME_DEPOSIT.frozen_cny,
      total_paid_cny: DEMO_DEV_HOME_DEPOSIT.total_paid_cny,
      pending_refund_cny: DEMO_DEV_HOME_DEPOSIT.pending_refund_cny,
      pending_withdraw_cny: DEMO_DEV_HOME_DEPOSIT.pending_withdraw_cny,
      has_paid_deposit: DEMO_DEV_HOME_DEPOSIT.has_paid_deposit,
      can_bind_requirement: DEMO_DEV_HOME_DEPOSIT.can_bind_requirement,
    },
    income_daily: incomeDaily,
    month_income_cny: incomeDaily
      .filter((item) => item.date.startsWith(monthPrefix))
      .reduce((sum, item) => sum + item.amount_cny, 0),
    pipeline: {
      pending_deposit: 0,
      deposit_paid: 1,
      in_development: 1,
      pending_final: 1,
      pending_settlement: 0,
      completed_this_month: 2,
    },
    projects: DEMO_DEV_HOME_REQUIREMENTS.map((item) => ({
      requirement_id: item.requirement_id,
      title: item.title,
      status: item.status,
      payment_mode: item.payment_mode,
      budget: item.budget ?? null,
      updated_at: item.updated_at.replace('T', ' '),
    })),
    deliveries: DEMO_DEV_HOME_REQUIREMENTS.filter((item) => item.bound_resource_id != null).map(
      (item) => ({
        requirement_id: item.requirement_id,
        requirement_title: item.title,
        resource_id: item.bound_resource_id ?? 0,
        resource_title:
          resourceTitles.get(item.bound_resource_id ?? 0) ?? `资源 #${item.bound_resource_id}`,
        version_count: item.bound_resource_version_count ?? 0,
        last_delivered_at: item.updated_at.replace('T', ' '),
        amount_cny: incomeByRequirement.get(item.requirement_id) ?? null,
      }),
    ),
    resources: { resource_count: 3, total_downloads: 1286, total_views: 9412 },
    feed: [
      {
        kind: 'income',
        title: '尾款分账到账',
        amount_cny: 1280,
        requirement_id: 'REQ-20260814-0029',
        at: dashboardTime(0, 9, 42),
      },
      {
        kind: 'delivery',
        title: '交付新版本 v3',
        amount_cny: null,
        requirement_id: 'REQ-20260907-0051',
        at: dashboardTime(0, 9, 20),
      },
      {
        kind: 'status',
        title: '需求进入开发中',
        amount_cny: null,
        requirement_id: 'REQ-20260907-0051',
        at: dashboardTime(0, 8, 55),
      },
      {
        kind: 'deposit',
        title: '保证金充值到账',
        amount_cny: 1000,
        requirement_id: null,
        at: dashboardTime(1, 18, 10),
      },
      {
        kind: 'status',
        title: '需求方已验收，待付尾款',
        amount_cny: null,
        requirement_id: 'REQ-20260828-0042',
        at: dashboardTime(1, 17, 45),
      },
      {
        kind: 'withdrawal',
        title: '提现已出款',
        amount_cny: 3200,
        requirement_id: null,
        at: dashboardTime(1, 11, 30),
      },
      {
        kind: 'income',
        title: '尾款分账到账',
        amount_cny: 1138,
        requirement_id: 'REQ-20260805-0017',
        at: dashboardTime(1, 10, 5),
      },
      {
        kind: 'delivery',
        title: '交付新版本 v2',
        amount_cny: null,
        requirement_id: 'REQ-20260828-0042',
        at: dashboardTime(2, 16, 40),
      },
      {
        kind: 'status',
        title: '定金已托管，待开发',
        amount_cny: null,
        requirement_id: 'REQ-20260826-0038',
        at: dashboardTime(3, 11, 5),
      },
      {
        kind: 'withdrawal',
        title: '提现申请已提交',
        amount_cny: 3200,
        requirement_id: null,
        at: dashboardTime(3, 9, 15),
      },
    ],
    generated_at: dashboardTime(0, 9, 42),
  }
}

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
