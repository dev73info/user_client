<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PublishModal from '@/components/PublishModal.vue'
import AfterSalesModal from '@/components/AfterSalesModal.vue'
import AcceptanceDialog from '@/components/AcceptanceDialog.vue'
import InvoiceApplyDialog from '@/components/InvoiceApplyDialog.vue'
import RequirementCommentDialog from '@/components/RequirementCommentDialog.vue'
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import RequirementDownloadPicker from '@/components/requirements/RequirementDownloadPicker.vue'
import RequirementPayModal from '@/components/requirements/RequirementPayModal.vue'
import RequirementPager from '@/components/requirements/RequirementPager.vue'
import RequirementRow from '@/components/requirements/RequirementRow.vue'
import RequirementStrip from '@/components/requirements/RequirementStrip.vue'
import RequirementToolbar from '@/components/requirements/RequirementToolbar.vue'
import RequirementVersionReviewCard from '@/components/requirements/RequirementVersionReviewCard.vue'
import RequirementBreachModal from '@/components/requirements/RequirementBreachModal.vue'
import { HttpError } from '@/api/http'
import {
  downloadPublicMcResourceVersionFile,
  extractResourceFileNameFromUrl,
  type PublicMcResourceVersionItem,
} from '@/api/resources'
import { getResourceDetailSlug } from '@/api/resourceTags'
import { getMyRealnameVerification } from '@/api/realname'
import { createRequirementContract, fetchAsignRequirementPreviewUrl } from '@/api/contracts'
import { type AdapayAcceptanceResult } from '@/api/adapay'
import {
  cancelRequirement as cancelRequirementApi,
  claimRequirementResource as claimRequirementResourceApi,
  createRequirement as createRequirementApi,
  requestRequirementFinalPayment as requestRequirementFinalPaymentApi,
  resubmitRequirement as resubmitRequirementApi,
  reviewRequirementResourceDelete as reviewRequirementResourceDeleteApi,
  updateRequirementResourceVisibility as updateRequirementResourceVisibilityApi,
  updateRequirementSubscription as updateRequirementSubscriptionApi,
  type RequirementItem,
  type RequirementPaymentMode,
  type RequirementPendingResourceVersionDeleteRequest,
} from '@/api/requirements'
import { useClientPagination } from '@/composables/useClientPagination'
import { useMyRequirementsData } from '@/composables/useMyRequirementsData'
import { useRequirementBreach } from '@/composables/useRequirementBreach'
import { useRequirementPayFlow } from '@/composables/useRequirementPayFlow'
import { useResourceDownload } from '@/composables/useResourceDownload'
import { useAuthStore } from '@/stores/auth'
import {
  REQUIREMENT_FILTER_OPTIONS,
  requirementBucketOf,
  summarizeRequirementBuckets,
  type RequirementFilterKey,
} from '@/shared/requirementStatus'
import { describeClaimResourceError } from '@/shared/requirementResourceClaim'
import {
  isRequirementArchived,
  normalizeDevelopmentCycle,
  validateDevelopmentCycleInput,
} from '@/shared/requirementArchive'
import { type RequirementRowActionKey } from '@/shared/requirementRowActions'
import {
  canCancel,
  canClaimResource,
  canComment,
  canOpenAcceptance,
  canOpenAfterSales,
  canPay,
  canResubmit,
  canToggleRequirementResourceVisibility,
  cancelConfirmHint,
  hasBoundResource,
  hasPendingResourceVersionDeleteReview,
  isSelfManagedRequirement,
  nextResourceVisibility,
  pendingResourceVersionDeleteRequests,
  pendingVersionRejectNote,
  publishedVersionCount,
  type RequirementRowFacts,
} from '@/shared/requirementRowRules'
import { validateRequirementRichText } from '@/utils/requirementRichText'

import { TMessage } from 'ui_73info'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
function notify(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  TMessage[type](message)
}
const { triggerDownload } = useResourceDownload()

/**
 * 数据源统一由 `useMyRequirementsData` 持有：列表 / 会话 / 押金比例 / 四张按条 map 都在那边加载，
 * 这边只拿只读 getter 与唯一的写入口 `reload()`。
 *
 * 列表刷新后的收尾（收起已失效的「版本删除审核」展开卡）通过 `onRequirementsLoaded` 注入：
 * 展开态与它的 loading 守卫都在本视图，留在本视图才不会随搬家丢掉。
 */
const {
  myRequirements,
  requirementLoading,
  conversationLoading,
  depositRatioPercent,
  reload,
  loadAfterSalesPending,
  applyConversationDetail,
  signingStatusForRequirement,
  versionsForRequirement,
  invoiceSummaryForRequirement,
  afterSalesPendingCount,
  afterSalesBadgeFor,
} = useMyRequirementsData({ onRequirementsLoaded: pruneStaleVersionDeleteReviewCard })
/**
 * 支付流程整体搬进 `useRequirementPayFlow`：开弹窗、切通道、金额、下单与查单。
 *
 * 两处注入：定金比例来自 `useMyRequirementsData`（settings 接口的唯一口径，这里不重算金额），
 * 「能不能付」按 `canPay` + `rowFacts`（含合同签署事实）在视图判定后传进去。
 * 它**不跳转**：建单后返回要去支付页的 query、云闪付授权返回授权地址，由下面几个视图函数执行导航。
 */
const {
  payVisible,
  payRequirement,
  payChannel,
  payLoading,
  currentPayment,
  isFinalPayment,
  payStageLabel,
  payAmount,
  openPayModal,
  closePayModal,
  updatePayChannel,
  submitPayment,
} = useRequirementPayFlow({
  token: () => auth.token,
  depositRatioPercent: () => depositRatioPercent.value,
  canPayRequirement: (item) => canPay(item, rowFacts(item)),
  onPaid: reload,
})
const commentVisible = ref(false)
const commentRequirement = ref<RequirementItem | null>(null)
const publishVisible = ref(false)
const publishTitle = ref('')
const publishDescription = ref('')
const publishBudget = ref<string | number>('')
const publishAcceptance = ref('')
const publishPaymentMode = ref<RequirementPaymentMode>('self_managed')
/** R014：开发周期（天）——担保需求必填；字符串形态与输入框一致。 */
const publishDevelopmentCycleDays = ref<string | number>('')
const publishLoading = ref(false)
const publishModalRef = ref<InstanceType<typeof PublishModal> | null>(null)
const editModalRef = ref<InstanceType<typeof PublishModal> | null>(null)
const editVisible = ref(false)
const editRequirement = ref<RequirementItem | null>(null)
const editTitle = ref('')
const editDescription = ref('')
const editBudget = ref<string | number>('')
const editAcceptance = ref('')
const editPaymentMode = ref<RequirementPaymentMode>('self_managed')
const editDevelopmentCycleDays = ref<string | number>('')
const editLoading = ref(false)
const requirementSubscriptionLoadingId = ref<string | null>(null)
const resourceVisibilityLoadingId = ref<string | null>(null)
const resourceDownloadingId = ref<number | null>(null)
/** 行内「下载」先弹版本选择：让用户自己挑要哪一版，而不是一律给最新版 */
const downloadPickerRequirement = ref<RequirementItem | null>(null)
const resourceVersionDeleteReviewLoadingId = ref<string | null>(null)
const finalPaymentConfirmVisible = ref(false)
const finalPaymentConfirmTarget = ref<RequirementItem | null>(null)
/** 验收弹窗：担保模式的验收可重复提交，表单与历史留档都在共用组件 `AcceptanceDialog` 里。 */
const acceptanceVisible = ref(false)
const acceptanceTarget = ref<RequirementItem | null>(null)
/** 解除合作：结单后的唯一业务入口，案件列表与表态都在 `AfterSalesModal` 里。 */
const afterSalesVisible = ref(false)
const afterSalesTarget = ref<RequirementItem | null>(null)
const conversationVisible = ref(false)
const conversationRequirement = ref<RequirementItem | null>(null)
/** 获取发票：入口在每条需求的操作栏，弹窗内一次申请开出本需求能开的全部发票。 */
const invoiceDialogVisible = ref(false)
const invoiceRequirement = ref<RequirementItem | null>(null)
const expandedVersionDeleteReviewRequirementId = ref<string | null>(null)
const versionDeleteRejectTargetId = ref<number | null>(null)
const versionDeleteRejectNotes = ref<Record<number, string>>({})
const contractCreatingId = ref('')
const cancelConfirmVisible = ref(false)
const cancelConfirmTarget = ref<RequirementItem | null>(null)
const cancelLoading = ref(false)
// 「转为我的资源」：确认 → 提交中 → 已转换（留一个去开发者工作台的跳转），同一个弹窗按 step 切内容。
const claimConfirmVisible = ref(false)
const claimConfirmTarget = ref<RequirementItem | null>(null)
const claimLoading = ref(false)
const claimStep = ref<'confirm' | 'done'>('confirm')
/**
 * 「解除合作」这一域（案件加载 / 申报 / 撤回 / 表态 / 申请平台介入 / 重新申报）整体搬进
 * `useRequirementBreach`：状态、请求与 toast 都在那边，本视图只把登录身份与**合同签署事实**注进去。
 *
 * `contractOf` 是注入而不是让 composable 自己判断：签约状态只有 `useMyRequirementsData` 的按条 map
 * 持有（见 `rowFacts`），在这里重新判断会出现第二套「有没有合同」的口径（BUG-038）。
 */
const {
  breachVisible,
  breachRequirement,
  breachReason,
  breachLoading,
  breachCase,
  breachCaseLoading,
  breachNewRound,
  platformReviewLoading,
  breachWithdrawLoading,
  breachWithdrawConfirm,
  breachDecisionLoading,
  breachRejectPanel,
  breachDecisionNote,
  breachWithdrawnByMe,
  breachCanRespond,
  breachCanWithdraw,
  breachCanStartNewRound,
  openBreachReport,
  closeBreachReport,
  submitPlatformReview,
  openBreachWithdrawConfirm,
  cancelBreachWithdrawConfirm,
  submitBreachWithdraw,
  reopenBreachReport,
  openBreachRejectPanel,
  cancelBreachRejectPanel,
  submitBreachDecision,
  submitBreachReport,
} = useRequirementBreach({
  token: () => auth.token,
  username: () => auth.username,
  contractOf: (item) => signingStatusForRequirement(item),
})

function syncPublishModalFromRoute(value: unknown) {
  if (value === 'publish' && !publishVisible.value) {
    resetPublishForm()
    publishVisible.value = true
  }
}

/* 三档口径与筛选选项都在 `shared/requirementStatus.ts`：顶部读数条与状态筛选共用一份，
   各写一遍的话同一批需求会算出两个数字。 */
const requirementStats = computed(() => summarizeRequirementBuckets(myRequirements.value))

const keyword = ref('')
const selectedState = ref<RequirementFilterKey>('all')

const filteredRequirements = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase()
  return myRequirements.value.filter((item) => {
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
  if (requirementLoading.value || conversationLoading.value) return
  await reload()
}

/** 版本列表与详情面板共用：选择器要挑版本，入口守卫要数条数。 */
function deliveryVersionsFor(item: RequirementItem) {
  return versionsForRequirement(item) ?? []
}

/**
 * 去账号中心补收款银行卡（结算账户）：中间态的续做靠它，绑完平台自动按现有认定赔付。
 *
 * 跳转留在视图（组件只 emit `bindSettlement`）：弹窗先按常规口径关闭——此时没有请求在跑，
 * `closeBreachReport` 的 loading 守卫不会拦住它。
 */
function goBindSettlementAccount() {
  closeBreachReport()
  void router.push({ name: 'workbench-account', query: { settle: '1' } })
}

/**
 * 一行用到的按条外部事实：合同签署状态、绑定资源的版本列表、可开票汇总。
 *
 * 三张按条 map 只有数据源持有，纯函数层不许再去查一遍（见 `requirementRowRules` 的说明），
 * 所以视图在这里取一次、原样传进行组件与各处守卫，全页只有这一个出口。
 */
function rowFacts(item: RequirementItem): RequirementRowFacts {
  return {
    contract: signingStatusForRequirement(item),
    versions: versionsForRequirement(item),
    invoiceSummary: invoiceSummaryForRequirement(item),
  }
}

function openConversation(item: RequirementItem) {
  conversationRequirement.value = item
  conversationVisible.value = true
}

function openInvoiceDialog(item: RequirementItem) {
  invoiceRequirement.value = item
  invoiceDialogVisible.value = true
}

function openContractSign(item: RequirementItem) {
  router.push({
    name: 'contract-sign',
    query: { requirement_id: item.requirement_id, from: 'user' },
  })
}

/**
 * 「查看合同」跳转到爱签的合同预览页（previewContract）。
 *
 * 合同已在爱签侧发起签署时可获取预览链接；若合同尚未发起爱签签署
 * 或爱签接口异常，则回退到本地合同签署页展示。
 */
async function viewContractPreview(item: RequirementItem) {
  if (auth.token) {
    try {
      const previewUrl = await fetchAsignRequirementPreviewUrl(auth.token, item.requirement_id)
      if (previewUrl) {
        window.location.href = previewUrl
        return
      }
    } catch {
      // 爱签预览不可用：回退本地合同展示。
    }
  }
  openContractSign(item)
}

async function createRequirementContractAction(item: RequirementItem) {
  if (!auth.isAuthed || !auth.token) {
    TMessage.error('请先登录后再继续操作')
    return
  }
  contractCreatingId.value = item.requirement_id
  try {
    await createRequirementContract(auth.token, item.requirement_id)
    // R012：发起后引导到合同页的「自定义合同附件」区；附件经平台审核放行后才能发起签署。
    TMessage.success('合同已发起；如需补充条款，可在合同页准备自定义附件，平台放行后即可签署')
    await reload()
    openContractSign(item)
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '发起合同失败')
  } finally {
    contractCreatingId.value = ''
  }
}

function closeConversation() {
  conversationVisible.value = false
}

/**
 * 需求行上的「主页」要的资源深链 slug（`<作者>--<id>`）。
 * 需求行里没有关联资源的售卖类型与分类段，推不出页内详情需要的
 * `?sale=` / `:rootSlug` / `:entrySlug`，所以统一走 `/resources/:resourceSlug`
 * 这条轻量重定向（见 ResourceDetailRedirectView），由它拉了资源再落到页内详情态。
 */
function boundResourceSlug(item: RequirementItem): string {
  const ownerName =
    item.creator?.trim() || auth.username || item.bound_resource_author?.trim() || item.title
  return getResourceDetailSlug(item.bound_resource_id as number, ownerName)
}

function openBoundResourceHomepage(item: RequirementItem) {
  if (!hasBoundResource(item)) {
    return
  }

  void router.push({
    name: 'resource-detail-direct',
    params: { resourceSlug: boundResourceSlug(item) },
  })
}

/** 行内「下载」：先弹版本选择（版本列表与详情面板共用 deliveryVersionsFor）。 */
function openDownloadPicker(item: RequirementItem) {
  if (!hasBoundResource(item)) {
    return
  }

  if (!deliveryVersionsFor(item).length) {
    TMessage.info('开发者还没有发布可下载的版本')
    return
  }

  downloadPickerRequirement.value = item
}

function closeDownloadPicker() {
  downloadPickerRequirement.value = null
}

/**
 * 下载某一版：选择器只 emit 版本，需求一律取当前选中的那条（弹窗打开时必已存在）。
 * 下载进度条与「准备中...」都靠 `resourceDownloadingId`，需求行那一列的置灰也读它，所以留在视图。
 */
async function downloadRequirementVersion(version: PublicMcResourceVersionItem) {
  const item = downloadPickerRequirement.value
  if (!item || !hasBoundResource(item) || !auth.token) {
    return
  }

  const resourceId = item.bound_resource_id as number
  resourceDownloadingId.value = resourceId
  try {
    await triggerDownload(
      (onProgress) =>
        downloadPublicMcResourceVersionFile(
          resourceId,
          version.id,
          auth.token?.trim() || null,
          onProgress,
        ),
      extractResourceFileNameFromUrl(version.resource, `resource-${resourceId}-${version.version}`),
    )
  } catch (err) {
    TMessage.warning(err instanceof Error ? err.message : '下载资源失败')
  } finally {
    resourceDownloadingId.value = null
  }
}

function openRejectVersion(request: RequirementPendingResourceVersionDeleteRequest) {
  versionDeleteRejectTargetId.value = request.version_id
  versionDeleteRejectNotes.value = {
    ...versionDeleteRejectNotes.value,
    [request.version_id]: versionDeleteRejectNotes.value[request.version_id] ?? '',
  }
}

/** 拒绝原因草稿的写入口：卡片只 emit，record 由视图重建，保持单向数据流。 */
function updateVersionDeleteRejectNote(versionId: number, value: string) {
  versionDeleteRejectNotes.value = { ...versionDeleteRejectNotes.value, [versionId]: value }
}

function cancelRejectVersion() {
  if (resourceVersionDeleteReviewLoadingId.value) {
    return
  }

  versionDeleteRejectTargetId.value = null
}

/** 无担保模式的「确认完成」入口：担保模式的验收与尾款走 accept / pay，不再经过这里。 */
async function requestFinalPayment(item: RequirementItem) {
  if (!auth.isAuthed) {
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

  if (publishedVersionCount(item, rowFacts(item)) <= 0) {
    TMessage.warning('开发者至少发布一个资源版本后，才能确认完成')
    return
  }

  finalPaymentConfirmTarget.value = item
  finalPaymentConfirmVisible.value = true
}

function closeFinalPaymentConfirm() {
  finalPaymentConfirmVisible.value = false
  finalPaymentConfirmTarget.value = null
}

function openCancelConfirm(item: RequirementItem) {
  if (!canCancel(item)) {
    return
  }
  cancelConfirmTarget.value = item
  cancelConfirmVisible.value = true
}

function closeCancelConfirm() {
  if (cancelLoading.value) {
    return
  }
  cancelConfirmVisible.value = false
  cancelConfirmTarget.value = null
}

async function submitCancelRequirement() {
  const item = cancelConfirmTarget.value
  if (!item) {
    return
  }

  cancelLoading.value = true
  try {
    await cancelRequirementApi(auth.token, item.requirement_id)
    TMessage.success('需求已取消')
    cancelConfirmVisible.value = false
    cancelConfirmTarget.value = null
    await reload()
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '取消需求失败')
  } finally {
    cancelLoading.value = false
  }
}

function openClaimConfirm(item: RequirementItem) {
  if (!canClaimResource(item)) {
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
 * 转换成功后的两件刷新：列表（卡片改成「已转为我的资源」、会话变只读）与当前用户角色
 * （后端可能刚补了 `dev`，`/auth/refresh` 会按库里的角色重新签发，不用重新登录就能切开发者工作台）。
 * 角色刷新失败不影响转换结果，只提示一句。
 */
async function submitClaimResource() {
  const item = claimConfirmTarget.value
  if (!item || !auth.token) {
    return
  }

  claimLoading.value = true
  try {
    await claimRequirementResourceApi(auth.token, item.requirement_id)
    TMessage.success('已转为我的资源，可到开发者工作台「资源列表」管理')
    claimStep.value = 'done'
    await reload()
    try {
      await auth.fetchProfile(true)
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
      await reload()
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
  void router.push({ name: 'dev-resource-list' })
}

async function confirmFinalPaymentRequest() {
  if (!finalPaymentConfirmTarget.value) {
    return
  }

  const item = finalPaymentConfirmTarget.value
  // 担保模式的尾款入口已经换成「验收」（见 openAcceptanceModal）：验收通过后由用户自己点支付，
  // 这里只剩无担保模式的「确认完成」——它没有合同与尾款，验收标准由双方线下把关。
  if (!isSelfManagedRequirement(item)) {
    closeFinalPaymentConfirm()
    return
  }

  try {
    await requestRequirementFinalPaymentApi(auth.token, item.requirement_id)
    await reload()
    TMessage.success('需求已确认完成')
    closeFinalPaymentConfirm()
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '结束开发失败')
  }
}

async function openAcceptanceModal(item: RequirementItem) {
  if (!auth.isAuthed || !auth.token) {
    TMessage.error('请先登录后再继续操作')
    return
  }
  if (!canOpenAcceptance(item, rowFacts(item))) {
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
 * 验收通过会把需求推到「待付尾款」，这里顺手打开支付弹窗，用户不用再回列表找入口；
 * 不通过时只留档并通知开发者整改（「待付尾款」上打回会把需求退回开发中，挡住宿尾款）。
 */
async function handleAcceptanceSubmitted(result: AdapayAcceptanceResult) {
  // 组件先派发 `submitted` 再派发 `close`，且派发是同步的：
  // 下面这行必须在任何 await 之前取，否则 `acceptanceTarget` 已被 close 清空。
  const requirementId = acceptanceTarget.value?.requirement_id
  if (!requirementId) {
    return
  }

  await reload()
  if (result === 'rejected') {
    return
  }

  const updated = myRequirements.value.find((row) => row.requirement_id === requirementId)
  if (updated) {
    openPayModal(updated)
  }
}

/** 解除合作入口：结单后打开 `AfterSalesModal`（本页是需求方视角，可发起），案件列表与表态都在弹窗内。 */
function openAfterSalesModal(item: RequirementItem) {
  if (!auth.isAuthed || !auth.token) {
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

async function handleCommentSubmitted() {
  await reload()
}

function openRequirementEditModal(item: RequirementItem) {
  if (!canResubmit(item.status)) {
    return
  }

  editRequirement.value = item
  editTitle.value = item.title
  editDescription.value = item.description ?? ''
  editBudget.value = item.budget ?? ''
  editAcceptance.value = item.acceptance_criteria ?? ''
  editPaymentMode.value = item.payment_mode
  // R014：担保需求回填已填的开发周期；无担保需求后端给 null，输入框显示为空（该模式下也不展示）。
  editDevelopmentCycleDays.value = item.development_cycle_days ?? ''
  editVisible.value = true
}

function publishRedirectTarget() {
  return router.resolve({
    name: 'workbench-requirements',
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
  publishDevelopmentCycleDays.value = ''
}

async function openPublishModal() {
  const approved = await ensurePublishRealnameApproved()
  if (!approved) {
    return
  }

  resetPublishForm()
  publishVisible.value = true
}

function forceClosePublishModal() {
  publishVisible.value = false
  resetPublishForm()
}

function clearPublishModalQuery() {
  if (route.query.modal !== 'publish') {
    return
  }

  const nextQuery = { ...route.query }
  delete nextQuery.modal
  void router.replace({ query: nextQuery })
}

function forceCloseEditModal() {
  editVisible.value = false
  editRequirement.value = null
  editPaymentMode.value = 'self_managed'
  editDevelopmentCycleDays.value = ''
}

function closeEditModal() {
  if (editLoading.value) {
    return
  }
  forceCloseEditModal()
}

function closePublishModal() {
  if (publishLoading.value) {
    return
  }

  forceClosePublishModal()
  clearPublishModalQuery()
}

async function toggleRequirementResourceVisibility(item: RequirementItem) {
  if (!auth.isAuthed || !hasBoundResource(item)) {
    return
  }

  if (!canToggleRequirementResourceVisibility(item)) {
    TMessage.warning(
      isSelfManagedRequirement(item)
        ? '需求完成后才能设置资源为公开或私有'
        : '需求必须在已付尾款后，才能设置资源为公开或私有',
    )
    return
  }

  const visibility = nextResourceVisibility(item)
  resourceVisibilityLoadingId.value = item.requirement_id
  try {
    await updateRequirementResourceVisibilityApi(auth.token, item.requirement_id, { visibility })
    TMessage.success(visibility === 'public' ? '关联资源已提交公开审核' : '关联资源已设为私有')
    await reload()
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '更新资源可见性失败')
  } finally {
    resourceVisibilityLoadingId.value = null
  }
}

async function toggleRequirementSubscription(item: RequirementItem) {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后再设置需求订阅')
    return
  }

  requirementSubscriptionLoadingId.value = item.requirement_id
  const nextValue = !item.subscribe_status_change

  try {
    await updateRequirementSubscriptionApi(auth.token, item.requirement_id, {
      subscribe_status_change: nextValue,
    })
    item.subscribe_status_change = nextValue
    TMessage.success(nextValue ? '已订阅该需求的状态变化' : '已取消该需求的状态变化订阅')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '更新需求订阅失败')
  } finally {
    requirementSubscriptionLoadingId.value = null
  }
}

async function submitVersionDeleteReview(
  item: RequirementItem,
  request: RequirementPendingResourceVersionDeleteRequest,
  action: 'approve' | 'reject',
) {
  if (!auth.isAuthed || !hasPendingResourceVersionDeleteReview(item)) {
    return
  }

  const note = pendingVersionRejectNote(versionDeleteRejectNotes.value, request).trim()

  if (action === 'reject' && note.length > 500) {
    TMessage.error('拒绝原因不能超过 500 字')
    return
  }

  resourceVersionDeleteReviewLoadingId.value = item.requirement_id
  try {
    await reviewRequirementResourceDeleteApi(auth.token, item.requirement_id, {
      version_id: request.version_id,
      action,
      note: note || undefined,
    })
    TMessage.success(action === 'approve' ? '已同意删除版本' : '已拒绝删除版本')
    versionDeleteRejectTargetId.value = null
    if (action === 'reject') {
      const nextNotes = { ...versionDeleteRejectNotes.value }
      delete nextNotes[request.version_id]
      versionDeleteRejectNotes.value = nextNotes
    }
    await reload()
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '审核版本删除失败')
  } finally {
    resourceVersionDeleteReviewLoadingId.value = null
  }
}

async function submitRequirementResubmit() {
  if (!auth.isAuthed || !editRequirement.value) {
    TMessage.error('请先登录后再重新提交需求')
    return
  }

  const normalizedTitle = editTitle.value.trim()
  const descriptionValidation = validateRequirementRichText(editDescription.value, '需求描述', {
    minTextLength: 10,
  })
  const acceptanceValidation = validateRequirementRichText(editAcceptance.value, '验收标准', {
    required: true,
  })
  const budgetRaw = String(editBudget.value ?? '').trim()

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

  // R014：担保需求必填「开发周期（天）」，且必须是正整数；配置下限由后端校验并回中文提示。
  const cycleError = validateDevelopmentCycleInput(
    editDevelopmentCycleDays.value,
    editPaymentMode.value,
  )
  if (cycleError) {
    TMessage.error(cycleError)
    return
  }

  editLoading.value = true
  try {
    await resubmitRequirementApi(auth.token, editRequirement.value.requirement_id, {
      title: normalizedTitle,
      description: descriptionValidation.value,
      budget,
      acceptance_criteria: acceptanceValidation.value,
      payment_mode: editPaymentMode.value,
      development_cycle_days: normalizeDevelopmentCycle(
        editDevelopmentCycleDays.value,
        editPaymentMode.value,
      ),
    })

    TMessage.success('需求已重新提交，等待审核')
    editModalRef.value?.clearDraft(`edit-${editRequirement.value.requirement_id}`)
    forceCloseEditModal()
    await reload()
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '重新提交失败')
  } finally {
    editLoading.value = false
  }
}

async function submitRequirementPublish() {
  const approved = await ensurePublishRealnameApproved()
  if (!approved) {
    return
  }

  const normalizedTitle = publishTitle.value.trim()
  const descriptionValidation = validateRequirementRichText(publishDescription.value, '需求描述', {
    minTextLength: 10,
  })
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

  // R014：担保需求必填「开发周期（天）」，且必须是正整数；配置下限由后端校验并回中文提示。
  const cycleError = validateDevelopmentCycleInput(
    publishDevelopmentCycleDays.value,
    publishPaymentMode.value,
  )
  if (cycleError) {
    TMessage.error(cycleError)
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
      development_cycle_days: normalizeDevelopmentCycle(
        publishDevelopmentCycleDays.value,
        publishPaymentMode.value,
      ),
    })

    TMessage.success('需求已发布，等待审核')
    forceClosePublishModal()
    clearPublishModalQuery()
    publishModalRef.value?.clearDraft()
    await reload()
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '发布失败')
  } finally {
    publishLoading.value = false
  }
}

const finalPaymentConfirmTitle = computed(() => '确认交付完成')
const finalPaymentConfirmTip = computed(
  () => '确认后，当前需求会直接进入已完成状态，后续可继续评价。',
)
const finalPaymentConfirmButton = computed(() => '确认完成')

/**
 * 支付按钮的收尾：**跳转留在视图**。
 *
 * `useRequirementPayFlow` 只返回「去哪儿」——建单成功后返回支付页的 query，
 * 云闪付授权返回要 assign 的授权地址；`router.push` / `window.location.assign` 两种导航都在这里执行，
 * composable 与弹窗组件都不碰路由（与解除合作域的「跳转留在视图」同一分工）。
 */
async function submitRequirementPayment() {
  const outcome = await submitPayment()

  if (outcome.kind === 'redirect-page') {
    void router.push({ name: 'payment', query: outcome.query })
    return
  }

  if (outcome.kind === 'external') {
    window.location.assign(outcome.url)
  }
}

/** 行内动作与菜单项统一从这里分发到既有 handler，不新增业务逻辑。 */
function runRowAction(item: RequirementItem, key: RequirementRowActionKey) {
  switch (key) {
    case 'contract-create':
      void createRequirementContractAction(item)
      return
    case 'contract-sign':
      openContractSign(item)
      return
    case 'contract-view':
      void viewContractPreview(item)
      return
    case 'resubmit':
      openRequirementEditModal(item)
      return
    case 'pay':
      openPayModal(item)
      return
    case 'acceptance':
      void openAcceptanceModal(item)
      return
    case 'finish':
      void requestFinalPayment(item)
      return
    case 'comment':
      openCommentModal(item)
      return
    case 'download':
      openDownloadPicker(item)
      return
    case 'conversation':
      openConversation(item)
      return
    case 'after-sales':
      openAfterSalesModal(item)
      return
    case 'homepage':
      openBoundResourceHomepage(item)
      return
    case 'invoice':
      openInvoiceDialog(item)
      return
    case 'breach':
      void openBreachReport(item)
      return
    case 'cancel':
      openCancelConfirm(item)
      return
    case 'claim-resource':
      openClaimConfirm(item)
      return
    default:
      return
  }
}

/**
 * 整行点击统一打开这条需求的会话：跳到消息中心并带上 `requirement_id`，
 * 由 MessagesView 按这个 query 选中对应会话（见 MessagesView 的 openThreadFromRoute）。
 *
 * 之所以不再做「点行执行当前最该做的动作」：动作入口在行内按钮与「更多」菜单里都有，
 * 整行留给最常用的一件事——看沟通记录；未关联开发者的需求在消息中心会落到「待沟通」分组，
 * 所以不会出现跳过去什么都没有的死角。
 */
function openRequirementConversationPage(item: RequirementItem) {
  void router.push({
    name: 'workbench-messages',
    query: { requirement_id: item.requirement_id },
  })
}

function isVersionDeleteReviewExpanded(item: RequirementItem) {
  return expandedVersionDeleteReviewRequirementId.value === item.requirement_id
}

function toggleVersionDeleteReviewCard(item: RequirementItem) {
  if (!hasPendingResourceVersionDeleteReview(item)) {
    return
  }

  if (isVersionDeleteReviewExpanded(item)) {
    closeVersionDeleteReviewCard()
    return
  }

  expandedVersionDeleteReviewRequirementId.value = item.requirement_id
  versionDeleteRejectTargetId.value = null
}

function closeVersionDeleteReviewCard() {
  if (resourceVersionDeleteReviewLoadingId.value) {
    return
  }

  expandedVersionDeleteReviewRequirementId.value = null
  versionDeleteRejectTargetId.value = null
}

/**
 * 列表刷新后的收尾：展开着的「版本删除审核」卡若已失效（需求没了 / 审核项没了），顺手收起。
 * 由 composable 的 `onRequirementsLoaded` 注入调用——这条副作用原本就挂在 `loadMyRequirements` 末尾。
 */
function pruneStaleVersionDeleteReviewCard() {
  const expandedId = expandedVersionDeleteReviewRequirementId.value
  if (!expandedId) return
  const stillPending = myRequirements.value.some(
    (item) => item.requirement_id === expandedId && hasPendingResourceVersionDeleteReview(item),
  )
  if (!stillPending) closeVersionDeleteReviewCard()
}

onMounted(async () => {
  auth.hydrate()
  // 顺序不能换：列表串行链 / 会话 / 押金比例并发 → 售后角标故意不 await → OAuth 回跳 toast → 清 query。
  await reload()
  // 角标是锦上添花，不 await：列表先画出来，待办数回来再补上。
  void loadAfterSalesPending()

  const oauthResult = typeof route.query.wechat_oauth === 'string' ? route.query.wechat_oauth : ''
  const oauthError =
    typeof route.query.wechat_oauth_error === 'string' ? route.query.wechat_oauth_error : ''
  const unionOauthResult =
    typeof route.query.union_oauth === 'string' ? route.query.union_oauth : ''
  const unionOauthError =
    typeof route.query.union_oauth_error === 'string' ? route.query.union_oauth_error : ''
  if (oauthResult === 'success') {
    TMessage.success('微信授权成功，请再次点击支付')
  } else if (oauthError) {
    TMessage.error(`微信授权失败：${oauthError}`)
  }
  if (unionOauthResult === 'success') {
    payChannel.value = 'union'
    TMessage.success('云闪付授权成功，请再次点击支付')
  } else if (unionOauthError) {
    TMessage.error(`云闪付授权失败：${unionOauthError}`)
  }
  if (oauthResult || oauthError || unionOauthResult || unionOauthError) {
    const nextQuery = { ...route.query }
    delete nextQuery.wechat_oauth
    delete nextQuery.wechat_oauth_error
    delete nextQuery.union_oauth
    delete nextQuery.union_oauth_error
    void router.replace({ query: nextQuery })
  }
})

watch(
  () => route.query.modal,
  (value) => {
    syncPublishModalFromRoute(value)
  },
  { immediate: true },
)
</script>

<template>
  <main class="page-shell custom-page-shell profile-page my-requirements-page">
    <RequirementStrip
      :stats="requirementStats"
      :loading="requirementLoading || conversationLoading"
      @refresh="handleRefresh"
    />

    <section class="wallet-section">
      <RequirementToolbar
        v-model:keyword="keyword"
        v-model:selected-state="selectedState"
        :options="REQUIREMENT_FILTER_OPTIONS"
        :loading="requirementLoading"
        :total-count="myRequirements.length"
        :filtered-count="filteredRequirements.length"
        :has-active-filters="hasActiveFilters"
        @publish="openPublishModal"
        @reset-filters="resetFilters"
      />

      <template v-if="filteredRequirements.length">
        <ul class="wb-list requirement-list">
          <template v-for="item in pagedRequirements" :key="item.requirement_id">
            <RequirementRow
              :item="item"
              :facts="rowFacts(item)"
              :version-review-expanded="isVersionDeleteReviewExpanded(item)"
              :contract-creating="contractCreatingId === item.requirement_id"
              :subscription-loading="requirementSubscriptionLoadingId === item.requirement_id"
              :resource-visibility-loading="resourceVisibilityLoadingId === item.requirement_id"
              :resource-downloading-id="resourceDownloadingId"
              :after-sales-badge="afterSalesBadgeFor(item.requirement_id)"
              :after-sales-pending-count="afterSalesPendingCount(item.requirement_id)"
              @open="openRequirementConversationPage(item)"
              @action="(key) => runRowAction(item, key)"
              @toggle-subscription="toggleRequirementSubscription(item)"
              @toggle-visibility="toggleRequirementResourceVisibility(item)"
              @toggle-version-review="toggleVersionDeleteReviewCard(item)"
            />

            <RequirementVersionReviewCard
              v-if="
                isVersionDeleteReviewExpanded(item) &&
                pendingResourceVersionDeleteRequests(item).length &&
                !isRequirementArchived(item)
              "
              :item="item"
              :review-loading="resourceVersionDeleteReviewLoadingId === item.requirement_id"
              :reject-target-id="versionDeleteRejectTargetId"
              :reject-notes="versionDeleteRejectNotes"
              @close="closeVersionDeleteReviewCard"
              @approve="submitVersionDeleteReview(item, $event, 'approve')"
              @reject="submitVersionDeleteReview(item, $event, 'reject')"
              @open-reject="openRejectVersion"
              @cancel-reject="cancelRejectVersion"
              @update-note="updateVersionDeleteRejectNote"
            />
          </template>
        </ul>

        <RequirementPager v-model:page="page" v-model:page-size="pageSize" :total="filteredTotal" />
      </template>
    </section>

    <PublishModal
      ref="publishModalRef"
      :visible="publishVisible"
      v-model:publishTitle="publishTitle"
      v-model:publishDescription="publishDescription"
      v-model:publishBudget="publishBudget"
      v-model:publishAcceptance="publishAcceptance"
      v-model:publishPaymentMode="publishPaymentMode"
      v-model:publishDevelopmentCycleDays="publishDevelopmentCycleDays"
      :publishLoading="publishLoading"
      :draft-scope="auth.isAuthed ? auth.username : 'default'"
      @close="closePublishModal"
      @notify="notify"
      @submit="submitRequirementPublish"
    />

    <PublishModal
      ref="editModalRef"
      :visible="editVisible"
      modalTitle="重新编辑需求"
      submitText="重新提交审核"
      loadingText="提交中..."
      v-model:publishTitle="editTitle"
      v-model:publishDescription="editDescription"
      v-model:publishBudget="editBudget"
      v-model:publishAcceptance="editAcceptance"
      v-model:publishPaymentMode="editPaymentMode"
      v-model:publishDevelopmentCycleDays="editDevelopmentCycleDays"
      :publishLoading="editLoading"
      :draft-scope="editRequirement ? `edit-${editRequirement.requirement_id}` : ''"
      @close="closeEditModal"
      @notify="notify"
      @submit="submitRequirementResubmit"
    />

    <RequirementConversationModal
      :visible="conversationVisible"
      :token="auth.token"
      :current-username="auth.username"
      :requirement-id="conversationRequirement?.requirement_id ?? ''"
      :title="conversationRequirement?.title"
      @updated="applyConversationDetail"
      @close="closeConversation"
    />

    <InvoiceApplyDialog
      v-model:visible="invoiceDialogVisible"
      :token="auth.token"
      :requirement-id="invoiceRequirement?.requirement_id ?? ''"
      role="customer"
      @submitted="reload"
    />

    <!-- 支付弹窗：原来内嵌在需求详情浮层里，浮层去掉后单独成一个弹窗，
         外壳沿用这页其他确认弹窗的 .pay-modal（尾款确认、取消确认同一套）。
         金额、通道与订单状态来自 `useRequirementPayFlow`；`submit` 后的跳转在本视图执行。 -->
    <RequirementPayModal
      :visible="payVisible"
      :requirement="payRequirement"
      :channel="payChannel"
      :loading="payLoading"
      :order="currentPayment"
      :stage-label="payStageLabel"
      :amount="payAmount"
      :is-final-payment="isFinalPayment"
      :deposit-ratio-percent="depositRatioPercent"
      @close="closePayModal"
      @update:channel="updatePayChannel"
      @submit="submitRequirementPayment"
    />

    <RequirementDownloadPicker
      :requirement="downloadPickerRequirement"
      :versions="downloadPickerRequirement ? deliveryVersionsFor(downloadPickerRequirement) : []"
      :downloading="resourceDownloadingId === downloadPickerRequirement?.bound_resource_id"
      @close="closeDownloadPicker"
      @download="downloadRequirementVersion"
    />

    <div
      v-if="finalPaymentConfirmVisible && finalPaymentConfirmTarget"
      class="modal-wrap"
      @click.self="closeFinalPaymentConfirm"
    >
      <section class="pay-modal" aria-label="尾款确认弹窗">
        <h3>{{ finalPaymentConfirmTitle }}</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ finalPaymentConfirmTarget.title }}</p>
        <p class="pay-line">
          <strong>需求编号：</strong>{{ finalPaymentConfirmTarget.requirement_id }}
        </p>
        <p class="tip">{{ finalPaymentConfirmTip }}</p>

        <div class="actions">
          <button class="ghost" type="button" @click="closeFinalPaymentConfirm">取消</button>
          <button class="ghost primary" type="button" @click="confirmFinalPaymentRequest">
            {{ finalPaymentConfirmButton }}
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="cancelConfirmVisible && cancelConfirmTarget"
      class="modal-wrap"
      @click.self="closeCancelConfirm"
    >
      <section class="pay-modal" aria-label="取消需求弹窗">
        <h3>取消需求单</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ cancelConfirmTarget.title }}</p>
        <p class="pay-line"><strong>需求编号：</strong>{{ cancelConfirmTarget.requirement_id }}</p>
        <p class="tip">{{ cancelConfirmHint(cancelConfirmTarget) }}</p>

        <div class="actions">
          <button class="ghost" type="button" :disabled="cancelLoading" @click="closeCancelConfirm">
            返回
          </button>
          <button
            class="ghost danger"
            type="button"
            :disabled="cancelLoading"
            @click="submitCancelRequirement"
          >
            {{ cancelLoading ? '取消中...' : '确认取消' }}
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="claimConfirmVisible && claimConfirmTarget"
      class="modal-wrap"
      @click.self="closeClaimConfirm"
    >
      <section class="pay-modal" aria-label="转为我的资源弹窗">
        <template v-if="claimStep === 'confirm'">
          <h3>转为我的资源</h3>
          <p class="pay-line"><strong>需求标题：</strong>{{ claimConfirmTarget.title }}</p>
          <p class="pay-line"><strong>需求编号：</strong>{{ claimConfirmTarget.requirement_id }}</p>
          <p v-if="claimConfirmTarget.bound_resource_title" class="pay-line">
            <strong>交付资源：</strong>{{ claimConfirmTarget.bound_resource_title }}
          </p>
          <ul class="claim-notes" aria-label="转换须知">
            <li>
              这一步<strong>不可撤销</strong>：资源归你所有，开发者那边不再把它当作自己的资源。
            </li>
            <li>转换后这笔需求的会话将关闭，双方都不能再发言，但都仍能查看全部历史。</li>
            <li>若你还没有开发者身份，会自动开通，以便在开发者工作台管理该资源。</li>
          </ul>

          <div class="actions">
            <button class="ghost" type="button" :disabled="claimLoading" @click="closeClaimConfirm">
              返回
            </button>
            <button
              class="ghost primary"
              type="button"
              :disabled="claimLoading"
              @click="submitClaimResource"
            >
              {{ claimLoading ? '转换中...' : '确认转换' }}
            </button>
          </div>
        </template>
        <template v-else>
          <h3>已转为我的资源</h3>
          <p class="pay-line"><strong>需求标题：</strong>{{ claimConfirmTarget.title }}</p>
          <p class="tip">
            资源已归入你的名下，会话已关闭（仅供查看）。可以到开发者工作台的「资源列表」继续管理它。
          </p>

          <div class="actions">
            <button class="ghost" type="button" @click="closeClaimConfirm">留在这里</button>
            <button class="ghost primary" type="button" @click="goToDevResourceList">
              去开发者工作台查看
            </button>
          </div>
        </template>
      </section>
    </div>

    <!-- 解除合作：案件进展 / 协商表态 / 判定表态都在组件里，这里只接线状态与动作。
         跳转（绑定收款银行卡）由组件 emit、视图执行，组件不碰 router。 -->
    <RequirementBreachModal
      v-model:breach-reason="breachReason"
      v-model:breach-decision-note="breachDecisionNote"
      :breach-visible="breachVisible"
      :breach-requirement="breachRequirement"
      :breach-case="breachCase"
      :breach-case-loading="breachCaseLoading"
      :breach-loading="breachLoading"
      :breach-new-round="breachNewRound"
      :breach-withdrawn-by-me="breachWithdrawnByMe"
      :breach-can-start-new-round="breachCanStartNewRound"
      :breach-can-respond="breachCanRespond"
      :breach-can-withdraw="breachCanWithdraw"
      :platform-review-loading="platformReviewLoading"
      :breach-withdraw-loading="breachWithdrawLoading"
      :breach-withdraw-confirm="breachWithdrawConfirm"
      :breach-decision-loading="breachDecisionLoading"
      :breach-reject-panel="breachRejectPanel"
      @close="closeBreachReport"
      @submit-report="submitBreachReport"
      @submit-platform-review="submitPlatformReview"
      @open-withdraw-confirm="openBreachWithdrawConfirm"
      @cancel-withdraw-confirm="cancelBreachWithdrawConfirm"
      @submit-withdraw="submitBreachWithdraw"
      @reopen="reopenBreachReport"
      @open-reject-panel="openBreachRejectPanel"
      @cancel-reject-panel="cancelBreachRejectPanel"
      @submit-decision="submitBreachDecision"
      @bind-settlement="goBindSettlementAccount"
    />

    <AcceptanceDialog
      :visible="acceptanceVisible"
      :token="auth.token"
      :requirement-id="acceptanceTarget?.requirement_id ?? ''"
      :requirement-title="acceptanceTarget?.title ?? ''"
      @close="closeAcceptanceModal"
      @submitted="handleAcceptanceSubmitted"
    />

    <AfterSalesModal
      :visible="afterSalesVisible"
      :token="auth.token"
      :current-username="auth.username"
      :requirement-id="afterSalesTarget?.requirement_id ?? ''"
      :requirement-title="afterSalesTarget?.title ?? ''"
      :requirement-budget="afterSalesTarget?.budget ?? null"
      :can-open-case="true"
      @close="closeAfterSalesModal"
    />

    <RequirementCommentDialog
      :visible="commentVisible && !!commentRequirement"
      :token="auth.token"
      :requirement-id="commentRequirement?.requirement_id ?? ''"
      :title="commentRequirement?.title ?? ''"
      :initial-rating="commentRequirement?.comment_rating ?? null"
      :initial-text="commentRequirement?.comment_text ?? null"
      @close="closeCommentModal"
      @submitted="handleCommentSubmitted"
    />
  </main>
</template>

<style scoped>
.my-requirements-page {
  gap: 16px;
}

.my-requirements-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 0 auto;
}

/* 版本选择弹窗：一行一个版本，右侧下载按钮；版本说明用弱字色 */
/* `.download-picker*` 跟着 `RequirementDownloadPicker.vue` 搬去了 `styles/profile.css`
   （组件没有 scoped 块，且这三条规则带裸色值，进组件会变成新的裸色值债）。 */

.requirement-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 「转为我的资源」确认须知：与 .pay-modal .tip 同一浅蓝底，三条分行列出 */
.pay-modal .claim-notes {
  margin: 14px 0 0;
  padding: 10px 12px 10px 28px;
  border-radius: 10px;
  background: rgba(239, 246, 255, 0.9);
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
  text-align: left;
}

.pay-modal .claim-notes li + li {
  margin-top: 4px;
}

.pay-modal .claim-notes strong {
  color: #b45309;
}

@media (max-width: 640px) {
  .my-requirements-header__actions {
    justify-content: stretch;
  }
  .my-requirements-header__actions .ghost.small {
    flex: 1 1 0;
  }
}
</style>
