import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Ref } from 'vue'

import type { DevDashboardSnapshot } from '@/api/devDashboard'
import { AUTO_REFRESH_INTERVAL_MS, useDevHomeDashboard } from '@/composables/useDevHomeDashboard'
import { useAuthStore } from '@/stores/auth'

/**
 * 总览页数据层的单测（R047 把取数编排从视图抽出来时补的）。
 *
 * 页面级用例在 `devHomeView.spec.ts`（12 条断言一行未改），但那 12 条走不到全屏看板那条路：
 * 快照经 WebSocket 进来后的回写、`generated_at` 防旧帧覆盖、5 分钟轮询的可见性与重入锁、
 * 卸载后不再回写，都只在数据层里看得见。这里用小宿主组件拿住 composable 的返回值，钉住这四件。
 */

const mocks = vi.hoisted(() => ({
  wallet: vi.fn(),
  deposit: vi.fn(),
  requirements: vi.fn(),
  resources: vi.fn(),
  dashboard: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}))

/** 假 socket：只留「拿到 onSnapshot 回调」与连 / 断两条，真连接的行为见 devDashboardSocket.spec.ts。 */
const socket = vi.hoisted(() => ({
  onSnapshot: null as null | ((snapshot: DevDashboardSnapshot) => void),
}))

vi.mock('@/api/devWallet', () => ({ getDevWalletOverview: mocks.wallet }))
vi.mock('@/api/devOrderDeposit', () => ({ getDevOrderDepositStatus: mocks.deposit }))
vi.mock('@/api/devRequirements', () => ({ listMyRequirements: mocks.requirements }))
vi.mock('@/api/mcResources', () => ({ listMcResources: mocks.resources }))
vi.mock('@/api/devDashboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/devDashboard')>()),
  getDevDashboard: mocks.dashboard,
}))
vi.mock('@/composables/useDevDashboardSocket', async () => {
  const { ref } = await import('vue')
  return {
    useDevDashboardSocket: (options: { onSnapshot?: (snapshot: DevDashboardSnapshot) => void }) => {
      socket.onSnapshot = options.onSnapshot ?? null
      return {
        status: ref('closed'),
        connect: mocks.connect,
        disconnect: mocks.disconnect,
      }
    },
  }
})

/** 组件实例上的 `ref` 会被代理自动解包：类型上跟着解一层，运行时的读数才对得上。 */
type Unwrapped<T> = { [K in keyof T]: T[K] extends Ref<infer V> ? V : T[K] }
type Dashboard = Unwrapped<ReturnType<typeof useDevHomeDashboard>>

/** 演示用的 wallet：只有一处到账回执，用来验快照回写时它不会被清空。 */
const walletOf = (totalIncome: number) => ({
  total_income_cny: totalIncome,
  today_income_cny: 200,
  pending_withdraw_cny: 100,
  paid_withdraw_cny: 300,
  withdrawable_balance_cny: 800.25,
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
})

/** 一份最小可用的看板快照：只有 `generated_at` 与几个读数随用例变，其余给空壳。 */
function snapshot(
  generatedAt: string,
  patch: { totalIncome?: number; canBind?: boolean; available?: number } = {},
): DevDashboardSnapshot {
  return {
    wallet: {
      today_income_cny: 0,
      today_income_change_rate: 0,
      total_income_cny: patch.totalIncome ?? 0,
      withdrawable_balance_cny: 0,
      pending_withdraw_cny: 0,
      paid_withdraw_cny: 0,
      total_completed_orders: 0,
      active_requirement_count: 0,
    },
    deposit: {
      available_cny: patch.available ?? 0,
      frozen_cny: 0,
      total_paid_cny: 0,
      pending_refund_cny: 0,
      pending_withdraw_cny: 0,
      has_paid_deposit: true,
      can_bind_requirement: patch.canBind ?? true,
    },
    income_daily: [],
    month_income_cny: 0,
    pipeline: {
      pending_deposit: 0,
      deposit_paid: 0,
      in_development: 0,
      pending_final: 0,
      pending_settlement: 0,
      completed_this_month: 0,
    },
    projects: [],
    deliveries: [],
    resources: { resource_count: 0, total_downloads: 0, total_views: 0 },
    feed: [],
    generated_at: generatedAt,
  }
}

/** 卸载标记与提示文案都在视图那一份：这里照视图的写法给，翻标记就能验「卸载后不再写」。 */
let isMountedFlag = true
let appliedCount = 0
let errors: string[] = []
let api: Dashboard

async function mountDashboard(): Promise<Dashboard> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ name: 'dev-home', path: '/dev-home', component: { template: '<div />' } }],
  })
  await router.push({ name: 'dev-home' })

  const Host = defineComponent({
    setup(_, { expose }) {
      expose(
        useDevHomeDashboard({
          isMounted: () => isMountedFlag,
          texts: { loginExpired: '登录状态已失效，请重新登录', loadFailed: '加载工作台总览失败' },
          onError: (message) => {
            errors.push(message)
          },
          onDashboardApplied: () => {
            appliedCount += 1
          },
        }),
      )
      return () => h('div')
    },
  })

  return mount(Host, { global: { plugins: [router] } }).vm as unknown as Dashboard
}

beforeEach(async () => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'dev_flow'
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})

  mocks.wallet.mockResolvedValue(walletOf(1200.5))
  mocks.deposit.mockResolvedValue({ username: 'dev_flow', role: 'dev', can_bind_requirement: true })
  mocks.requirements.mockResolvedValue([])
  mocks.resources.mockResolvedValue([])
  mocks.dashboard.mockResolvedValue(snapshot('2026-10-22 21:00:00'))

  isMountedFlag = true
  appliedCount = 0
  errors = []
  api = await mountDashboard()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('总览页数据层', () => {
  it('快照落库后回写钱包与保证金：到账明细沿用接口那份，保证金按快照覆盖', async () => {
    await api.loadPage()
    expect(api.overview?.total_income_cny).toBe(1200.5)

    socket.onSnapshot?.(snapshot('2026-10-22 21:00:00', { available: 420.5, canBind: false }))

    // 快照里不带到账明细：那一份仍来自 wallet 接口，曲线不至于被清空
    expect(api.overview?.recent_income).toHaveLength(1)
    // 保证金按快照覆盖；账号字段快照没有，用登录态补
    expect(api.deposit?.available_cny).toBe(420.5)
    expect(api.deposit?.can_bind_requirement).toBe(false)
    expect(api.deposit?.username).toBe('dev_flow')
    expect(api.depositInsufficient).toBe(true)
    expect(appliedCount).toBe(1)
  })

  it('旧快照不盖新快照：generated_at 更早的一帧被丢弃，也不惊动收尾回调', () => {
    socket.onSnapshot?.(snapshot('2026-10-22 21:00:00', { totalIncome: 900 }))
    // 进全屏那一下的 HTTP 拉取（更旧的一帧）比 WebSocket 首帧晚到：不许盖回去
    socket.onSnapshot?.(snapshot('2026-10-22 20:59:59', { totalIncome: 100 }))

    expect(api.dashboard?.generated_at).toBe('2026-10-22 21:00:00')
    expect(api.overview?.total_income_cny).toBe(900)
    // 同一时间戳（心跳后的重复推送）不算旧帧，照样落库
    socket.onSnapshot?.(snapshot('2026-10-22 21:00:00'))
    expect(appliedCount).toBe(2)
  })

  it('5 分钟轮询：页签在后台不刷、前一次没回来就跳过', async () => {
    vi.useFakeTimers()
    api.startAutoRefresh()

    let visibility: DocumentVisibilityState = 'hidden'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)

    await vi.advanceTimersByTimeAsync(AUTO_REFRESH_INTERVAL_MS)
    expect(mocks.wallet).not.toHaveBeenCalled()

    visibility = 'visible'
    await vi.advanceTimersByTimeAsync(AUTO_REFRESH_INTERVAL_MS)
    expect(mocks.wallet).toHaveBeenCalledTimes(1)

    // 重入锁：上一拍还没回来，下一拍照样不叠一次请求
    mocks.wallet.mockImplementation(() => new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(AUTO_REFRESH_INTERVAL_MS)
    await vi.advanceTimersByTimeAsync(AUTO_REFRESH_INTERVAL_MS)
    expect(mocks.wallet).toHaveBeenCalledTimes(2)
  })

  it('卸载后不再写状态：慢响应回来与后来的快照都丢掉', async () => {
    let release: (value: unknown) => void = () => {}
    mocks.wallet.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )

    const pending = api.loadPage()
    isMountedFlag = false
    release(walletOf(1))
    await pending

    expect(api.overview).toBeNull()
    socket.onSnapshot?.(snapshot('2026-10-22 21:00:00'))
    expect(api.dashboard).toBeNull()
    expect(appliedCount).toBe(0)
  })

  it('进全屏先连实时看板，还没有快照时补拉一次首帧', async () => {
    await api.enterLiveBoard()
    expect(mocks.connect).toHaveBeenCalledTimes(1)
    expect(mocks.dashboard).toHaveBeenCalledWith('test-token')
    expect(api.dashboard?.generated_at).toBe('2026-10-22 21:00:00')

    // 已经有快照就不再拉：首帧只补一次
    await api.enterLiveBoard()
    expect(mocks.dashboard).toHaveBeenCalledTimes(1)

    api.disconnectLiveBoard()
    expect(mocks.disconnect).toHaveBeenCalledTimes(1)
  })

  it('登录失效与接口失败都走视图给的出口', async () => {
    const auth = useAuthStore()
    auth.token = ''

    await api.loadPage()
    expect(errors).toEqual(['登录状态已失效，请重新登录'])

    auth.token = 'test-token'
    mocks.wallet.mockRejectedValue(new Error('网关超时'))
    await api.loadPage()
    await flushPromises()
    expect(errors[1]).toBe('网关超时')
  })
})
