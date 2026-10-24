import { computed } from 'vue'

import { TMessage } from 'ui_73info'

import { useRequirementPublish, type AuthMode } from './useRequirementPublish'
import { useAuthStore } from '@/stores/auth'

export type HomePublishCardOptions = {
  /** 卸载后不再写响应式状态。`isMounted` 只有视图那一份，这一层只读不持。 */
  isMounted: () => boolean
  /** 实名门禁没过时开登录弹窗（拼 `redirect_to`、邀请码那一支在 `useHomePortalAuth`）。 */
  openAuth: (mode: AuthMode, redirectTo?: string) => void
  /** 发布成功后重拉首页待办需求。 */
  loadPendingRequirements: () => Promise<void>
  /** URL 取值口径（`useHomeAuthQuery` 那一份）：弹窗是否该出现只看 `modal=publish`。 */
  routeQueryValue: (key: string) => string
}

/**
 * 首页「发布需求」弹窗的**接线**（R047 从 `views/HomeView.vue` 拆出）。
 *
 * 状态机、实名门禁、校验与提交仍在 `useRequirementPublish`（大厅 / 个人中心共用同一支）；
 * 这里只把弹窗要的 12 个 props、6 个 `v-model` 与 3 个事件收成一个 `publishModalBindings`，
 * 外加拆出前就属于弹窗的两件事：草稿域 `draftScope` 的拼法与 `notify` 的转调。
 */
export function useHomePublishCard(options: HomePublishCardOptions) {
  const auth = useAuthStore()

  const {
    publishTitle,
    publishDescription,
    publishBudget,
    publishAcceptance,
    publishPaymentMode,
    publishDevelopmentCycleDays,
    activeResubmitRequirementId,
    publishLoading,
    publishModalRef,
    publishModalTitle,
    publishModalSubmitText,
    publishModalLoadingText,
    startResubmit,
    openPublishModal,
    closePublishModal,
    submitPublishRequirement,
  } = useRequirementPublish({
    isMounted: options.isMounted,
    openAuth: (mode, redirectTo) => options.openAuth(mode, redirectTo),
    loadPendingRequirements: () => options.loadPendingRequirements(),
  })

  function notify(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    TMessage[type](message)
  }

  /** 草稿按「重新编辑的那条需求 > 登录用户名 > 默认」分桶，与拆出前逐字一致。 */
  const draftScope = computed(() =>
    activeResubmitRequirementId.value
      ? `edit-${activeResubmitRequirementId.value}`
      : auth.isAuthed
        ? auth.username
        : 'default',
  )

  const publishModalBindings = computed(() => ({
    visible: options.routeQueryValue('modal') === 'publish',
    publishTitle: publishTitle.value,
    publishDescription: publishDescription.value,
    publishBudget: publishBudget.value,
    publishAcceptance: publishAcceptance.value,
    publishPaymentMode: publishPaymentMode.value,
    publishDevelopmentCycleDays: publishDevelopmentCycleDays.value,
    modalTitle: publishModalTitle.value,
    submitText: publishModalSubmitText.value,
    loadingText: publishModalLoadingText.value,
    publishLoading: publishLoading.value,
    draftScope: draftScope.value,
    'onUpdate:publishTitle': (value: string) => {
      publishTitle.value = value
    },
    'onUpdate:publishDescription': (value: string) => {
      publishDescription.value = value
    },
    'onUpdate:publishBudget': (value: string | number) => {
      publishBudget.value = value
    },
    'onUpdate:publishAcceptance': (value: string) => {
      publishAcceptance.value = value
    },
    'onUpdate:publishPaymentMode': (value: typeof publishPaymentMode.value) => {
      publishPaymentMode.value = value
    },
    'onUpdate:publishDevelopmentCycleDays': (value: string | number) => {
      publishDevelopmentCycleDays.value = value
    },
    onClose: closePublishModal,
    onNotify: notify,
    onSubmit: submitPublishRequirement,
  }))

  return {
    publishModalBindings,
    publishModalRef,
    publishLoading,
    openPublishModal,
    startResubmit,
  }
}
