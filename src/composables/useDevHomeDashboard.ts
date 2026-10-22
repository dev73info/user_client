import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'

import { devDashboardWsUrl, getDevDashboard, type DevDashboardSnapshot } from '@/api/devDashboard'
import { getDevOrderDepositStatus, type DevOrderDepositStatus } from '@/api/devOrderDeposit'
import { getDevWalletOverview, type DevWalletOverview } from '@/api/devWallet'
import { listMcResources, type McResourcePayload } from '@/api/mcResources'
import { listMyRequirements, type RequirementItem } from '@/api/devRequirements'
import { useDevDashboardSocket } from '@/composables/useDevDashboardSocket'
import {
  DEMO_DEV_HOME_DEPOSIT,
  DEMO_DEV_HOME_REQUIREMENTS,
  DEMO_DEV_HOME_RESOURCES,
  DEMO_DEV_HOME_WALLET,
  demoDevDashboard,
  devHomeMockEnabled,
} from '@/shared/devHomeMock'
import { isActiveRequirement } from '@/shared/requirementStatus'
import { useAuthStore } from '@/stores/auth'

/** 后台对齐的节拍：总览上的数字不常变，5 分钟一次就够。 */

export type UseDevHomeDashboardOptions = {
  /** 卸载标记：**只有视图那一份**，这一层只读不持，卸载后不再写响应式状态。 */
  isMounted: () => boolean
  /** 两句用户可见文案留在视图（本层不引 TMessage）：登录失效与四接口失败的兜底。 */
  texts: { loginExpired: string; loadFailed: string }
  /** 出错时的提示出口；快照落库后的收尾（视图据此决定第一帧是否播入场动画）。 */
  onError: (message: string) => void
  onDashboardApplied?: () => void
}

/**
 * 开发者总览页的数据层：四份汇总的取数与轮询、全屏看板的快照（WebSocket + 进全屏那一下的
 * 首帧拉取）、快照回写钱包与保证金，以及读数条上那几个口径（三档读数 / 提现口径 / 保证金胶囊 /
 * 状态灯 / 最后更新时间）。
 *
 * 两条纪律：`isMounted` 只在视图那一份，这里只读 getter、不自己建标记；行口径（项目 / 交付 /
 * 漏斗 / 动态流 / 曲线归集）与四格统计卡仍留在视图——它们绑在全屏态上，本轮只搬数据。
 * 演示数据（`?mock=1`）也在这里分流：开着时整页不读接口，只铺一份本地数据。
 */
export function useDevHomeDashboard(options: UseDevHomeDashboardOptions) {
  const auth = useAuthStore()
  const route = useRoute()

  const loading = ref(false)
  const overview = ref<DevWalletOverview | null>(null)
  const deposit = ref<DevOrderDepositStatus | null>(null)
  const requirements = ref<RequirementItem[]>([])
  const resources = ref<McResourcePayload[]>([])
  /** 全屏看板的快照：只在全屏时经 WebSocket（或进全屏那一下的一次拉取）填充，退出全屏后保留最后一份。 */
  const dashboard = shallowRef<DevDashboardSnapshot | null>(null)

  /** 演示数据开关：开着时整页不读接口，只用于本地预览布局。 */
  const mockEnabled = devHomeMockEnabled(route.query.mock === '1')

  /** 三档读数：进行中 = 未结单（「待交付」是它的下位口径）、待交付 = 待付尾款、已完成 = 已结单。 */
  const activeProjectCount = computed(
    () => requirements.value.filter((item) => isActiveRequirement(item.status)).length,
  )
  const pendingDeliveryCount = computed(
    () => requirements.value.filter((item) => item.status === 'pending_final').length,
  )
  const completedProjectCount = computed(
    () => requirements.value.filter((item) => item.status === 'completed').length,
  )

  /** 提现口径：可提现与待提现两笔金额，各报一次就够了。 */
  const withdrawable = computed(() => overview.value?.withdrawable_balance_cny ?? 0)
  const pendingWithdraw = computed(() => overview.value?.pending_withdraw_cny ?? 0)
  const paidWithdraw = computed(() => overview.value?.paid_withdraw_cny ?? 0)
  const changeRate = computed(() => overview.value?.today_income_change_rate ?? null)

  /** 未缴保证金或可用余额不足时后端会关掉绑定开关，两种情况共用同一条提示。 */
  const depositInsufficient = computed(() =>
    deposit.value ? !deposit.value.can_bind_requirement : false,
  )

  /** 保证金状态胶囊：拿到接口数据后才出现，避免加载中把「还没读到」显示成「可接单」。 */
  const depositStatusChip = computed(() => {
    if (!deposit.value) {
      return null
    }

    return depositInsufficient.value
      ? { label: '保证金不足', className: 'dev-chip--warm' }
      : { label: '可接单', className: 'dev-chip--cyan' }
  })

  /**
   * 总览页的取数：四份汇总并发。`silent` 只给轮询用——不点亮加载态、不压暗数据区，
   * 后台对齐不该让读数条闪一下。
   */
  async function loadPage(silent = false) {
    auth.hydrate()
    const token = auth.token
    if (!token) {
      options.onError(options.texts.loginExpired)
      return
    }

    // 演示数据只铺总览页的展示层，不参与任何写操作
    if (mockEnabled) {
      overview.value = DEMO_DEV_HOME_WALLET
      deposit.value = DEMO_DEV_HOME_DEPOSIT
      requirements.value = DEMO_DEV_HOME_REQUIREMENTS
      resources.value = DEMO_DEV_HOME_RESOURCES
      return
    }

    if (!silent) {
      loading.value = true
    }
    try {
      const [wallet, depositStatus, myRequirements, resourceList] = await Promise.all([
        getDevWalletOverview(token),
        getDevOrderDepositStatus(token),
        listMyRequirements(token),
        listMcResources(token),
      ])

      // 慢响应回来时组件可能已经没了：卸载后一律不再写
      if (!options.isMounted()) {
        return
      }
      overview.value = wallet
      deposit.value = depositStatus
      requirements.value = myRequirements
      resources.value = resourceList
    } catch (error) {
      if (options.isMounted()) {
        options.onError(error instanceof Error ? error.message : options.texts.loadFailed)
      }
    } finally {
      if (!silent && options.isMounted()) {
        loading.value = false
      }
    }
  }

  /** 提现成功后的回刷：只重取钱包读数（含近 7 天曲线），项目 / 交付 / 保证金都不受提现影响。 */
  async function reloadWallet() {
    const token = auth.token
    if (!token || mockEnabled) {
      return
    }

    try {
      const wallet = await getDevWalletOverview(token)
      if (!options.isMounted()) {
        return
      }
      overview.value = wallet
    } catch {
      // 读数没刷上不影响「提现已提交」这个结论，下次刷新会补上
    }
  }

  /** 实时看板：只在全屏时连 WebSocket，退出全屏 / 离开本页即断开（组件卸载时自己收尾）。 */
  const liveSocket = useDevDashboardSocket({
    url: () => (auth.token ? devDashboardWsUrl(auth.token) : null),
    onSnapshot: applyDashboard,
  })

  /**
   * 同一份快照也回写钱包与保证金读数：资金卡沿用原来的绑定，数字跟着推送变；
   * 退出全屏后总览页看到的也是最新一份，而不是进页时那次拉取的旧值。
   */
  function applyDashboard(snapshot: DevDashboardSnapshot) {
    if (!options.isMounted()) {
      return
    }

    const current = dashboard.value
    // 进全屏那一下的 HTTP 拉取可能比 WebSocket 首帧晚到，旧快照不能盖掉新快照
    if (current && snapshot.generated_at < current.generated_at) {
      return
    }

    dashboard.value = snapshot
    overview.value = { ...snapshot.wallet, recent_income: overview.value?.recent_income ?? [] }
    deposit.value = {
      username: auth.username ?? '',
      role: 'dev',
      paid_withdraw_cny: 0,
      latest_order: null,
      ...deposit.value,
      ...snapshot.deposit,
    }

    options.onDashboardApplied?.()
  }

  /** 进全屏：连实时看板；还没有快照时补拉一次，失败交给 WebSocket 首帧兜底。 */
  async function enterLiveBoard() {
    if (mockEnabled) {
      applyDashboard(demoDevDashboard())
      return
    }

    liveSocket.connect()
    if (!dashboard.value && auth.token) {
      try {
        applyDashboard(await getDevDashboard(auth.token))
      } catch {
        // 首帧由 WebSocket 推送兜底，拉取失败不打断看板
      }
    }
  }

  /** 退出全屏 / 离开本页：断开实时看板。 */
  function disconnectLiveBoard() {
    liveSocket.disconnect()
  }

  /** 最后更新取快照的生成时间（服务端东八区），只显示时分秒；心跳不算更新。 */
  const lastUpdatedText = computed(() => dashboard.value?.generated_at.slice(11, 19) || '—')

  /** 状态灯：已连接用青（本页体系里的「正常 / 完成」色），重连中用金，已断开用灰。 */
  const connectionLamp = computed<{ tone: 'ok' | 'warn' | 'off'; label: string }>(() => {
    if (mockEnabled) {
      return { tone: 'off', label: '演示数据' }
    }

    switch (liveSocket.status.value) {
      case 'open':
        return { tone: 'ok', label: '已连接' }
      case 'connecting':
        return { tone: 'warn', label: '连接中' }
      case 'reconnecting':
        return { tone: 'warn', label: '重连中' }
      default:
        return { tone: 'off', label: '已断开' }
    }
  })

  return {
    loading,
    overview,
    deposit,
    requirements,
    resources,
    dashboard,
    mockEnabled,
    activeProjectCount,
    pendingDeliveryCount,
    completedProjectCount,
    withdrawable,
    pendingWithdraw,
    paidWithdraw,
    depositInsufficient,
    depositStatusChip,
    changeRate,
    connectionLamp,
    lastUpdatedText,
    loadPage,
    reloadWallet,
    enterLiveBoard,
    disconnectLiveBoard,
  }
}
