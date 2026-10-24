import { computed, ref } from 'vue'

import { getDevWalletOverview, type DevWalletOverview } from '@/api/devWallet'
import { listMyRequirements, type RequirementItem } from '@/api/devRequirements'
import { listTeamResources, type McResourcePayload } from '@/api/mcResources'
import { describeBackendError } from '@/shared/backendErrorText'
import { isActiveRequirement } from '@/shared/requirementStatus'
import { useAuthStore } from '@/stores/auth'

/**
 * 开发者工作台总览的数据层：三份**契约里真实存在**的读，一次取齐。
 *
 * | 用途 | 端点 |
 * | --- | --- |
 * | 钱包与提现读数、近期到账 | `GET /api/requirement/wallet/overview` |
 * | 我的需求（三档读数按 `status` 现算） | `GET /api/requirement/dev/mine` |
 * | 我的资源 | `GET /api/resource/resources/team` |
 *
 * 两条纪律：
 * 1. `isMounted` 由视图持有，这一层只读 getter，卸载后不再写响应式状态；
 * 2. **失败就报错，不吞成空数组**：三份读走同一个 `Promise.all`，任何一份失败都置 `loadError`
 *    （后端中文文案）、把 `loaded` 压回 false，页面据此显示「—」与重试入口，而不是把
 *    「还没读到」画成 0 或「暂无数据」。
 */
export type UseDevHomeDashboardOptions = {
  /** 卸载标记：**只有视图那一份**，这一层只读不持。 */
  isMounted: () => boolean
  /** 两句用户可见文案留在视图（本层不引 TMessage）：登录失效与三接口失败的兜底。 */
  texts: { loginExpired: string; loadFailed: string }
  /** 出错时的提示出口（视图接 `TMessage.error`）。 */
  onError: (message: string) => void
}

export function useDevHomeDashboard(options: UseDevHomeDashboardOptions) {
  const auth = useAuthStore()

  const loading = ref(false)
  /** 三份读是否都拿到了：false 时读数一律显示「—」，不拿 0 冒充。 */
  const loaded = ref(false)
  const loadError = ref<string | null>(null)
  const overview = ref<DevWalletOverview | null>(null)
  const requirements = ref<RequirementItem[]>([])
  const resources = ref<McResourcePayload[]>([])

  /**
   * 三档读数，全部从这份列表按 `status` 现算，后端没有「仪表盘」这种聚合接口：
   * - 进行中 = 在途五档（口径与侧边栏「我的接单」角标同源，见 `isActiveRequirement`）；
   * - 待交付 = 开发中（下一步就是交付；已进「待付尾款」的单交付已经落地，不算待交付）；
   * - 已完成 = 已结单。
   */
  const activeProjectCount = computed(
    () => requirements.value.filter((item) => isActiveRequirement(item.status)).length,
  )
  const pendingDeliveryCount = computed(
    () => requirements.value.filter((item) => item.status === 'in_development').length,
  )
  const completedProjectCount = computed(
    () => requirements.value.filter((item) => item.status === 'completed').length,
  )

  /** 钱包与提现读数：三个金额字段都是**元**，只用于展示。 */
  const withdrawable = computed(() => overview.value?.withdrawable_balance_cny ?? null)
  const pendingWithdraw = computed(() => overview.value?.pending_withdraw_cny ?? null)
  const paidWithdraw = computed(() => overview.value?.paid_withdraw_cny ?? null)
  const changeRate = computed(() => overview.value?.today_income_change_rate ?? null)
  const todayIncome = computed(() => overview.value?.today_income_cny ?? null)

  async function loadPage() {
    const token = auth.token
    if (!token) {
      options.onError(options.texts.loginExpired)
      return
    }

    loading.value = true
    try {
      const [wallet, myRequirements, resourceList] = await Promise.all([
        getDevWalletOverview(token),
        listMyRequirements(token),
        listTeamResources(token),
      ])

      // 慢响应回来时视图可能已经没了：卸载后一律不再写
      if (!options.isMounted()) {
        return
      }

      overview.value = wallet
      requirements.value = myRequirements
      resources.value = resourceList
      loadError.value = null
      loaded.value = true
    } catch (error) {
      if (!options.isMounted()) {
        return
      }

      const message = describeBackendError(error, options.texts.loadFailed)
      loadError.value = message
      loaded.value = false
      options.onError(message)
    } finally {
      if (options.isMounted()) {
        loading.value = false
      }
    }
  }

  /** 提现成功后的回刷：只重取钱包读数，需求与资源不受影响。失败也要说出来，不静默吞掉。 */
  async function reloadWallet() {
    const token = auth.token
    if (!token) {
      return
    }

    try {
      const wallet = await getDevWalletOverview(token)
      if (!options.isMounted()) {
        return
      }

      // 只换钱包读数：`loaded` 表达的是「整页三份读都到了」，提现回刷不能把它翻上来——
      // 否则一次失败后再提现成功，三格读数会拿空列表算成 0，看起来像「一个单都没有」。
      overview.value = wallet
    } catch (error) {
      if (options.isMounted()) {
        options.onError(describeBackendError(error, '刷新提现读数失败'))
      }
    }
  }

  return {
    loading,
    loaded,
    loadError,
    overview,
    requirements,
    resources,
    activeProjectCount,
    pendingDeliveryCount,
    completedProjectCount,
    withdrawable,
    pendingWithdraw,
    paidWithdraw,
    changeRate,
    todayIncome,
    loadPage,
    reloadWallet,
  }
}
