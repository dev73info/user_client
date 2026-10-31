/**
 * 开发者实时看板（`GET /api/requirement/dev/dashboard`）的假快照。
 *
 * 这条接口原来完全没实现，兜底回的是 `[]`，而 `DevRealtimeDashboardView` 直接读
 * `snapshot.wallet.today_income_fen`——空数组上没有 `wallet`，`onMounted` 里那一次 fetch
 * 就抛成未捕获的 promise rejection，看板只剩一片空白。
 *
 * 读数全部由同一份内存数据算出来，不另写一套常量：钱包取 `devWallet`、漏斗从 `requirements`
 * 的真实状态数出来、资源与交付取 `mcResources` / `mcResourceVersions`，
 * 所以看板与钱包页、我的接单页的数字始终对得上。
 */
import type { MockRoute } from '../../router'

import { devDailyIncome, devWallet } from '../../db/devWallet'
import {
  pendingPrepaidWithdrawalFen,
  prepaidAccount,
  withdrawablePrepaidFen,
} from '../../db/prepaid'
import { requirements } from '../../db/requirements'
import { versionsOf, mcResources } from '../../db/resources'
import { DEV_USERNAME, datetime } from '../../db/shared'
import { jsonResponse } from '../../response'

const fen = (cny: number): number => Math.round(cny * 100)

/** 按需求状态数漏斗：状态口径取自 `RequirementStatus`，一个状态只落一格。 */
function countStatus(status: string): number {
  return requirements.filter((item) => item.developer === DEV_USERNAME && item.status === status)
    .length
}

/** 近 7 天每日收益（`devDailyIncome` 是元，契约要分）。 */
function dailyIncome() {
  const today = new Date()

  return devDailyIncome.map((amount, index) => {
    const day = new Date(today)
    day.setDate(today.getDate() - (devDailyIncome.length - 1 - index))

    return {
      date: day.toISOString().slice(0, 10),
      amount_fen: fen(amount),
    }
  })
}

/** 进行中的项目：已接单且未到终态的那些。 */
function activeProjects() {
  return requirements
    .filter(
      (item) =>
        item.developer === DEV_USERNAME &&
        item.status !== 'completed' &&
        item.status !== 'cancelled',
    )
    .map((item) => ({
      requirement_id: item.requirement_id,
      title: item.title,
      status: item.status,
      payment_mode: item.payment_mode,
      budget_fen: fen(item.budget ?? 0),
      updated_at: item.updated_at,
      // 契约要求这四个布尔都在；演示数据没有逾期，也不编造逾期，
      // 页面据此显示的红条才是真的。
      deadlines: {
        delivery_overdue: false,
        acceptance_overdue: false,
        remediation_overdue: false,
        final_pay_overdue: false,
        delivery_due_at: null,
        acceptance_due_at: null,
        remediation_due_at: null,
        final_pay_due_at: null,
        developer_bound_at: null,
        delivered_at: null,
        accepted_at: null,
      },
    }))
}

/** 最近交付：有绑定资源且已过定金的需求，版本数取资源的真实版本条数。 */
function deliveries() {
  return requirements
    .filter((item) => item.developer === DEV_USERNAME && item.bound_resource_id != null)
    .map((item) => {
      const resource = mcResources.find((entry) => entry.id === item.bound_resource_id)
      const versions = item.bound_resource_id == null ? [] : versionsOf(item.bound_resource_id)

      return {
        requirement_id: item.requirement_id,
        requirement_title: item.title,
        resource_id: item.bound_resource_id ?? 0,
        resource_title: resource?.title ?? '未命名资源',
        version_count: versions.length,
        amount_fen: fen(item.budget ?? 0),
        last_delivered_at: versions[versions.length - 1]?.created_at ?? null,
      }
    })
}

/** 实时动态：近几次到账与交付，按时间倒序取最新几条。 */
function feed() {
  const income = devDailyIncome.slice(-3).map((amount, index) => ({
    kind: 'income' as const,
    title: `接单收入到账 ¥${amount.toFixed(2)}`,
    amount_fen: fen(amount),
    requirement_id: null,
    at: datetime(-(2 - index), 16, 40),
  }))

  const delivery = deliveries()
    .slice(0, 3)
    .map((item) => ({
      kind: 'delivery' as const,
      title: `提交交付：${item.resource_title}`,
      amount_fen: null,
      requirement_id: item.requirement_id,
      at: item.last_delivered_at ?? datetime(-1, 10, 0),
    }))

  return [...income, ...delivery].sort((left, right) => (left.at < right.at ? 1 : -1))
}

export const dashboardRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/requirement/dev/dashboard',
    note: '开发者实时看板快照（契约 `DevDashboardSnapshotResponse`，金额一律分）',
    handler: () =>
      jsonResponse({
        wallet: {
          today_income_fen: fen(devWallet.today_income_cny),
          today_income_change_rate: devWallet.today_income_change_rate,
          total_income_fen: fen(devWallet.total_income_cny),
          withdrawable_balance_fen: fen(devWallet.withdrawable_balance_cny),
          pending_withdraw_fen: fen(devWallet.pending_withdraw_cny),
          paid_withdraw_fen: fen(devWallet.paid_withdraw_cny),
          // 冻结的是被项目押住的那部分，与预付账户的 frozen 同一个数
          frozen_deposit_fen: prepaidAccount.frozen_fen,
          total_completed_orders: devWallet.total_completed_orders,
          active_requirement_count: devWallet.active_requirement_count,
        },
        deposit: {
          available_fen: prepaidAccount.balance_fen,
          withdrawable_fen: withdrawablePrepaidFen(),
          frozen_fen: prepaidAccount.frozen_fen,
          total_paid_fen: prepaidAccount.total_recharged_fen,
          total_withdrawn_fen: prepaidAccount.total_withdrawn_fen,
          pending_refund_fen: prepaidAccount.refunding_fen,
          pending_withdraw_fen: pendingPrepaidWithdrawalFen(),
          has_paid_deposit: prepaidAccount.total_recharged_fen > 0,
          can_bind_requirement: prepaidAccount.balance_fen > 0,
        },
        income_daily: dailyIncome(),
        month_income_fen: fen(devWallet.total_income_cny),
        pipeline: {
          pending_deposit: countStatus('pending_deposit'),
          deposit_paid: countStatus('deposit_paid'),
          in_development: countStatus('in_development'),
          pending_final: countStatus('pending_final'),
          pending_settlement: countStatus('pending_settlement'),
          completed_this_month: countStatus('completed'),
        },
        projects: activeProjects(),
        deliveries: deliveries(),
        resources: {
          resource_count: mcResources.length,
          total_downloads: 0,
          total_views: 0,
        },
        feed: feed(),
        generated_at: datetime(0, new Date().getHours(), new Date().getMinutes()),
      }),
  },
]
