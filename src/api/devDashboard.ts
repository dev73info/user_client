import { authHeader, requestJson } from '@/api/http'

/** 看板钱包读数：口径与 `/requirement/wallet/overview` 相同，只是不带到账明细。 */
export type DevDashboardWallet = {
  today_income_cny: number
  today_income_change_rate: number
  total_income_cny: number
  withdrawable_balance_cny: number
  pending_withdraw_cny: number
  paid_withdraw_cny: number
  total_completed_orders: number
  active_requirement_count: number
}

export type DevDashboardDeposit = {
  available_cny: number
  frozen_cny: number
  total_paid_cny: number
  pending_refund_cny: number
  pending_withdraw_cny: number
  has_paid_deposit: boolean
  can_bind_requirement: boolean
}

/** 近 30 天每日到账（毛额），从旧到新，无收入的日子补 0。 */
export type DevDashboardIncomeDay = {
  date: string
  amount_cny: number
}

/** 接单漏斗：五个在途状态各多少单，外加本月已完成。 */
export type DevDashboardPipeline = {
  pending_deposit: number
  deposit_paid: number
  in_development: number
  pending_final: number
  pending_settlement: number
  completed_this_month: number
}

export type DevDashboardProject = {
  requirement_id: string
  title: string
  status: string
  payment_mode: 'platform_guarantee' | 'self_managed'
  budget: number | null
  updated_at: string
}

export type DevDashboardDelivery = {
  requirement_id: string
  requirement_title: string
  resource_id: number
  resource_title: string
  version_count: number
  last_delivered_at: string | null
  amount_cny: number | null
}

export type DevDashboardResources = {
  resource_count: number
  total_downloads: number
  total_views: number
}

export type DevDashboardFeedKind = 'income' | 'delivery' | 'status' | 'withdrawal' | 'deposit'

export type DevDashboardFeedItem = {
  kind: DevDashboardFeedKind
  title: string
  amount_cny: number | null
  requirement_id: string | null
  at: string
}

/** 全屏看板一次要的全部数据；时间一律东八区 `YYYY-MM-DD HH:MM:SS`。 */
export type DevDashboardSnapshot = {
  wallet: DevDashboardWallet
  deposit: DevDashboardDeposit
  income_daily: DevDashboardIncomeDay[]
  month_income_cny: number
  pipeline: DevDashboardPipeline
  /** 最多 20 条：在途在前，同组按更新时间倒序。 */
  projects: DevDashboardProject[]
  /** 最多 12 条。 */
  deliveries: DevDashboardDelivery[]
  resources: DevDashboardResources
  /** 最多 20 条，新的在前。 */
  feed: DevDashboardFeedItem[]
  generated_at: string
}

/** 看板 WebSocket 的服务端消息：连上即推一份快照，数据变化去抖后再推；约 25 秒一次心跳。 */
export type DevDashboardSocketMessage =
  | { type: 'snapshot'; data: DevDashboardSnapshot }
  | { type: 'ping'; at: string }
  | { type: 'error'; message: string }

export async function getDevDashboard(token: string): Promise<DevDashboardSnapshot> {
  return requestJson<DevDashboardSnapshot>(
    '/requirement/dev/dashboard',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载实时看板失败',
  )
}

/** dev 环境经 Vite 代理转到后端；每个用户最多 3 条连接，重连前要先关掉旧连接。 */
export function devDashboardWsUrl(token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/api/requirement/dev/dashboard/ws?token=${encodeURIComponent(token)}`
}
