import { computed, type Ref } from 'vue'

import { formatMoney } from '@/shared/home/portalDisplay'

import { useDepositPayment, type DepositRequirement } from './useDepositPayment'

export type HomeDepositCardOptions = {
  /** 卸载后不再写响应式状态。`isMounted` 只有视图那一份，这一层只读不持。 */
  isMounted: () => boolean
  /** 视图那份待办需求列表：卡片要靠 `requirement_id` 从里面找人。 */
  pendingRequirements: Ref<DepositRequirement[]>
  /** 支付确认成功后重拉待办需求，把状态从「待付定金」推下去。 */
  loadPendingRequirements: () => Promise<void>
  /** URL 取值口径（`useHomeAuthQuery` 那一份）：卡片是否该出现只看 `modal=deposit`。 */
  routeQueryValue: (key: string) => string
}

/**
 * 首页「定金 / 尾款」支付卡片的**接线**（R047 从 `views/HomeView.vue` 拆出）。
 *
 * 状态、请求与分流仍在 `useDepositPayment`；这里只做两件视图层的事：
 *
 * 1. 把卡片要的 props 与 `v-model` / 事件收成一个 `depositModalBindings`，
 *    视图模板因此只有一行 `v-bind`（绑定键与拆出前的 `:prop` / `@event` 一一对应）；
 * 2. 「卡片该不该挂载」一起收进同一个返回值：拆出前是
 *    `v-if="depositVisible && depositRequirement"`，即「路由在 `modal=deposit` 且能按 id 找到人」，
 *    不满足时给 `null`，`v-bind` 与 `v-if` 读的是同一份判断。
 *
 * 视图那边只留 `openDepositCard`（列表行与精选卡片的统一入口，用例直接 `setupState.openDepositCard(...)` 调），
 * 它按状态把「驳回」交给发布域、把待付款这一支交给本 composable 的 `openDepositPayment`。
 */
export function useHomeDepositCard(options: HomeDepositCardOptions) {
  const {
    depositChannel,
    depositPayment,
    depositLoading,
    depositRatioPercent,
    depositPolicyAccepted,
    contractSigningStatus,
    depositRequirement,
    isFinalPayment,
    paymentStageLabel,
    payableFen,
    canOpenPayment,
    updateDepositChannel,
    markUnionAuthorized,
    openDepositPayment,
    closeDepositCard,
    loadDepositRatio,
    submitDepositPayment,
  } = useDepositPayment({
    isMounted: options.isMounted,
    pendingRequirements: options.pendingRequirements,
    loadPendingRequirements: options.loadPendingRequirements,
  })

  /**
   * 卡片要的 props / 事件全在这里。`null` 表示**不该挂载**：拆出前是
   * `v-if="depositVisible && depositRequirement"`，即「路由在 `modal=deposit` 且能按 id 找到人」。
   * 返回 `null` 与返回 falsy 的 `v-if` 等价，只多一层类型收窄（`depositRequirement` 不会传 null 进去）。
   */
  const depositModalBindings = computed(() => {
    if (options.routeQueryValue('modal') !== 'deposit') {
      return null
    }
    const requirement = depositRequirement.value
    if (!requirement) {
      return null
    }
    return {
      visible: true as const,
      depositRequirement: requirement,
      formattedBudget: formatMoney(requirement.budget),
      paymentStageLabel: paymentStageLabel.value,
      depositChannel: depositChannel.value,
      isFinalPayment: isFinalPayment.value,
      depositRatioPercent: depositRatioPercent.value,
      depositLoading: depositLoading.value,
      depositPayment: depositPayment.value,
      payableFen: payableFen.value,
      isEscrowPayment: requirement.paymentMode === 'platform_guarantee',
      depositPolicyAccepted: depositPolicyAccepted.value,
      contractSigningStatus: contractSigningStatus.value,
      onClose: closeDepositCard,
      onSubmit: submitDepositPayment,
      'onUpdate:depositPolicyAccepted': (value: boolean) => {
        depositPolicyAccepted.value = value
      },
      'onUpdate:depositChannel': updateDepositChannel,
    }
  })

  return {
    depositModalBindings,
    depositLoading,
    openDepositPayment,
    canOpenPayment,
    loadDepositRatio,
    markUnionAuthorized,
  }
}
