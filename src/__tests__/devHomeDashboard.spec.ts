import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Ref } from 'vue'

import { useDevHomeDashboard } from '@/composables/useDevHomeDashboard'
import { useAuthStore } from '@/stores/auth'

/**
 * 总览页数据层的单测。
 *
 * 页面级用例在 `devHomeView-*.spec.ts`，走的是渲染后的文本；它们看不见「调了哪几个接口、
 * 失败时状态怎么变、卸载后还写不写」。这里用小宿主组件拿住 composable 的返回值，钉住这几件事：
 * 三份读一次取齐、三档读数按 status 现算、失败时置 loadError 而不是留一个空数组、
 * 卸载后不再写。
 */

const mocks = vi.hoisted(() => ({
  wallet: vi.fn(),
  requirements: vi.fn(),
  resources: vi.fn(),
}))

vi.mock('@/api/devWallet', () => ({ getDevWalletOverview: mocks.wallet }))
vi.mock('@/api/devRequirements', () => ({ listMyRequirements: mocks.requirements }))
vi.mock('@/api/mcResources', () => ({ listTeamResources: mocks.resources }))

/** 组件实例上的 `ref` 会被代理自动解包：类型上跟着解一层，运行时的读数才对得上。 */
type Unwrapped<T> = { [K in keyof T]: T[K] extends Ref<infer V> ? V : T[K] }
type Dashboard = Unwrapped<ReturnType<typeof useDevHomeDashboard>>

const walletOf = (todayIncome: number) => ({
  total_income_cny: 1200.5,
  today_income_cny: todayIncome,
  today_income_change_rate: 0,
  total_completed_orders: 3,
  active_requirement_count: 2,
  withdrawable_balance_cny: 800.25,
  pending_withdraw_cny: 100,
  paid_withdraw_cny: 300,
  recent_income: [],
})

function requirement(status: string, id: number) {
  return {
    id,
    requirement_id: `REQ-${id}`,
    created_time: '2026-09-01 09:00:00',
    creator: 'alice',
    title: `接单 ${id}`,
    payment_mode: 'platform_guarantee',
    status,
    developer_bound_at: '2026-09-12 10:00:00',
  }
}

/** 卸载标记与提示文案都在视图那一份：这里照视图的写法给，翻标记就能验「卸载后不再写」。 */
let isMountedFlag = true
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

  mocks.wallet.mockResolvedValue(walletOf(200))
  mocks.requirements.mockResolvedValue([])
  mocks.resources.mockResolvedValue([])

  isMountedFlag = true
  errors = []
  api = await mountDashboard()
})

describe('总览页数据层', () => {
  it('一次取齐三个契约端点，并把三档读数按 status 现算', async () => {
    mocks.requirements.mockResolvedValue([
      requirement('pending_deposit', 1),
      requirement('in_development', 2),
      requirement('in_development', 3),
      requirement('pending_final', 4),
      requirement('completed', 5),
      requirement('cancelled', 6),
    ])

    await api.loadPage()

    expect(mocks.wallet).toHaveBeenCalledWith('test-token')
    expect(mocks.requirements).toHaveBeenCalledWith('test-token')
    expect(mocks.resources).toHaveBeenCalledWith('test-token')
    expect(api.loaded).toBe(true)

    // 进行中 = 在途五档（待付定金 / 已付定金 / 开发中 / 待付尾款 / 待分账）
    expect(api.activeProjectCount).toBe(4)
    // 待交付 = 开发中：已进「待付尾款」的单交付已经落地
    expect(api.pendingDeliveryCount).toBe(2)
    expect(api.completedProjectCount).toBe(1)
    expect(api.overview?.withdrawable_balance_cny).toBe(800.25)
  })

  it('接口失败时置 loadError 并回落到「没读到」，不把失败留成空数组', async () => {
    mocks.requirements.mockRejectedValue(new Error('需求服务暂时不可用'))

    await api.loadPage()
    await flushPromises()

    expect(api.loadError).toBe('需求服务暂时不可用')
    expect(api.loaded).toBe(false)
    expect(errors).toEqual(['需求服务暂时不可用'])
  })

  it('后端给的是英文裸串时回落到中文兜底文案', async () => {
    mocks.wallet.mockRejectedValue(new Error('Internal Server Error'))

    await api.loadPage()

    expect(api.loadError).toBe('加载工作台总览失败')
    expect(errors).toEqual(['加载工作台总览失败'])
  })

  it('登录失效时不发请求，只走视图给的出口', async () => {
    const auth = useAuthStore()
    auth.token = ''

    await api.loadPage()

    expect(mocks.wallet).not.toHaveBeenCalled()
    expect(errors).toEqual(['登录状态已失效，请重新登录'])
  })

  it('卸载后不再写状态：慢响应回来也丢掉', async () => {
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
    expect(api.loaded).toBe(false)
  })

  it('提现成功后只回刷钱包读数，失败也要报出来', async () => {
    await api.loadPage()
    mocks.wallet.mockResolvedValue(walletOf(880))
    await api.reloadWallet()
    expect(api.overview?.today_income_cny).toBe(880)

    mocks.wallet.mockRejectedValue(new Error('刷新失败'))
    await api.reloadWallet()
    expect(errors).toEqual(['刷新失败'])
  })
})
