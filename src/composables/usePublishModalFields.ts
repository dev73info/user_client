import { computed, onMounted, watch } from 'vue'

import {
  loadAdapayAvailability,
  platformGuaranteeLoaded,
  platformGuaranteeReady,
} from '@/shared/adapayAvailability'

export type PublishModalFieldsProps = {
  visible: boolean
  publishPaymentMode: 'platform_guarantee' | 'self_managed'
  allowPlatformGuarantee?: boolean | undefined
}

export type PublishModalFieldsOptions = {
  /** `emit` 原样传进来：这一层的每个写操作都与拆出前的 `emit(...)` 一一对应。 */
  emit: {
    (event: 'update:publishTitle', value: string): void
    (event: 'update:publishDescription', value: string): void
    (event: 'update:publishBudget', value: string): void
    (event: 'update:publishAcceptance', value: string): void
    (event: 'update:publishPaymentMode', value: 'platform_guarantee' | 'self_managed'): void
    (event: 'update:publishDevelopmentCycleDays', value: string): void
  }
}

/**
 * 发布弹窗「表单字段 → 父级 v-model」与「发布方式（电签担保 / 无电签约定）」的接线
 * （R047 从 `components/PublishModal.vue` 拆出）。
 *
 * 三件事原样搬过来：
 * 1. 五个输入框的 `emit` 转发（标题 / 描述 / 预算 / 验收标准 / 开发周期）；
 * 2. 「电签担保」是否可选：显式传入 `allowPlatformGuarantee` 时以传入值为准，否则跟随服务端可用性
 *    （后端会校验 Adapay 密钥、回调地址、个税规则等配置是否齐备）；
 * 3. 可用性的两次询问：挂载时问一次，每次打开弹窗再问一次。组件实例在首页就是挂载状态
 *    （`visible` 只是内层 `v-if`），`onMounted` 那一次请求往往赶在自动登录落地之前，问到的是匿名
 *    身份的结果；那个结果不会被缓存（见 `shared/adapayAvailability.ts`），但要有人再问一次才会被
 *    纠正 —— 少了这一步，「电签担保」在整个页面会话里都不会出现。
 *
 * 可用性尚未加载完成时不降级，否则会误清掉草稿里已选的担保模式。
 */
export function usePublishModalFields(
  props: PublishModalFieldsProps,
  options: PublishModalFieldsOptions,
) {
  const { emit } = options

  function updateTitle(event: Event) {
    emit('update:publishTitle', (event.target as HTMLInputElement).value)
  }

  function updateDescription(value: string) {
    emit('update:publishDescription', value)
  }

  function updateBudget(event: Event) {
    emit('update:publishBudget', (event.target as HTMLInputElement).value)
  }

  function updateAcceptance(value: string) {
    emit('update:publishAcceptance', value)
  }

  function updateDevelopmentCycleDays(event: Event) {
    emit('update:publishDevelopmentCycleDays', (event.target as HTMLInputElement).value)
  }

  /**
   * 是否电签担保：只有担保需求才需要填「开发周期」（R014）。
   *
   * 无担保需求（`self_managed`）不建合同、也没有有效期，发布 / 编辑时不显示该字段；
   * 视图提交时同样按这个模式决定要不要带上 `development_cycle_days`。
   */
  const isGuaranteeMode = computed(() => props.publishPaymentMode === 'platform_guarantee')

  /** 开发周期输入区内的提示：讲清「这是合同有效期、以后端下限为准」。 */
  const developmentCycleHint =
    '开发周期（天）＝合同自双方签署完成到截止的有效期；低于平台配置的最短天数会被拒绝，具体下限以后端提示为准。'

  // 是否展示「电签担保」：显式传入时以传入值为准，否则跟随服务端可用性。
  const platformGuaranteeAllowed = computed(
    () => props.allowPlatformGuarantee ?? platformGuaranteeReady.value,
  )

  function updatePaymentMode(value: 'platform_guarantee' | 'self_managed') {
    if (value === 'platform_guarantee' && !platformGuaranteeAllowed.value) {
      return
    }

    emit('update:publishPaymentMode', value)
  }

  onMounted(() => {
    if (props.allowPlatformGuarantee === undefined) {
      void loadAdapayAvailability()
    }
  })

  // 每次打开弹窗再确认一次可用性（原因见上方说明）。
  watch(
    () => props.visible,
    (visible) => {
      if (visible && props.allowPlatformGuarantee === undefined) {
        void loadAdapayAvailability()
      }
    },
  )

  watch(
    () =>
      [
        platformGuaranteeAllowed.value,
        platformGuaranteeLoaded.value,
        props.publishPaymentMode,
      ] as const,
    ([allowed, loaded, publishPaymentMode]) => {
      // 可用性尚未加载完成时不降级，否则会误清掉草稿里已选的担保模式。
      if (!loaded && props.allowPlatformGuarantee === undefined) {
        return
      }
      if (!allowed && publishPaymentMode === 'platform_guarantee') {
        emit('update:publishPaymentMode', 'self_managed')
      }
    },
    { immediate: true },
  )

  return {
    isGuaranteeMode,
    developmentCycleHint,
    platformGuaranteeAllowed,
    updateTitle,
    updateDescription,
    updateBudget,
    updateAcceptance,
    updateDevelopmentCycleDays,
    updatePaymentMode,
  }
}
