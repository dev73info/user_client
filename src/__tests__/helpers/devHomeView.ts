import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { vi } from 'vitest'
import DevHomeView from '@/views/DevHomeView.vue'

/**
 * 开发总览（DevHomeView）的共享夹具。
 *
 * 首页只读三个契约端点（钱包概览 / 我的需求 / 我的资源），所以夹具也只有三份取数
 * （外加提现弹窗自己要用的两条）。`vi.mock` 是文件级注册，每份 spec 各自 `vi.hoisted`
 * 建一份 mocks 再登记；这里只放「跟具体 mock 实例无关」的东西：路由名单、数据夹具、挂载函数，
 * 以及按 mock 实例把默认返回值铺好的 `primeDevHomeMocks`。
 */
export const ROUTE_NAMES = [
  'dev-home',
  'dev-wallet',
  'dev-my-requirements',
  'dev-requirement-hall',
  'dev-resource-list',
]

export type DevHomeMocks = {
  wallet: ReturnType<typeof vi.fn>
  withdrawalBalance: ReturnType<typeof vi.fn>
  withdrawalSetting: ReturnType<typeof vi.fn>
  withdrawalConfig: ReturnType<typeof vi.fn>
  createWithdrawal: ReturnType<typeof vi.fn>
  requirements: ReturnType<typeof vi.fn>
  resources: ReturnType<typeof vi.fn>
}

/** 钱包概览：字段与契约 `DevWalletResponse` 逐项对应（金额都是**元**）。 */
export const baseWallet = {
  total_income_cny: 1200.5,
  today_income_cny: 200,
  today_income_change_rate: 12.5,
  total_completed_orders: 3,
  active_requirement_count: 2,
  withdrawable_balance_cny: 800.25,
  pending_withdraw_cny: 100,
  paid_withdraw_cny: 300,
  recent_income: [
    {
      payment_id: 'p1',
      requirement_id: 'REQ-1',
      title: '数据清洗插件定制',
      customer: 'alice',
      gross_amount_cny: 620,
      refund_developer_cny: 20,
      amount_cny: 600,
      paid_at: '2026-09-10 12:00:00',
      requirement_status: 'completed',
      requirement_refund_cny: 0,
      refunded_at: null,
    },
  ],
}

/** 一条接单：只带契约字段（`RequirementResponse`），**没有** `updated_at` 这种非契约列。 */
export function requirementWithStatus(
  id: number,
  status: string,
  patch: Record<string, unknown> = {},
) {
  return {
    id,
    requirement_id: `REQ-${id}`,
    created_time: '2026-09-01 09:00:00',
    creator: 'alice',
    title: `接单 ${id}`,
    budget: 1000,
    payment_mode: 'platform_guarantee',
    status,
    developer: 'dev_flow',
    developer_bound_at: '2026-09-12 10:00:00',
    delivered_at: null,
    accepted_at: null,
    subscribe_status_change: false,
    ...patch,
  }
}

/** 一份资源：字段命名与契约 `ResourceResponse` 一致。 */
export function resourceFixture(id: number, title: string, visibility = 'published') {
  return {
    id,
    title,
    platform: 'python',
    visibility,
    created_at: '2026-09-01 09:00:00',
    updated_at: '2026-09-12 10:00:00',
  }
}

/** beforeEach 里铺默认返回值的那一段；`vi.clearAllMocks()` 与 pinia / auth 由各 spec 自己开头。 */
export function primeDevHomeMocks(mocks: DevHomeMocks) {
  mocks.wallet.mockResolvedValue(baseWallet)
  // 提现弹窗打开时自己拉额度、门禁与单笔限额：三条都成功才会开窗
  mocks.withdrawalBalance.mockResolvedValue({
    income_fen: 120050,
    withdrawn_fen: 40000,
    withdrawable_fen: 80025,
  })
  mocks.withdrawalConfig.mockResolvedValue({
    min_fen: 1,
    max_fen: 100000000,
    auto_payout_max_fen: 1000000,
    reconcile_on_read: true,
    reconcile_cooldown_secs: 60,
  })
  mocks.withdrawalSetting.mockResolvedValue({
    auto_withdraw_enabled: false,
    payout_channel_ready: true,
    payout_schedule_note: 'T+1 到账，免手续费',
  })
  mocks.requirements.mockResolvedValue([
    requirementWithStatus(1, 'in_development', { budget: 3000 }),
    requirementWithStatus(2, 'completed', { payment_mode: 'self_managed', budget: 500 }),
  ])
  mocks.resources.mockResolvedValue([
    resourceFixture(11, '数据清洗插件'),
    resourceFixture(12, '无人接单的插件', 'draft'),
  ])
}

export async function renderDevHome(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ROUTE_NAMES.map((name) => ({
      name,
      path: `/${name}`,
      component: { template: '<div />' },
    })),
  })
  await router.push({ name: 'dev-home', query })
  const wrapper = mount(DevHomeView, { global: { plugins: [router], stubs: { teleport: true } } })
  await flushPromises()
  return { wrapper, router }
}

export type Wrapper = Awaited<ReturnType<typeof renderDevHome>>['wrapper']

/** 顶部读数条里的三格读数：读数是「标签 + 数字」，取整格的 text 就够断言。
    末格是刷新按钮所在的 __action 槽，不是读数，要排除掉。 */
export const statCards = (wrapper: Wrapper) =>
  wrapper.findAll('.dev-meta-strip__item:not(.dev-meta-strip__action)').map((item) => item.text())

/** 合并后的资金卡里两个提现口径的读数（待提现 / 已提现）。 */
export const facts = (wrapper: Wrapper) =>
  wrapper.findAll('.dev-home__fact').map((fact) => fact.text())

/** 数某个口径在文本里出现几次：资金卡要求同一笔钱只报一次。 */
export const occurrences = (text: string, keyword: string) => text.split(keyword).length - 1

export type { VueWrapper }
