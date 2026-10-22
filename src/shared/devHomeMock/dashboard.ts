import type { DevDashboardIncomeDay, DevDashboardSnapshot } from '@/api/devDashboard'

import {
  DEMO_DEV_HOME_DAILY_INCOME_30,
  DEMO_DEV_HOME_DEPOSIT,
  DEMO_DEV_HOME_REQUIREMENTS,
  DEMO_DEV_HOME_RESOURCES,
  DEMO_DEV_HOME_WALLET,
} from './data'
import { dashboardTime } from './time'

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
