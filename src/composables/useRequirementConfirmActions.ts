import { computed, ref } from 'vue'

import type { AdapayAcceptanceResult } from '@/api/adapay'
import {
  cancelRequirement as cancelRequirementApi,
  requestRequirementFinalPayment as requestRequirementFinalPaymentApi,
  type RequirementItem,
} from '@/api/requirements'
import {
  canCancel,
  canComment,
  canOpenAcceptance,
  canOpenAfterSales,
  hasBoundResource,
  isSelfManagedRequirement,
  publishedVersionCount,
  type RequirementRowFacts,
} from '@/shared/requirementRowRules'

import { TMessage } from 'ui_73info'

type UseRequirementConfirmActionsOptions = {
  token: () => string
  username: () => string
  isAuthed: () => boolean
  /** 按条外部事实：三张按条 map 只有 `useMyRequirementsData` 持有，这里注入而不重查（见 `requirementRowRules`）。 */
  rowFacts: (item: RequirementItem) => RequirementRowFacts
  /** 最新列表：验收通过后回读刷新后的那一行，再决定跳不跳支付。 */
  myRequirements: () => RequirementItem[]
  /** 列表写入口（`useMyRequirementsData` 的 `reload`）。 */
  reload: () => Promise<void>
  /** 验收通过后顺手打开支付弹窗（尾款入口在 `useRequirementPayFlow`）。 */
  openPayModal: (item: RequirementItem) => void
}

/**
 * 「我的需求」页的取消 / 确认完成 / 验收 / 售后 / 评价五个收尾动作。
 *
 * 这五块形状相近（目标行 + 可见性 + loading + 关弹窗守卫），但**守卫各留各的**：取消与确认完成是
 * 两个不同的请求，合并成一条 loading 会让一边的请求挡住另一边的关闭。
 * 每个弹窗的 props / 监听在这里拼成一份 `v-bind` 对象（`xxxModal`），视图只留挂点。
 */
export function useRequirementConfirmActions(options: UseRequirementConfirmActionsOptions) {
  /* 五块状态：取消 / 确认完成（无担保）/ 验收（担保）/ 解除合作 / 评价。
     前两块各有自己的 loading——`close` 的守卫分别由 `cancelLoading` 与
     `finalPaymentConfirmLoading` 把着，合并成一条会让一个请求挡住另一个弹窗的关闭。 */
  const cancelVisible = ref(false)
  const cancelTarget = ref<RequirementItem | null>(null)
  const cancelLoading = ref(false)
  const finalPaymentVisible = ref(false)
  const finalPaymentTarget = ref<RequirementItem | null>(null)
  const finalPaymentConfirmLoading = ref(false)
  const acceptanceVisible = ref(false)
  const acceptanceTarget = ref<RequirementItem | null>(null)
  const afterSalesVisible = ref(false)
  const afterSalesTarget = ref<RequirementItem | null>(null)
  const commentVisible = ref(false)
  const commentRequirement = ref<RequirementItem | null>(null)

  function openCancelConfirm(item: RequirementItem) {
    if (!canCancel(item)) {
      return
    }
    cancelTarget.value = item
    cancelVisible.value = true
  }

  function closeCancelConfirm() {
    if (cancelLoading.value) {
      return
    }
    cancelVisible.value = false
    cancelTarget.value = null
  }

  async function submitCancelRequirement() {
    const item = cancelTarget.value
    if (!item) {
      return
    }

    cancelLoading.value = true
    try {
      await cancelRequirementApi(options.token(), item.requirement_id)
      TMessage.success('需求已取消')
      cancelVisible.value = false
      cancelTarget.value = null
      await options.reload()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '取消需求失败')
    } finally {
      cancelLoading.value = false
    }
  }

  /** 无担保模式的「确认完成」入口：担保模式的验收与尾款走 accept / pay，不再经过这里。 */
  function openFinalPaymentConfirm(item: RequirementItem) {
    if (!options.isAuthed()) {
      TMessage.error('请先登录后再继续操作')
      return
    }

    if (!hasBoundResource(item)) {
      TMessage.warning('当前需求尚未关联资源项目')
      return
    }

    if (item.status !== 'in_development') {
      TMessage.warning('只有开发中的需求单才能确认完成')
      return
    }

    if (publishedVersionCount(item, options.rowFacts(item)) <= 0) {
      TMessage.warning('开发者至少发布一个资源版本后，才能确认完成')
      return
    }

    finalPaymentTarget.value = item
    finalPaymentVisible.value = true
  }

  /** 不看 loading 的直接收口：请求成功后用（那时守卫还没放开）。 */
  function forceCloseFinalPaymentConfirm() {
    finalPaymentVisible.value = false
    finalPaymentTarget.value = null
  }

  function closeFinalPaymentConfirm() {
    if (finalPaymentConfirmLoading.value) {
      return
    }
    forceCloseFinalPaymentConfirm()
  }

  async function confirmFinalPaymentRequest() {
    if (!finalPaymentTarget.value || finalPaymentConfirmLoading.value) {
      return
    }

    const item = finalPaymentTarget.value
    // 担保模式的尾款入口已经换成「验收」（见 openAcceptanceModal）：验收通过后由用户自己点支付，
    // 这里只剩无担保模式的「确认完成」——它没有合同与尾款，验收标准由双方线下把关。
    // 这道分叉不能丢：担保需求发 `final-payment` 请求会被后端按「该走验收」拒掉。
    if (!isSelfManagedRequirement(item)) {
      closeFinalPaymentConfirm()
      return
    }

    finalPaymentConfirmLoading.value = true
    try {
      await requestRequirementFinalPaymentApi(options.token(), item.requirement_id)
      await options.reload()
      TMessage.success('需求已确认完成')
      forceCloseFinalPaymentConfirm()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '结束开发失败')
    } finally {
      finalPaymentConfirmLoading.value = false
    }
  }

  async function openAcceptanceModal(item: RequirementItem) {
    if (!options.isAuthed() || !options.token()) {
      TMessage.error('请先登录后再继续操作')
      return
    }
    if (!canOpenAcceptance(item, options.rowFacts(item))) {
      TMessage.warning('当前需求还不能验收，请确认双方已签合同且开发者已提交交付版本')
      return
    }

    acceptanceTarget.value = item
    acceptanceVisible.value = true
  }

  function closeAcceptanceModal() {
    acceptanceVisible.value = false
    acceptanceTarget.value = null
  }

  /**
   * 验收提交成功后的收尾：先把列表刷成新状态，再按结论决定要不要接着走尾款。
   *
   * 通过会把需求推到「待付尾款」，这里顺手打开支付弹窗；不通过只留档并通知开发者整改。
   */
  async function handleAcceptanceSubmitted(result: AdapayAcceptanceResult) {
    // 组件先派发 `submitted` 再派发 `close`，且派发是同步的：
    // 下面这行必须在任何 await 之前取，否则 `acceptanceTarget` 已被 close 清空。
    const requirementId = acceptanceTarget.value?.requirement_id
    if (!requirementId) {
      return
    }

    await options.reload()
    if (result === 'rejected') {
      return
    }

    const updated = options.myRequirements().find((row) => row.requirement_id === requirementId)
    if (updated) {
      options.openPayModal(updated)
    }
  }

  function openAfterSalesModal(item: RequirementItem) {
    if (!options.isAuthed() || !options.token()) {
      TMessage.error('请先登录后再继续操作')
      return
    }
    if (!canOpenAfterSales(item)) {
      TMessage.warning('只有已结单的需求可以发起解除合作')
      return
    }

    afterSalesTarget.value = item
    afterSalesVisible.value = true
  }

  function closeAfterSalesModal() {
    afterSalesVisible.value = false
    afterSalesTarget.value = null
  }

  function openCommentModal(item: RequirementItem) {
    if (!canComment(item.status)) {
      return
    }
    commentRequirement.value = item
    commentVisible.value = true
  }

  function closeCommentModal() {
    commentVisible.value = false
    commentRequirement.value = null
  }

  const handleCommentSubmitted = () => options.reload()

  // ---- 弹窗挂点：props 与监听在这里拼好，视图只写 `<XxxDialog v-bind="xxxModal" />` ----

  /** 「确认完成」+「取消需求」两个 `.pay-modal` 在同一个组件里（`RequirementConfirmModals`）。 */
  const confirmModals = computed(() => ({
    finalPaymentVisible: finalPaymentVisible.value,
    finalPaymentTarget: finalPaymentTarget.value,
    finalPaymentLoading: finalPaymentConfirmLoading.value,
    cancelVisible: cancelVisible.value,
    cancelTarget: cancelTarget.value,
    cancelLoading: cancelLoading.value,
    onCloseFinalPayment: closeFinalPaymentConfirm,
    onConfirmFinalPayment: confirmFinalPaymentRequest,
    onCloseCancel: closeCancelConfirm,
    onConfirmCancel: submitCancelRequirement,
  }))

  const acceptanceModal = computed(() => ({
    visible: acceptanceVisible.value,
    token: options.token(),
    requirementId: acceptanceTarget.value?.requirement_id ?? '',
    requirementTitle: acceptanceTarget.value?.title ?? '',
    onClose: closeAcceptanceModal,
    onSubmitted: handleAcceptanceSubmitted,
  }))

  const afterSalesModal = computed(() => ({
    visible: afterSalesVisible.value,
    token: options.token(),
    currentUsername: options.username(),
    requirementId: afterSalesTarget.value?.requirement_id ?? '',
    requirementTitle: afterSalesTarget.value?.title ?? '',
    canOpenCase: true,
    onClose: closeAfterSalesModal,
  }))

  /** 评价弹窗的 `visible` 必须同时看「开关」与「目标行」：组件按 `visible` 变 true 回填评分 / 评语。 */
  const commentModal = computed(() => ({
    visible: commentVisible.value && !!commentRequirement.value,
    token: options.token(),
    requirementId: commentRequirement.value?.requirement_id ?? '',
    title: commentRequirement.value?.title ?? '',
    initialRating: commentRequirement.value?.comment_rating ?? null,
    initialText: commentRequirement.value?.comment_text ?? null,
    onClose: closeCommentModal,
    onSubmitted: handleCommentSubmitted,
  }))

  return {
    openCancelConfirm,
    openFinalPaymentConfirm,
    openAcceptanceModal,
    openAfterSalesModal,
    openCommentModal,
    confirmModals,
    acceptanceModal,
    afterSalesModal,
    commentModal,
  }
}
