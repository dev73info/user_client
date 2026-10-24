import { computed, ref } from 'vue'

import {
  claimRequirementResource as claimRequirementResourceApi,
  type RequirementItem,
} from '@/api/requirements'
import type { RequirementConversationDetail } from '@/api/conversations'
import {
  canClaimRequirementResource,
  describeClaimResourceError,
} from '@/shared/requirementResourceClaim'

import { TMessage } from 'ui_73info'

type UseRequirementRowDialogsOptions = {
  token: () => string
  username: () => string
  reload: () => Promise<void>
  /** 会话详情弹窗保存后回写单条会话（`useMyRequirementsData.applyConversationDetail`）。 */
  applyConversationDetail: (detail: RequirementConversationDetail) => void
  /** 转换成功后的角色刷新：后端可能刚补了 `dev`，刷新后不用重新登录就能切开发者工作台。 */
  refreshProfile: () => Promise<void>
  /** 「去开发者工作台资源列表」：路由留在视图，注入成回调。 */
  onGoDevResourceList: () => void
}

/**
 * 需求行上打开的另外三个弹窗：沟通会话、获取发票、转为我的资源。
 *
 * 三者都是「一行 → 一个弹窗」，彼此没有共享状态，所以合成一份而不是各开一个 composable：
 * 每个弹窗仍是独立组件，这里只持有目标行、可见性与请求，并拼好 `v-bind` 对象。
 *
 * 「转为我的资源」是唯一不可撤销的动作，它把 step 也放在这里：
 * 确认 → 提交中 → 已转换（留一个去开发者工作台的跳转），同一个弹窗按 step 切内容。
 */
export function useRequirementRowDialogs(options: UseRequirementRowDialogsOptions) {
  // ---- 沟通会话：整行点击与「会话」按钮都落到这里 ----
  const conversationVisible = ref(false)
  const conversationRequirement = ref<RequirementItem | null>(null)

  function openConversation(item: RequirementItem) {
    conversationRequirement.value = item
    conversationVisible.value = true
  }

  function closeConversation() {
    conversationVisible.value = false
  }

  // ---- 获取发票：一次申请开出本需求能开的全部发票（弹窗内自己取汇总）----
  const invoiceDialogVisible = ref(false)
  const invoiceRequirement = ref<RequirementItem | null>(null)

  function openInvoiceDialog(item: RequirementItem) {
    invoiceRequirement.value = item
    invoiceDialogVisible.value = true
  }

  // ---- 转为我的资源：确认 → 已转换 ----
  const claimConfirmVisible = ref(false)
  const claimConfirmTarget = ref<RequirementItem | null>(null)
  const claimLoading = ref(false)
  const claimStep = ref<'confirm' | 'done'>('confirm')

  function openClaimConfirm(item: RequirementItem) {
    if (!canClaimRequirementResource(item)) {
      return
    }
    claimConfirmTarget.value = item
    claimStep.value = 'confirm'
    claimConfirmVisible.value = true
  }

  function closeClaimConfirm() {
    if (claimLoading.value) {
      return
    }
    claimConfirmVisible.value = false
    claimConfirmTarget.value = null
    claimStep.value = 'confirm'
  }

  /**
   * 转换成功后要刷两样：列表（卡片改成「已转为我的资源」、会话变只读）与当前用户角色。
   * 角色刷新失败不影响转换结果，只提示一句。
   */
  async function submitClaimResource() {
    const item = claimConfirmTarget.value
    const token = options.token()
    if (!item || !token) {
      return
    }

    claimLoading.value = true
    try {
      await claimRequirementResourceApi(token, item.requirement_id)
      TMessage.success('已转为我的资源，可到开发者工作台「资源列表」管理')
      claimStep.value = 'done'
      await options.reload()
      try {
        await options.refreshProfile()
      } catch {
        TMessage.warning('资源已转换，但刷新账号角色失败；若切换工作台不可用，请重新登录')
      }
    } catch (err) {
      const failure = describeClaimResourceError(err)
      if (failure.alreadyClaimed) {
        // 后端说已经转过：按已转换展示即可，不算失败。
        TMessage.info(failure.message)
        claimConfirmVisible.value = false
        claimConfirmTarget.value = null
        await options.reload()
      } else {
        TMessage.error(failure.message)
      }
    } finally {
      claimLoading.value = false
    }
  }

  /** 已转换后的跳转：进开发者工作台的资源列表（路由守卫会按刚刷新的角色放行）。 */
  function goToDevResourceList() {
    claimConfirmVisible.value = false
    claimConfirmTarget.value = null
    claimStep.value = 'confirm'
    options.onGoDevResourceList()
  }

  // ---- 挂点：三个弹窗的 props / 监听 ----
  const conversationModal = computed(() => ({
    visible: conversationVisible.value,
    token: options.token(),
    currentUsername: options.username(),
    requirementId: conversationRequirement.value?.requirement_id ?? '',
    title: conversationRequirement.value?.title,
    onUpdated: options.applyConversationDetail,
    onClose: closeConversation,
  }))

  const invoiceDialog = computed(() => ({
    visible: invoiceDialogVisible.value,
    token: options.token(),
    requirementId: invoiceRequirement.value?.requirement_id ?? '',
    role: 'customer' as const,
    'onUpdate:visible': (value: boolean) => {
      invoiceDialogVisible.value = value
    },
    onSubmitted: options.reload,
  }))

  const claimModal = computed(() => ({
    visible: claimConfirmVisible.value,
    requirement: claimConfirmTarget.value,
    step: claimStep.value,
    loading: claimLoading.value,
    onClose: closeClaimConfirm,
    onConfirm: submitClaimResource,
    onGoDevResourceList: goToDevResourceList,
  }))

  return {
    openConversation,
    openInvoiceDialog,
    openClaimConfirm,
    conversationModal,
    invoiceDialog,
    claimModal,
  }
}
