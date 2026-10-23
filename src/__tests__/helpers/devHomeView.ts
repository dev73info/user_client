import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { vi } from 'vitest'
import DevHomeView from '@/views/DevHomeView.vue'

/**
 * 开发总览（DevHomeView）的共享夹具。
 *
 * `vi.mock` 是文件级注册，拆分后的每份 spec 各自 `vi.hoisted` 建一份 mocks 再登记；
 * 这里只放「跟具体 mock 实例无关」的东西：路由名单、钱包与保证金夹具、挂载函数，
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
  withdrawalSetting: ReturnType<typeof vi.fn>
  createWithdrawal: ReturnType<typeof vi.fn>
  deposit: ReturnType<typeof vi.fn>
  requirements: ReturnType<typeof vi.fn>
  resources: ReturnType<typeof vi.fn>
  devAccess: ReturnType<typeof vi.fn>
  credit: ReturnType<typeof vi.fn>
}

export const baseWallet = {
  total_income_cny: 1200.5,
  today_income_cny: 200,
  today_income_change_rate: 0,
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
      amount_cny: 600,
      paid_at: '2026-09-10 12:00:00',
      requirement_status: 'completed',
    },
  ],
}

export const depositReady = {
  username: 'dev_flow',
  role: 'dev',
  has_paid_deposit: true,
  can_bind_requirement: true,
  total_paid_cny: 500,
  frozen_cny: 120,
  available_cny: 380,
  pending_refund_cny: 0,
  pending_withdraw_cny: 0,
  paid_withdraw_cny: 0,
  latest_order: null,
}

/** beforeEach 里铺默认返回值的那一段；`vi.clearAllMocks()` 与 pinia / auth 由各 spec 自己开头。 */
export function primeDevHomeMocks(mocks: DevHomeMocks) {
  mocks.wallet.mockResolvedValue(baseWallet)
  mocks.deposit.mockResolvedValue(depositReady)
  mocks.devAccess.mockResolvedValue({ developer_agreement_signed: true })
  mocks.credit.mockResolvedValue(null)
  mocks.requirements.mockResolvedValue([
    {
      id: 1,
      requirement_id: 'REQ-1',
      bound_resource_id: 11,
      bound_resource_version_count: 2,
      created_time: '2026-09-01 09:00:00',
      creator: 'alice',
      title: '数据清洗插件定制',
      budget: 3000,
      payment_mode: 'platform_guarantee',
      status: 'in_development',
      updated_at: '2026-09-12 10:00:00',
    },
    {
      id: 2,
      requirement_id: 'REQ-2',
      bound_resource_id: null,
      bound_resource_version_count: null,
      created_time: '2026-09-02 09:00:00',
      creator: 'bob',
      title: '爬虫小工具',
      budget: 500,
      payment_mode: 'self_managed',
      status: 'completed',
      updated_at: '2026-09-11 10:00:00',
    },
  ])
  mocks.resources.mockResolvedValue([
    { id: 11, title: '数据清洗插件', visibility: 'published' },
    { id: 12, title: '无人接单的插件', visibility: 'draft' },
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

/** 顶部读数条里的四格读数：读数是「标签 + 数字」，取整格的 text 就够断言。
    末格是刷新按钮所在的 __action 槽，不是读数，要排除掉。 */
export const statCards = (wrapper: Wrapper) =>
  wrapper.findAll('.dev-meta-strip__item:not(.dev-meta-strip__action)').map((item) => item.text())

/** 合并后的资金卡只剩提现口径的两个读数（待提现 / 已提现）。 */
export const facts = (wrapper: Wrapper) =>
  wrapper.findAll('.dev-home__fact').map((fact) => fact.text())

/** 数某个口径在文本里出现几次：合并后的资金卡要求同一笔钱只报一次。 */
export const occurrences = (text: string, keyword: string) => text.split(keyword).length - 1

/** 造一条只关心状态的最小接单，用来验证统计卡的分档口径。 */
export function requirementWithStatus(id: number, status: string) {
  return {
    id,
    requirement_id: `REQ-${id}`,
    bound_resource_id: null,
    bound_resource_version_count: null,
    created_time: '2026-09-01 09:00:00',
    creator: 'alice',
    title: `接单 ${id}`,
    budget: 1000,
    payment_mode: 'platform_guarantee',
    status,
    updated_at: '2026-09-12 10:00:00',
  }
}

export type { VueWrapper }
