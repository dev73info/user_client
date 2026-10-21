import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { TMessage } from 'ui_73info'

import {
  createRequirement as createRequirementApi,
  type RequirementPaymentMode,
} from '@/api/requirements'
import PublishModal from '@/components/PublishModal.vue'
import { useRealnameApprovalGate } from '@/composables/useRealnameApprovalGate'
import { useAuthStore } from '@/stores/auth'
import { validateRequirementRichText } from '@/utils/requirementRichText'

type UseProfilePublishRequirementOptions = {
  /** 发布成功后重取需求列表：视图首屏那条串行链的唯一口子（读数条与进度面板吃同一份列表）。 */
  reloadRequirements: () => Promise<void>
  /** 未登录：跳登录。`redirectTarget` 是登录后回到「总览 + ?modal=publish」的完整路径。 */
  onNeedLogin: (redirectTarget: string) => void
  /** 未实名 / 被驳回 / 查无记录：跳实名页，`redirectTarget` 同上。 */
  onNeedRealname: (redirectTarget: string) => void
}

/**
 * 个人中心总览的「发布需求」域：弹窗可见性、表单态、实名前置门禁、建单提交，
 * 以及 `?modal=publish` 这条地址栏参数的读入（挂在 `route.query` 上）与摘除。
 *
 * 两件事刻意不在这里做：
 * 1. **跳转**（登录 / 实名页）由选项注入 —— 门禁只判「能不能发」，`onNeedLogin` /
 *    `onNeedRealname` 决定去哪儿。`@/api/realname` 因此随本域一起离开视图；
 * 2. **需求列表的刷新**也是注入的 `reloadRequirements` —— 这份列表归 `useRequirementOverview`，
 *    这里只在发布成功后喊一声刷新。
 *
 * 校验与提示文案逐字沿用拆分前（视图里那段 `submitRequirementPublish`），改名与换层不改口径：
 * 标题 ≥4 字 → 富文本描述（≥10 字）→ 预算非空且 ≥0 → 验收标准必填，谁先不合规只报谁。
 */
export function useProfilePublishRequirement(options: UseProfilePublishRequirementOptions) {
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()

  const publishVisible = ref(false)
  const publishTitle = ref('')
  const publishDescription = ref('')
  const publishBudget = ref<string | number>('')
  const publishAcceptance = ref('')
  const publishPaymentMode = ref<RequirementPaymentMode>('self_managed')
  const publishLoading = ref(false)
  /** 模板里的 `ref="publishModalRef"`：只为提交成功后调一次 `clearDraft()`。 */
  const publishModalRef = ref<InstanceType<typeof PublishModal> | null>(null)

  /** 草稿按用户隔离：多账号共用浏览器时，`PublishModal` 的 localStorage 草稿不互相覆盖。 */
  const draftScope = computed(() => (auth.isAuthed ? auth.username : 'default'))

  function resetPublishForm() {
    publishTitle.value = ''
    publishDescription.value = ''
    publishBudget.value = ''
    publishAcceptance.value = ''
    publishPaymentMode.value = 'self_managed'
  }

  /** 登录 / 实名完成后要回到的地址：仍是总览，但要带上 `?modal=publish` 把弹窗重开。 */
  function publishRedirectTarget() {
    return router.resolve({
      name: 'workbench',
      query: { ...route.query, modal: 'publish' },
    }).fullPath
  }

  /**
   * 实名门禁：只取状态，两个跳转都是注入的回调（见 `useRealnameApprovalGate`）。
   * 三个分支的去向：审核中停在这里不跳；未通过、查无记录（`HttpError(404)`）都去实名页；
   * 其余异常（网络 / 服务端）只报错不跳。
   */
  const realnameGate = useRealnameApprovalGate({
    token: () => auth.token,
    isAuthed: () => auth.isAuthed,
    hydrate: () => auth.hydrate(),
    onNeedLogin: options.onNeedLogin,
    onNeedRealname: options.onNeedRealname,
  })

  async function ensurePublishRealnameApproved() {
    return realnameGate.ensureApproved(publishRedirectTarget())
  }

  /** 摘掉 `?modal=publish`：只改这一个键，其余 query（`settle` / OAuth 回跳参数）原样留着。 */
  function clearPublishModalQuery() {
    if (route.query.modal !== 'publish') {
      return
    }

    const nextQuery = { ...route.query }
    delete nextQuery.modal
    void router.replace({ query: nextQuery })
  }

  /** 直接关（提交成功后用）：不看 loading，也不碰 query。 */
  function forceClosePublishModal() {
    publishVisible.value = false
    resetPublishForm()
  }

  /** 用户关闭：请求在跑时忽略（否则弹窗关了请求还在飞，回来又把列表刷一遍）。 */
  function closePublishModal() {
    if (publishLoading.value) {
      return
    }

    forceClosePublishModal()
    clearPublishModalQuery()
  }

  async function submitRequirementPublish() {
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

    publishLoading.value = true
    try {
      await createRequirementApi(auth.token, {
        title: normalizedTitle,
        description: descriptionValidation.value,
        budget,
        acceptance_criteria: acceptanceValidation.value,
        payment_mode: publishPaymentMode.value,
      })

      TMessage.success('需求已发布')
      forceClosePublishModal()
      clearPublishModalQuery()
      publishModalRef.value?.clearDraft()
      await options.reloadRequirements()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '发布失败')
    } finally {
      publishLoading.value = false
    }
  }

  /**
   * `?modal=publish` 开弹窗：带这个参数回到总览即弹窗（移动端宫格的「我有需求」就这么进）。
   *
   * 这条 watch 跟着本域走，而不是留在视图：**读**参数（这里）与**摘**参数
   * （`closePublishModal → clearPublishModalQuery`）是同一件事的两端，分开放就会有一端漏改。
   * `immediate: true` 保证「带参数挂载」当场重放一次——`PublishModal` 被 `v-if` 卸过再挂不会补。
   *
   * 只开窗、**不跑实名门禁**：刚进页面就被踢去实名页不好受，门禁留给提交前那一次。
   */
  watch(
    () => route.query.modal,
    (value) => {
      if (value === 'publish' && !publishVisible.value) {
        forceClosePublishModal()
        publishVisible.value = true
      }
    },
    { immediate: true },
  )

  /**
   * 模板挂点：`<PublishModal ref="publishModalRef" v-bind="publishModalBindings" />` 一行铺完。
   *
   * 五个字段的 `v-model` 展开成「值 + `onUpdate:字段`」，键名**逐字**对应 `PublishModal` 的
   * `defineEmits`（`update:publishTitle` / `…Description` / `…Budget` / `…Acceptance` / `…PaymentMode`，
   * 冒号少一个就静默失效）；`onClose` / `onSubmit` / `onNotify` 对 `close` / `submit` / `notify`。
   * `notify` 只用来到上游发 toast —— `PublishModal` 自己不引 toast，这里也不让它引。
   */
  const publishModalBindings = computed(() => ({
    visible: publishVisible.value,
    draftScope: draftScope.value,
    publishLoading: publishLoading.value,
    publishTitle: publishTitle.value,
    publishDescription: publishDescription.value,
    publishBudget: publishBudget.value,
    publishAcceptance: publishAcceptance.value,
    publishPaymentMode: publishPaymentMode.value,
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
    'onUpdate:publishPaymentMode': (value: RequirementPaymentMode) => {
      publishPaymentMode.value = value
    },
    onNotify: (message: string, type?: 'success' | 'warning' | 'error') =>
      TMessage[type ?? 'info'](message),
    onClose: closePublishModal,
    onSubmit: submitRequirementPublish,
  }))

  return {
    publishVisible,
    publishLoading,
    publishModalRef,
    draftScope,
    ensurePublishRealnameApproved,
    clearPublishModalQuery,
    closePublishModal,
    submitRequirementPublish,
    publishModalBindings,
  }
}
