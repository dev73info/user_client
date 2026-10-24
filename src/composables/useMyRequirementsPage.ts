import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { RequirementItem } from '@/api/requirements'
import { useClientPagination } from '@/composables/useClientPagination'
import { useMyRequirementsData } from '@/composables/useMyRequirementsData'
import { useRequirementPageActions } from '@/composables/useRequirementPageActions'
import { useRequirementRowOperations } from '@/composables/useRequirementRowOperations'
import { type RequirementRowActionKey } from '@/shared/requirementRowActions'
import {
  canResubmit,
  hasBoundResource,
  type RequirementRowFacts,
} from '@/shared/requirementRowRules'
import {
  requirementBucketOf,
  summarizeRequirementBuckets,
  type RequirementFilterKey,
} from '@/shared/requirementStatus'
import { requirementBoundResourceSlug } from '@/shared/resourceNavigation'
import { useAuthStore } from '@/stores/auth'

import { TMessage } from 'ui_73info'

/**
 * 「我的需求」页的编排层：数据源、行操作、筛选分页、行内动作分发与进页面的收尾。
 *
 * 页面本身只排版（读数条 / 工具栏 / 列表 / 弹窗挂点），动作域都在
 * `useRequirementPageActions` 里总装；这里负责把两者接起来，并守住三条顺序契约：
 *
 * 1. `onMounted`：`await reload()` → `void loadAfterSalesPending()`。角标故意不 await
 *    （列表先画出来，待办数回来再补），顺序反了会让首屏多等一个请求；
 * 2. 列表刷新后清理已失效的「版本删除审核」展开卡：回调注入给数据源，展开态在行操作域，
 *    所以用晚绑定的函数引用（数据源先建、行操作后建）；
 * 3. `?modal=publish` 的打开**不跑实名门禁**：门禁留在用户点提交时再走，免得刚进页面就被踢去实名页。
 */
export function useMyRequirementsPage() {
  const router = useRouter()
  const route = useRoute()
  const auth = useAuthStore()

  // 晚绑定：数据源先于行操作域创建（行操作要读数据源的 getter），而清理回调要调行操作域的函数。
  let pruneStaleVersionDeleteReviewCard = () => {}

  const data = useMyRequirementsData({
    onRequirementsLoaded: () => pruneStaleVersionDeleteReviewCard(),
  })

  /**
   * 一行用到的按条外部事实：合同签署状态、绑定资源的版本列表、可开票汇总。
   *
   * 三张按条 map 只有数据源持有，纯函数层不许再去查一遍（见 `requirementRowRules` 的说明），
   * 所以页面在这里取一次、原样传进行组件与各处守卫，全页只有这一个出口。
   */
  function rowFacts(item: RequirementItem): RequirementRowFacts {
    return {
      contract: data.signingStatusForRequirement(item),
      versions: data.versionsForRequirement(item),
      invoiceSummary: data.invoiceSummaryForRequirement(item),
    }
  }

  const rowOps = useRequirementRowOperations({
    token: () => auth.token,
    isAuthed: () => auth.isAuthed,
    reload: data.reload,
    myRequirements: () => data.myRequirements.value,
    versionsFor: data.versionsForRequirement,
  })
  pruneStaleVersionDeleteReviewCard = rowOps.pruneStaleVersionDeleteReviewCard

  const actions = useRequirementPageActions({ data, rowFacts })

  /* 三档口径与筛选选项都在 `shared/requirementStatus.ts`：顶部读数条与状态筛选共用一份，
     各写一遍的话同一批需求会算出两个数字。 */
  const requirementStats = computed(() => summarizeRequirementBuckets(data.myRequirements.value))

  const keyword = ref('')
  const selectedState = ref<RequirementFilterKey>('all')

  const filteredRequirements = computed(() => {
    const search = keyword.value.trim().toLocaleLowerCase()
    return data.myRequirements.value.filter((item) => {
      const matchesState =
        selectedState.value === 'all' || requirementBucketOf(item.status) === selectedState.value
      const matchesSearch =
        !search ||
        [item.title, item.requirement_id, item.creator].some((value) =>
          value?.toLocaleLowerCase().includes(search),
        )
      return matchesState && matchesSearch
    })
  })

  const hasActiveFilters = computed(
    () => keyword.value.trim() !== '' || selectedState.value !== 'all',
  )

  /* 一次取回全部需求单、筛选在前端做，所以用客户端分页（与其余菜单页同一套每页条数口径）。 */
  const {
    page,
    pageSize,
    total: filteredTotal,
    paged: pagedRequirements,
    resetPage,
  } = useClientPagination(filteredRequirements)

  /* 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。 */
  watch([keyword, selectedState], resetPage)

  function resetFilters() {
    keyword.value = ''
    selectedState.value = 'all'
  }

  /** 读数条上的刷新：列表或会话在跑就不重复发，避免连点叠出两批请求。 */
  async function handleRefresh() {
    if (data.requirementLoading.value || data.conversationLoading.value) return
    await data.reload()
  }

  /**
   * 需求行上的「主页」：跳 `/resources/:resourceSlug` 这条轻量重定向（见 ResourceDetailRedirectView），
   * 由它拉了资源再落到页内详情态——需求行里没有售卖类型与分类段，推不出页内详情的参数。
   */
  function openBoundResourceHomepage(item: RequirementItem) {
    if (!hasBoundResource(item)) {
      return
    }

    void router.push({
      name: 'resource-detail-direct',
      params: { resourceSlug: requirementBoundResourceSlug(item, auth.username) },
    })
  }

  /**
   * 整行点击统一打开这条需求的会话：跳到消息中心并带上 `requirement_id`，
   * 由 MessagesView 按这个 query 选中对应会话。动作入口在行内按钮与「更多」菜单里都有，
   * 整行留给最常用的一件事——看沟通记录。
   */
  function openRequirementConversationPage(item: RequirementItem) {
    void router.push({
      name: 'workbench-messages',
      query: { requirement_id: item.requirement_id },
    })
  }

  /** 行内「重新编辑」入口：先过 `canResubmit`（状态不允许就直接不弹），回填与显示交给编辑实例。 */
  function openRequirementEditModal(item: RequirementItem) {
    if (!canResubmit(item.status)) {
      return
    }

    void actions.openRequirementEditForm(item)
  }

  /** 行内动作与菜单项统一从这里分发到既有 handler，不新增业务逻辑。 */
  function runRowAction(item: RequirementItem, key: RequirementRowActionKey) {
    switch (key) {
      case 'contract-create':
        void actions.createContract(item)
        return
      case 'contract-sign':
        actions.openContractSign(item)
        return
      case 'contract-view':
        void actions.viewContractPreview(item)
        return
      case 'resubmit':
        openRequirementEditModal(item)
        return
      case 'pay':
        actions.openPayModal(item)
        return
      case 'acceptance':
        void actions.openAcceptanceModal(item)
        return
      case 'finish':
        void actions.openFinalPaymentConfirm(item)
        return
      case 'comment':
        actions.openCommentModal(item)
        return
      case 'download':
        rowOps.openDownloadPicker(item)
        return
      case 'conversation':
        actions.openConversation(item)
        return
      case 'after-sales':
        actions.openAfterSalesModal(item)
        return
      case 'homepage':
        openBoundResourceHomepage(item)
        return
      case 'invoice':
        actions.openInvoiceDialog(item)
        return
      case 'breach':
        void actions.openBreachReport(item)
        return
      case 'cancel':
        actions.openCancelConfirm(item)
        return
      case 'claim-resource':
        actions.openClaimConfirm(item)
        return
      default:
        return
    }
  }

  onMounted(async () => {
    auth.hydrate()
    // 顺序不能换：列表串行链 / 会话 / 押金比例并发 → 售后角标故意不 await → OAuth 回跳 toast → 清 query。
    await data.reload()
    // 角标是锦上添花，不 await：列表先画出来，待办数回来再补上。
    void data.loadAfterSalesPending()

    const oauthResult = typeof route.query.wechat_oauth === 'string' ? route.query.wechat_oauth : ''
    const oauthError =
      typeof route.query.wechat_oauth_error === 'string' ? route.query.wechat_oauth_error : ''
    if (oauthResult === 'success') {
      TMessage.success('微信授权成功，请再次点击支付')
    } else if (oauthError) {
      TMessage.error(`微信授权失败：${oauthError}`)
    }
    if (oauthResult || oauthError) {
      const nextQuery = { ...route.query }
      delete nextQuery.wechat_oauth
      delete nextQuery.wechat_oauth_error
      void router.replace({ query: nextQuery })
    }
  })

  /** `?modal=publish` 直接进页面时自动开弹窗；已经在弹窗里就不再重开。 */
  watch(
    () => route.query.modal,
    (value) => {
      if (value === 'publish' && !actions.publishVisible.value) {
        actions.openPublishModalFromRoute()
      }
    },
    { immediate: true },
  )

  return {
    ...data,
    ...rowOps,
    ...actions,
    requirementStats,
    keyword,
    selectedState,
    filteredRequirements,
    hasActiveFilters,
    page,
    pageSize,
    filteredTotal,
    pagedRequirements,
    resetFilters,
    handleRefresh,
    rowFacts,
    runRowAction,
    openRequirementConversationPage,
  }
}
