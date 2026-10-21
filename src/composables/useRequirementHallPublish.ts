import { ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { TMessage } from 'ui_73info'

import { createRequirement, type RequirementPaymentMode } from '@/api/requirements'
import { getMyRealnameVerification } from '@/api/realname'
import PublishModal from '@/components/PublishModal.vue'
import { HttpError } from '@/api/http'
import { validateRequirementRichText } from '@/utils/requirementRichText'
import { useAuthStore } from '@/stores/auth'

/**
 * 需求大厅的「发布需求」弹窗。
 *
 * 从 `views/RequirementHallView.vue` 抽出：实名门禁、表单状态、提交与错误提示、
 * 与 `?modal=publish` 这条 query 的双向同步都在这里；弹窗本体仍是 `components/PublishModal.vue`。
 * 发布成功后重新拉一遍大厅（`options.reloadHall`），与原来 `await loadHallData()` 一致。
 */
export function useRequirementHallPublish(options: { reloadHall: () => Promise<void> | void }) {
  const router = useRouter()
  const route = useRoute()
  const auth = useAuthStore()

  const publishVisible = ref(false)
  const publishTitle = ref('')
  const publishDescription = ref('')
  const publishBudget = ref<string | number>('')
  const publishAcceptance = ref('')
  const publishPaymentMode = ref<RequirementPaymentMode>('self_managed')
  const publishLoading = ref(false)
  const publishModalRef = ref<InstanceType<typeof PublishModal> | null>(null)

  /**
   * 弹窗内部的提示转发：`PublishModal` 不直接引 toast，统一把消息抛给页面。
   * 这是 `views` 里那个 `notify` 的等价物。
   */
  function notify(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    TMessage[type](message)
  }

  watch(
    () => route.query.modal,
    (value) => {
      if (value === 'publish' && !publishVisible.value) {
        resetPublishForm()
        publishVisible.value = true
      }
    },
    { immediate: true },
  )

  function publishRedirectTarget() {
    return router.resolve({
      name: 'requirement-hall',
      query: { ...route.query, modal: 'publish' },
    }).fullPath
  }

  function openAuthLogin() {
    void router.push({
      name: 'home',
      query: {
        modal: 'auth',
        mode: 'login',
        redirect_to: publishRedirectTarget(),
      },
    })
  }

  async function ensurePublishRealnameApproved() {
    const redirectTarget = publishRedirectTarget()
    auth.hydrate()
    if (!auth.isAuthed) {
      TMessage.info('发布需求前请先登录')
      openAuthLogin()
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
        query: { redirect_to: redirectTarget },
      })
      return false
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        TMessage.warning('发布需求前请先完成实名认证')
        void router.push({
          name: 'workbench-realname',
          query: { redirect_to: redirectTarget },
        })
        return false
      }

      TMessage.error(err instanceof Error ? err.message : '实名认证状态校验失败')
      return false
    }
  }

  function resetPublishForm() {
    publishTitle.value = ''
    publishDescription.value = ''
    publishBudget.value = ''
    publishAcceptance.value = ''
    publishPaymentMode.value = 'self_managed'
  }

  async function openPublishModal() {
    const approved = await ensurePublishRealnameApproved()
    if (!approved) {
      return
    }

    resetPublishForm()
    publishVisible.value = true
  }

  function clearPublishModalQuery() {
    if (route.query.modal !== 'publish') {
      return
    }

    const nextQuery = { ...route.query }
    delete nextQuery.modal
    void router.replace({ query: nextQuery })
  }

  function closePublishModal() {
    if (publishLoading.value) {
      return
    }

    publishVisible.value = false
    resetPublishForm()
    clearPublishModalQuery()
  }

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

    if (!Number.isFinite(budget) || budget < 0) {
      TMessage.error('预算必须是大于等于0的数字')
      return
    }

    if (acceptanceValidation.error) {
      TMessage.error(acceptanceValidation.error)
      return
    }

    publishLoading.value = true
    try {
      await createRequirement(auth.token, {
        title: normalizedTitle,
        description: descriptionValidation.value,
        budget,
        acceptance_criteria: acceptanceValidation.value,
        payment_mode: publishPaymentMode.value,
      })

      TMessage.success('需求已发布，等待审核')
      publishVisible.value = false
      resetPublishForm()
      clearPublishModalQuery()
      publishModalRef.value?.clearDraft()
      await options.reloadHall()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '发布失败')
    } finally {
      publishLoading.value = false
    }
  }

  return {
    // 弹窗状态
    publishVisible,
    publishLoading,
    publishModalRef,
    // 表单
    publishTitle,
    publishDescription,
    publishBudget,
    publishAcceptance,
    publishPaymentMode,
    // 动作
    openPublishModal,
    closePublishModal,
    submitPublishRequirement,
    notify,
  }
}
