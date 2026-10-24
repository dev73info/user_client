import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { TMessage } from 'ui_73info'

import { HttpError } from '@/api/http'
import { getMyRealnameVerification } from '@/api/realname'
import {
  createRequirement,
  resubmitRequirement,
  type RequirementPaymentMode,
} from '@/api/requirements'
import PublishModal from '@/components/PublishModal.vue'
import {
  normalizeDevelopmentCycle,
  validateDevelopmentCycleInput,
} from '@/shared/requirementArchive'
import { useAuthStore } from '@/stores/auth'
import { validateRequirementRichText } from '@/utils/requirementRichText'

/** 登录弹窗的三个模式：与 `useAuthForm` / `AuthModal` 同一份口径。 */
export type AuthMode = 'login' | 'register' | 'reset'

/** 被驳回、要在首页「重新编辑」的需求（视图侧 `PendingRequirementView` 的子集）。 */
export type RejectedRequirement = {
  id: string
  title: string
  description?: string | null
  acceptanceCriteria?: string | null
  budget?: number | null
  paymentMode: RequirementPaymentMode
}

export type RequirementPublishOptions = {
  /** 卸载后不再写响应式状态。`isMounted` 只有视图那一份，这一层只读不持。 */
  isMounted: () => boolean
  /** 实名门禁没过时开登录弹窗（拼 `redirect_to`、邀请码那一支仍在视图）。 */
  openAuth: (mode: AuthMode, redirectTo?: string) => void
  /** 发布 / 重新提交成功后重拉首页待办需求。 */
  loadPendingRequirements: () => Promise<void>
}

/**
 * 首页「发布需求」域：表单状态、实名门禁、校验、提交（新建 `POST` / 重新提交 `PATCH`）与
 * 成功后的收尾。
 *
 * 视图那边只在**顶层**留着 `openDepositCard`（它同时是列表行与精选卡片的统一入口，
 * 用例直接 `setupState.openDepositCard(...)` 调），被驳回那一支调本 composable 的
 * `startResubmit` 回填，其余照旧。
 *
 * 校验口径与 `useRequirementPublishForm` 工厂同源：标题 → 描述 → 预算 → 验收标准 → 开发周期，
 * 顺序与文案都不在这里另立一套（`PublishModal` 里输入框照样渲染，`emit` 没人接时值会原地丢掉）。
 */
export function useRequirementPublish(options: RequirementPublishOptions) {
  const auth = useAuthStore()
  const router = useRouter()

  const publishTitle = ref('')
  const publishDescription = ref('')
  const publishBudget = ref<string | number>('')
  const publishAcceptance = ref('')
  const publishPaymentMode = ref<RequirementPaymentMode>('self_managed')
  // R014 的「开发周期（天）」：只有担保模式（`platform_guarantee`）才显示、才必填。
  // 这一路必须与付款模式一起接：`PublishModal` 里输入框照样渲染，但 `emit` 无人接时
  // 用户键入的值会原地丢掉 —— 后端对担保需求要求正数周期，发布必被 400 拒掉，
  // 重新提交走 `PATCH`（后端不跑 `validate_new`）则**不报错、周期静默丢失**。
  const publishDevelopmentCycleDays = ref<string | number>('')
  const activeResubmitRequirementId = ref<string | null>(null)
  const publishLoading = ref(false)
  const publishModalRef = ref<InstanceType<typeof PublishModal> | null>(null)

  function resetForm() {
    publishTitle.value = ''
    publishDescription.value = ''
    publishBudget.value = ''
    publishAcceptance.value = ''
    publishPaymentMode.value = 'self_managed'
    publishDevelopmentCycleDays.value = ''
  }

  /** 驳回需求进入「重新编辑」：字段回填、记住被编辑的需求号。 */
  function startResubmit(item: RejectedRequirement) {
    publishTitle.value = item.title || ''
    publishDescription.value = item.description || ''
    publishBudget.value = item.budget ?? ''
    publishAcceptance.value = item.acceptanceCriteria || ''
    publishPaymentMode.value = item.paymentMode
    // 开发周期清空起手：`PendingRequirementView` 没有带 `development_cycle_days`（见任务报告里的迁移对照表），
    // 这里不能把上一次发布的残留值带进「重新编辑」——担保模式下用户必须自己重填，宁可多填一次也不静默丢。
    publishDevelopmentCycleDays.value = ''
    activeResubmitRequirementId.value = item.id
    router.push({ name: 'home', query: { modal: 'publish' } })
  }

  async function ensurePublishRealnameApproved() {
    const publishRedirectTarget = router.resolve({
      name: 'home',
      query: { modal: 'publish' },
    }).fullPath

    auth.hydrate()
    if (!auth.isAuthed) {
      TMessage.info('发布需求前请先登录')
      options.openAuth('login', publishRedirectTarget)
      return false
    }

    try {
      const record = await getMyRealnameVerification(auth.token)
      if (record.status === 'approved') {
        return true
      }

      if (record.status === 'pending') {
        TMessage.warning('实名认证审核中，通过后可发布需求')
        return false
      }

      TMessage.warning('实名认证未通过，请重新提交后再发布需求')
      void router.push({
        name: 'workbench-realname',
        query: { redirect_to: publishRedirectTarget },
      })
      return false
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        TMessage.warning('发布需求前请先完成实名认证')
        void router.push({
          name: 'workbench-realname',
          query: { redirect_to: publishRedirectTarget },
        })
        return false
      }

      TMessage.error(err instanceof Error ? err.message : '实名认证状态校验失败')
      return false
    }
  }

  async function openPublishModal() {
    const approved = await ensurePublishRealnameApproved()
    if (!approved) {
      return
    }

    activeResubmitRequirementId.value = null
    resetForm()
    await router.push({ name: 'home', query: { modal: 'publish' } })
  }

  function closePublishModal() {
    activeResubmitRequirementId.value = null
    router.replace({ name: 'home' })
  }

  const publishModalTitle = computed(() =>
    activeResubmitRequirementId.value ? '重新编辑需求' : '发布需求',
  )

  const publishModalSubmitText = computed(() =>
    activeResubmitRequirementId.value ? '重新提交审核' : '确认发布',
  )

  const publishModalLoadingText = computed(() =>
    activeResubmitRequirementId.value ? '提交中...' : '发布中...',
  )

  async function submitPublishRequirement() {
    const approved = await ensurePublishRealnameApproved()
    if (!approved) {
      return
    }

    const normalizedTitle = publishTitle.value.trim()
    const descriptionValidation = validateRequirementRichText(
      publishDescription.value,
      '需求描述',
      {
        minTextLength: 10,
      },
    )
    const acceptanceValidation = validateRequirementRichText(publishAcceptance.value, '验收标准', {
      required: true,
    })

    const budgetRaw = String(publishBudget.value ?? '').trim()

    if (normalizedTitle.length < 4) {
      TMessage.error('需求标题至少 4 个字符')
      return
    }

    if (descriptionValidation.error) {
      TMessage.error(descriptionValidation.error)
      return
    }

    if (!budgetRaw) {
      TMessage.error('预算不能为空')
      return
    }

    const budget = Number(budgetRaw)

    if (Number.isNaN(budget) || budget < 0) {
      TMessage.error('预算必须是大于等于0的数字')
      return
    }

    if (acceptanceValidation.error) {
      TMessage.error(acceptanceValidation.error)
      return
    }

    // R014：担保需求必填「开发周期（天）」，且必须是正整数。位置排在最后一步（标题 → 描述 → 预算 → 验收标准
    // → 周期），与工厂 `validateRequirementPublishForm` 的顺序、文案同源：判定直接调
    // `validateDevelopmentCycleInput`，这里不重写规则。自管模式该步恒为空（不要求、也不展示）。
    const developmentCycleError = validateDevelopmentCycleInput(
      publishDevelopmentCycleDays.value,
      publishPaymentMode.value,
    )

    if (developmentCycleError) {
      TMessage.error(developmentCycleError)
      return
    }

    publishLoading.value = true

    try {
      const payload = {
        title: normalizedTitle,
        description: descriptionValidation.value,
        budget,
        acceptance_criteria: acceptanceValidation.value,
        payment_mode: publishPaymentMode.value,
        // 口径与工厂一致：自管模式归一化成 `undefined`（`JSON.stringify` 把键丢掉，后端收到「未填」），
        // 担保模式给填写的正整数。少了这个键，担保需求的合同有效期算不出来。
        development_cycle_days: normalizeDevelopmentCycle(
          publishDevelopmentCycleDays.value,
          publishPaymentMode.value,
        ),
      }

      if (activeResubmitRequirementId.value) {
        await resubmitRequirement(auth.token, activeResubmitRequirementId.value, payload)
      } else {
        await createRequirement(auth.token, payload)
      }

      if (!options.isMounted()) {
        return
      }

      const wasResubmit = Boolean(activeResubmitRequirementId.value)
      const resubmitId = activeResubmitRequirementId.value
      activeResubmitRequirementId.value = null
      resetForm()
      if (resubmitId) {
        publishModalRef.value?.clearDraft(`edit-${resubmitId}`)
      } else {
        publishModalRef.value?.clearDraft()
      }
      TMessage.success(wasResubmit ? '需求已重新提交，等待审核' : '需求已发布')
      void router.replace({ name: 'home' })
      await options.loadPendingRequirements()
    } catch (err) {
      if (options.isMounted()) {
        TMessage.error(err instanceof Error ? err.message : '发布失败')
      }
    } finally {
      if (options.isMounted()) {
        publishLoading.value = false
      }
    }
  }

  return {
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
  }
}
