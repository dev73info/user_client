<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PublishModal from '@/components/PublishModal.vue'
import AfterSalesModal from '@/components/AfterSalesModal.vue'
import AcceptanceDialog from '@/components/AcceptanceDialog.vue'
import InvoiceApplyDialog from '@/components/InvoiceApplyDialog.vue'
import RequirementCommentDialog from '@/components/RequirementCommentDialog.vue'
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import RequirementPager from '@/components/requirements/RequirementPager.vue'
import RequirementRow from '@/components/requirements/RequirementRow.vue'
import RequirementStrip from '@/components/requirements/RequirementStrip.vue'
import RequirementToolbar from '@/components/requirements/RequirementToolbar.vue'
import RequirementVersionReviewCard from '@/components/requirements/RequirementVersionReviewCard.vue'
import WechatAuthorizationModal from '@/components/WechatAuthorizationModal.vue'
import {
  getUnionPaymentAuthorizeUrl,
  isUnionPaymentAuthorizationRequired,
  isWechatPaymentAuthorizationRequired,
} from '@/api/auth'
import { HttpError } from '@/api/http'
import {
  downloadPublicMcResourceVersionFile,
  extractResourceFileNameFromUrl,
  type PublicMcResourceVersionItem,
} from '@/api/resources'
import { getResourceDetailSlug } from '@/api/resourceTags'
import { getMyRealnameVerification } from '@/api/realname'
import { createRequirementContract, fetchAsignRequirementPreviewUrl } from '@/api/contracts'
import {
  createAdapayPayment,
  getAdapayBreachCase,
  getAdapayPayment,
  reportAdapayTermination,
  requestAdapayPlatformReview,
  submitAdapayBreachDecision,
  withdrawAdapayBreach,
  getAdapayClientPlatform,
  type AdapayAcceptanceResult,
  type AdapayBreachCase,
  type AdapayBreachDecisionValue,
  type AdapayBreachVerdictParty,
  type AdapayBreachVerdictSource,
  type AdapayBusinessPayChannel,
  type AdapayPaymentResponse,
} from '@/api/adapay'
import { breachStatusLabel } from '@/shared/breachStatus'
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
import { useResourceDownload } from '@/composables/useResourceDownload'
import { useAuthStore } from '@/stores/auth'
import {
  REQUIREMENT_FILTER_OPTIONS,
  requirementBucketOf,
  summarizeRequirementBuckets,
  type RequirementFilterKey,
} from '@/shared/requirementStatus'
import { formatCnDateTime } from '@/shared/requirementDisplay'
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
  canReportBreach,
  canResubmit,
  canToggleRequirementResourceVisibility,
  cancelConfirmHint,
  formatBudget,
  hasBoundResource,
  hasPendingResourceVersionDeleteReview,
  isAdapayRequirement,
  isRequirementContractSigned,
  isSelfManagedRequirement,
  nextResourceVisibility,
  pendingResourceVersionDeleteRequests,
  pendingVersionRejectNote,
  publishedVersionCount,
  type RequirementRowFacts,
} from '@/shared/requirementRowRules'
import {
  calculateFinalDepositAmount,
  calculateFinalPaymentAmount,
} from '@/shared/requirementPayment'
import { buildAdapayPaymentQuery } from '@/shared/paymentRoute'
import {
  requirementRichTextPlainText,
  validateRequirementRichText,
} from '@/utils/requirementRichText'

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
const payVisible = ref(false)
const payRequirement = ref<RequirementItem | null>(null)
const payChannel = ref<AdapayBusinessPayChannel>('alipay')
const payLoading = ref(false)
type PaymentState = {
  payment_id: string
  requirement_id: string
  channel: string
  amount_cny: number
  status: string
  alipay_order_string?: string
  expires_at: string
  adapay?: boolean
}
const currentPayment = ref<PaymentState | null>(null)
const wechatAuthorizationVisible = ref(false)
const wechatAuthorizationUrl = ref('')
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
const breachVisible = ref(false)
const breachRequirement = ref<RequirementItem | null>(null)
const breachReason = ref('')
const breachLoading = ref(false)
const breachCase = ref<AdapayBreachCase | null>(null)
const breachCaseLoading = ref(false)
/** 已结束的案件走「新一轮申报」时置真：表单与上一轮说明同屏展示，提交会新建一条案件。 */
const breachNewRound = ref(false)
const platformReviewLoading = ref(false)
const breachWithdrawLoading = ref(false)
const breachWithdrawConfirm = ref(false)
const breachDecisionLoading = ref(false)
const breachRejectPanel = ref(false)
const breachDecisionNote = ref('')

/** 责任方文案。 */
function breachLiablePartyLabel(party: AdapayBreachVerdictParty) {
  if (party === 'customer') return '客户（需求方）违约'
  if (party === 'mutual') return '双方协商一致（无责退出）'
  return '开发者违约'
}

/** 表态文案：`null` 表示该方尚未表态。 */
function breachDecisionText(decision?: AdapayBreachDecisionValue | null) {
  if (!decision) {
    return '未表态'
  }
  return decision === 'accepted' ? '已接受 AI 判定' : '不接受 AI 判定'
}

/**
 * 判定来源文案：`mutual` 是双方在案件内自行协商一致结案（没经过客服），
 * 不能和 `support` 一起显示成「客服人工判定」。
 */
function breachVerdictSourceText(source?: AdapayBreachVerdictSource | null) {
  if (source === 'ai') {
    return '双方接受 AI 判定'
  }
  if (source === 'mutual') {
    return '双方协商一致'
  }
  return '客服人工判定'
}

/** 双方表态状态只在 AI 判定后才有意义。 */
function showBreachDecisions(item: AdapayBreachCase) {
  return (
    item.status === 'ai_judged' || item.customerDecision != null || item.developerDecision != null
  )
}

/** 本页是需求方（客户）视角：`customerDecision` 是我方表态，`developerDecision` 是对方表态。 */
function canDecideBreachCase(item: AdapayBreachCase | null) {
  return item?.status === 'ai_judged' && item.customerDecision == null
}

/** 只有协商中（`submitted`）才允许申请平台介入：AI 判定由这个动作触发，出结论后不再重复申请。 */
function canRequestPlatformReview(item: AdapayBreachCase | null) {
  return item?.status === 'submitted'
}

/** 协商阶段：案件在 `submitted` 且双方都还没就「解除合作」表态。 */
function isTerminationNegotiating(item: AdapayBreachCase | null) {
  return item?.status === 'submitted' && !item.mutualAgreedAt && !item.mutualRejectedAt
}

/** 能不能对「解除合作」表态：当事人里不是发起人的那一位。 */
function canRespondTermination(item: AdapayBreachCase | null) {
  return isTerminationNegotiating(item) && item?.reportedBy !== auth.username
}

/** 只有申请人本人能在 AI 判定与客服介入之前撤回自己的申请（后端同样按状态与申请人校验）。 */
function canWithdrawBreachCase(item: AdapayBreachCase | null) {
  return (
    item != null &&
    ['submitted', 'ai_reviewing'].includes(item.status) &&
    item.reportedBy === auth.username
  )
}

/** 上一轮撤回人是不是本人：只有本人撤回才叫「重新申报」，对方撤回时本人是首次申报。 */
const breachWithdrawnByMe = computed(
  () => breachCase.value?.status === 'withdrawn' && breachCase.value.reportedBy === auth.username,
)

/**
 * 无生效合同时不能再发起一轮（BUG-038）：结案（`succeeded`）会作废合同、把需求退回大厅，
 * 此时后端 `load_breach_report_context` 会按「无生效担保合同」直接拒收，界面上不该留一个
 * 点了才报错的按钮。判据用签约状态（后端已把作废合同排除在 `has_contract` 之外），
 * 与需求卡片上的 `canReportBreach` 同一口径。
 */
const breachCanStartNewRound = computed(() => {
  const item = breachRequirement.value
  return (
    item != null && !isSelfManagedRequirement(item) && isRequirementContractSigned(rowFacts(item))
  )
})

/**
 * 撤回后再次申报沿用同一条案件（后端复用该行、案件编号不变），只有驳回 / 结案才会新建案件。
 * 标题与提交按钮都按这个口径措辞，避免出现「标题写新一轮、提示写沿用同一条」的自相矛盾。
 */
function breachDialogTitle() {
  if (!breachNewRound.value && breachCase.value) {
    return '解除合作进展'
  }
  if (breachCase.value?.status === 'withdrawn') {
    return breachWithdrawnByMe.value ? '重新发起解除合作' : '解除合作'
  }
  return breachNewRound.value ? '发起新的解除合作' : '解除合作'
}

function breachSubmitLabel() {
  if (breachCase.value?.status === 'withdrawn') {
    return breachWithdrawnByMe.value ? '重新发起' : '提交解除合作申请'
  }
  return breachNewRound.value ? '发起新一轮解除合作' : '提交解除合作申请'
}

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

function deliveryVersionsFor(item: RequirementItem) {
  return versionsForRequirement(item) ?? []
}

function deliveryVersionNoteText(note?: string | null) {
  return requirementRichTextPlainText(note ?? '')
}

async function openBreachReport(item: RequirementItem) {
  if (!canReportBreach(item, rowFacts(item))) {
    return
  }
  breachRequirement.value = item
  breachReason.value = ''
  breachCase.value = null
  breachNewRound.value = false
  breachVisible.value = true
  breachCaseLoading.value = true
  try {
    breachCase.value = await getAdapayBreachCase(auth.token, item.requirement_id)
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '加载解除合作案件失败')
  } finally {
    breachCaseLoading.value = false
  }
}

function closeBreachReport() {
  if (
    breachLoading.value ||
    platformReviewLoading.value ||
    breachWithdrawLoading.value ||
    breachDecisionLoading.value ||
    breachCaseLoading.value
  ) {
    return
  }
  breachVisible.value = false
  breachRequirement.value = null
  breachReason.value = ''
  breachCase.value = null
  breachNewRound.value = false
  breachRejectPanel.value = false
  breachDecisionNote.value = ''
  breachWithdrawConfirm.value = false
}

/** 去账号中心补收款银行卡（结算账户）：中间态的续做靠它，绑完平台自动按现有认定赔付。 */
function goBindSettlementAccount() {
  breachVisible.value = false
  void router.push({ name: 'workbench-account', query: { settle: '1' } })
}

async function submitPlatformReview() {
  if (!breachCase.value) {
    return
  }
  platformReviewLoading.value = true
  try {
    breachCase.value = await requestAdapayPlatformReview(auth.token, breachCase.value.id)
    TMessage.success('已申请平台介入，等待平台判定')
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '申请平台介入失败')
  } finally {
    platformReviewLoading.value = false
  }
}

/** 撤回是不可撤销动作（撤回后要重新申报），故先要求二次确认。 */
function openBreachWithdrawConfirm() {
  breachWithdrawConfirm.value = true
}

function cancelBreachWithdrawConfirm() {
  if (breachWithdrawLoading.value) {
    return
  }
  breachWithdrawConfirm.value = false
}

async function submitBreachWithdraw() {
  const current = breachCase.value
  if (!current) {
    return
  }
  breachWithdrawLoading.value = true
  try {
    breachCase.value = await withdrawAdapayBreach(auth.token, current.id)
    breachWithdrawConfirm.value = false
    TMessage.success('解除合作申请已撤回，如仍有争议可重新发起')
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '撤回解除合作申请失败')
  } finally {
    breachWithdrawLoading.value = false
  }
}

/**
 * 已结束的案件回到申请表单：结案 / 驳回会新建一条案件，撤回则沿用同一案件重新提交；
 * 两种情况都保留上一轮案件，供表单上方的说明引用。
 */
function reopenBreachReport() {
  breachNewRound.value = true
  breachReason.value = ''
  breachWithdrawConfirm.value = false
}

/** 申请表单上方的「上一轮」说明：讲清楚结论不能翻案，以及本次提交是新建案件还是沿用同一条。 */
function breachRoundHint() {
  const item = breachCase.value
  if (!item) {
    return ''
  }
  if (item.status === 'withdrawn') {
    return breachWithdrawnByMe.value
      ? '上一轮由你撤回，本次提交沿用同一条案件（案件编号不变），申请人与理由以本次提交为准，双方继续跟踪这一条。'
      : '上一轮由对方申请后撤回，本次提交沿用同一条案件（案件编号不变），按你本次提交的事实与依据重新判定。'
  }
  // 结案（`succeeded`）会按「结案即自动解除」作废合同、把需求退回大厅：同一需求上已经没有
  // 可裁决的合同，所以不是「再提一条新案件」而是「重新接单并签约」（BUG-038）。
  if (item.status === 'succeeded') {
    return '上一轮案件已结案，需求已退回大厅、原合同已作废；需重新接单并签约后才能再次发起解除合作。'
  }
  return '上一轮案件已驳回，结论不能翻案；本次提交会新建一条案件，只针对驳回之后新发生的事实。'
}

function openBreachRejectPanel() {
  breachDecisionNote.value = ''
  breachRejectPanel.value = true
}

function cancelBreachRejectPanel() {
  if (breachDecisionLoading.value) {
    return
  }
  breachRejectPanel.value = false
  breachDecisionNote.value = ''
}

async function submitBreachDecision(decision: AdapayBreachDecisionValue) {
  const current = breachCase.value
  if (!current) {
    return
  }
  const negotiating = isTerminationNegotiating(current)
  breachDecisionLoading.value = true
  try {
    breachCase.value = await submitAdapayBreachDecision(
      auth.token,
      current.id,
      decision,
      breachDecisionNote.value.trim(),
    )
    breachRejectPanel.value = false
    breachDecisionNote.value = ''
    const toast = negotiating
      ? decision === 'accepted'
        ? '已同意解除合作，按协商一致处理'
        : '已表示不同意，任一方可申请平台介入'
      : decision === 'accepted'
        ? '已接受 AI 判定，等待对方表态'
        : '已提交不接受，案件转客服人工判定'
    TMessage.success(toast)
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '提交解除合作案件表态失败')
  } finally {
    breachDecisionLoading.value = false
  }
}

async function submitBreachReport() {
  const item = breachRequirement.value
  const reason = breachReason.value.trim()
  if (!item || !reason) {
    TMessage.warning('请填写解除合作的事实和相关依据')
    return
  }
  breachLoading.value = true
  try {
    breachCase.value = await reportAdapayTermination(auth.token, item.requirement_id, reason)
    breachNewRound.value = false
    TMessage.success('解除合作申请已提交，请先与对方协商')
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '提交解除合作申请失败')
  } finally {
    breachLoading.value = false
  }
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

/** 下载绑定资源的最新已发布版本；版本列表在 loadResourceVersions 里已加载，不再单独发请求。 */
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

async function downloadRequirementVersion(
  item: RequirementItem,
  version: PublicMcResourceVersionItem,
) {
  if (!hasBoundResource(item) || !auth.token) {
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

function openPayModal(item: RequirementItem) {
  if (!canPay(item, rowFacts(item))) {
    return
  }
  payRequirement.value = item
  payChannel.value = 'alipay'
  currentPayment.value = null
  payVisible.value = true
}

function updatePayChannel(channel: AdapayBusinessPayChannel) {
  if (payChannel.value === channel) {
    return
  }
  payChannel.value = channel
  currentPayment.value = null
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

function closePayModal() {
  payVisible.value = false
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

function finalDepositAmount(item: RequirementItem) {
  return calculateFinalDepositAmount(item, depositRatioPercent.value)
}

function finalPaymentAmount(item: RequirementItem) {
  return calculateFinalPaymentAmount(item, depositRatioPercent.value)
}

const isFinalPayment = computed(() => payRequirement.value?.status === 'pending_final')
const payStageLabel = computed(() => (isFinalPayment.value ? '尾款' : '定金'))
const payChannelLabel = computed(() => {
  switch (payChannel.value) {
    case 'wechat':
      return '微信'
    case 'union':
      return '云闪付'
    default:
      return '支付宝'
  }
})

const finalPaymentConfirmTitle = computed(() => '确认交付完成')
const finalPaymentConfirmTip = computed(
  () => '确认后，当前需求会直接进入已完成状态，后续可继续评价。',
)
const finalPaymentConfirmButton = computed(() => '确认完成')

const payAmount = computed(() => {
  if (!payRequirement.value) {
    return 0.01
  }
  if (payRequirement.value.status === 'pending_final') {
    return finalPaymentAmount(payRequirement.value)
  }
  return finalDepositAmount(payRequirement.value)
})

async function submitRequirementPayment() {
  if (!payRequirement.value) {
    return
  }

  const requirement = payRequirement.value
  const channel = payChannel.value
  const clientPlatform = getAdapayClientPlatform()
  if (!isAdapayRequirement(requirement)) {
    TMessage.warning('无担保订单不通过平台收款，请由双方按约定自行结算')
    return
  }

  payLoading.value = true
  try {
    if (!currentPayment.value) {
      const adapayPayment: AdapayPaymentResponse = await createAdapayPayment(
        auth.token,
        requirement.requirement_id,
        requirement.status === 'pending_final' ? 'final' : 'deposit',
        channel,
        clientPlatform,
      )
      currentPayment.value = {
        payment_id: adapayPayment.paymentId,
        requirement_id: adapayPayment.requirementId,
        channel,
        amount_cny: Number(adapayPayment.amountCny),
        status: adapayPayment.status,
        alipay_order_string: adapayPayment.payUrl ?? '',
        expires_at: '',
        adapay: true,
      }
      TMessage.success(`${payStageLabel.value}支付订单已生成，正在跳转支付页`)
      router.push({
        name: 'payment',
        query: buildAdapayPaymentQuery({
          paymentId: currentPayment.value.payment_id,
          requirementId: adapayPayment.requirementId,
          channel,
          clientPlatform,
          amountCny: adapayPayment.amountCny,
          qrContent: adapayPayment.payUrl,
        }),
      })
      return
    }

    if (currentPayment.value.adapay) {
      const adapayPayment = await getAdapayPayment(auth.token, currentPayment.value.payment_id)
      if (adapayPayment.status !== 'paid' && adapayPayment.status !== 'confirmed') {
        if (adapayPayment.status === 'failed') {
          currentPayment.value = null
          TMessage.warning('上次支付订单已失效，重新发起支付')
          void submitRequirementPayment()
          return
        }
        TMessage.warning('支付尚未完成，请先完成 Adapay 支付')
        return
      }
      TMessage.success(`${payStageLabel.value}支付确认成功`)
      currentPayment.value = null
      payVisible.value = false
      await reload()
      return
    }

    throw new Error('支付订单状态无效，请重新发起 Adapay 支付')
  } catch (err) {
    if (isWechatPaymentAuthorizationRequired(err)) {
      // 尚未绑定 open_id：直接跳转到支付页（意图模式），由支付页在微信内自动静默授权并下单。
      if (!payRequirement.value) {
        return
      }
      router.push({
        name: 'payment',
        query: buildAdapayPaymentQuery({
          requirementId: payRequirement.value.requirement_id,
          milestone: isFinalPayment.value ? 'final' : 'deposit',
          channel: 'wechat',
          clientPlatform,
          amountCny: payAmount.value,
          intent: true,
        }),
      })
      return
    }
    if (isUnionPaymentAuthorizationRequired(err)) {
      if (clientPlatform !== 'mobile') {
        TMessage.warning('云闪付授权仅适用于移动端，请重新选择支付方式')
        return
      }
      try {
        const authorization = await getUnionPaymentAuthorizeUrl(auth.token, window.location.href)
        if (!authorization.url.trim()) {
          throw new Error('云闪付授权地址为空')
        }
        window.location.assign(authorization.url)
        return
      } catch (authorizationError) {
        TMessage.error(
          authorizationError instanceof Error ? authorizationError.message : '发起云闪付授权失败',
        )
        return
      }
    }

    TMessage.error(err instanceof Error ? err.message : '支付失败')
  } finally {
    payLoading.value = false
  }
}

function closeWechatAuthorization() {
  wechatAuthorizationVisible.value = false
  wechatAuthorizationUrl.value = ''
}

function handleWechatAuthorized() {
  closeWechatAuthorization()
  TMessage.success('微信授权成功，请再次点击支付')
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
         外壳沿用这页其他确认弹窗的 .pay-modal（尾款确认、取消确认同一套）。 -->
    <div v-if="payVisible && payRequirement" class="modal-wrap" @click.self="closePayModal">
      <section class="pay-modal" aria-label="需求支付">
        <h3>支付{{ payStageLabel }}</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ payRequirement.title }}</p>
        <p class="pay-line"><strong>需求编号：</strong>{{ payRequirement.requirement_id }}</p>
        <p class="pay-line">
          <strong>本次应付：</strong>{{ formatBudget(payAmount) }}
          <span v-if="!isFinalPayment"> · 定金占比 {{ depositRatioPercent.toFixed(2) }}%</span>
        </p>
        <p class="tip">
          {{
            currentPayment ? '订单已创建，点下列按钮查询支付结果' : '选择支付方式，付款后回来确认'
          }}
        </p>

        <div class="payment-options" role="radiogroup" aria-label="支付方式选择">
          <button
            type="button"
            class="payment-option"
            :class="{
              active: payChannel === 'alipay',
              'payment-option--alipay': payChannel === 'alipay',
            }"
            @click="updatePayChannel('alipay')"
          >
            <img class="payment-option-icon" src="/icons/alipay.png" alt="支付宝" />
            支付宝
          </button>
          <button
            type="button"
            class="payment-option"
            :class="{
              active: payChannel === 'wechat',
              'payment-option--wechat': payChannel === 'wechat',
            }"
            @click="updatePayChannel('wechat')"
          >
            <img class="payment-option-icon" src="/icons/wechat-pay.png" alt="微信" />
            微信
          </button>
        </div>

        <div class="actions">
          <button class="ghost" type="button" @click="closePayModal">取消</button>
          <button
            class="ghost primary"
            type="button"
            :disabled="payLoading"
            @click="submitRequirementPayment"
          >
            {{
              payLoading ? '处理中...' : currentPayment ? '查询支付结果' : `支付${payStageLabel}`
            }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="downloadPickerRequirement" class="modal-wrap" @click.self="closeDownloadPicker">
      <section class="pay-modal" aria-label="选择下载版本">
        <h3>选择要下载的版本</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ downloadPickerRequirement.title }}</p>
        <ul class="download-picker">
          <li
            v-for="version in deliveryVersionsFor(downloadPickerRequirement)"
            :key="version.id"
            class="download-picker__item"
          >
            <div class="download-picker__meta">
              <strong>{{ version.version }}</strong>
              <small>{{ version.created_at }}</small>
              <p v-if="deliveryVersionNoteText(version.note)">
                {{ deliveryVersionNoteText(version.note) }}
              </p>
            </div>
            <button
              class="ghost small"
              type="button"
              :disabled="resourceDownloadingId === downloadPickerRequirement.bound_resource_id"
              @click="downloadRequirementVersion(downloadPickerRequirement, version)"
            >
              {{
                resourceDownloadingId === downloadPickerRequirement.bound_resource_id
                  ? '准备中...'
                  : '下载'
              }}
            </button>
          </li>
        </ul>
        <div class="actions">
          <button class="ghost" type="button" @click="closeDownloadPicker">关闭</button>
        </div>
      </section>
    </div>

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

    <div
      v-if="breachVisible && breachRequirement"
      class="modal-wrap"
      @click.self="closeBreachReport"
    >
      <section class="pay-modal breach-modal" aria-label="解除合作弹窗">
        <h3>{{ breachDialogTitle() }}</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ breachRequirement.title }}</p>
        <p class="pay-line"><strong>需求编号：</strong>{{ breachRequirement.requirement_id }}</p>
        <p v-if="breachCaseLoading" class="pay-line">正在加载解除合作案件…</p>
        <template v-else-if="breachCase && !breachNewRound">
          <p class="pay-line"><strong>案件编号：</strong>{{ breachCase.caseNo }}</p>
          <p class="pay-line">
            <strong>当前状态：</strong>{{ breachStatusLabel(breachCase.status) }}
          </p>
          <p v-if="breachCase.status === 'withdrawn'" class="pay-line">
            <strong>申请人：</strong>{{ breachWithdrawnByMe ? '我方' : '对方' }}
          </p>
          <p v-if="breachCase.status === 'withdrawn' && breachCase.resolvedAt" class="pay-line">
            <strong>撤回时间：</strong>{{ formatCnDateTime(breachCase.resolvedAt) }}
          </p>
          <p v-if="breachCase.liableParty" class="pay-line">
            <strong>责任认定：</strong>{{ breachLiablePartyLabel(breachCase.liableParty) }}
          </p>
          <p class="pay-line"><strong>申请理由：</strong>{{ breachCase.reason }}</p>
          <template v-if="breachCase.aiJudgedAt || breachCase.aiReasoning">
            <p class="pay-line">
              <strong>AI 判定：</strong
              >{{
                breachCase.aiLiableParty
                  ? breachLiablePartyLabel(breachCase.aiLiableParty)
                  : '无法判定，已转客服人工判定'
              }}
            </p>
            <p v-if="breachCase.aiJudgedAt" class="pay-line">
              <strong>判定时间：</strong>{{ formatCnDateTime(breachCase.aiJudgedAt) }}
            </p>
            <p v-if="breachCase.aiReasoning" class="pay-line">
              <strong>判定理由：</strong>{{ breachCase.aiReasoning }}
            </p>
          </template>
          <p v-if="breachCase.decisionDeadlineAt" class="pay-line">
            <strong>表态截止：</strong>{{ formatCnDateTime(breachCase.decisionDeadlineAt) }}
          </p>
          <template v-if="showBreachDecisions(breachCase)">
            <p class="pay-line">
              <strong>我方表态：</strong>{{ breachDecisionText(breachCase.customerDecision) }}
            </p>
            <p class="pay-line">
              <strong>对方表态：</strong>{{ breachDecisionText(breachCase.developerDecision) }}
            </p>
          </template>
          <p class="pay-line">
            <strong>资金处理：</strong>定金 ¥{{ breachCase.depositAmountCny }} · 已退尾款 ¥{{
              breachCase.refundAmountCny
            }}
            · 赔付 ¥{{ breachCase.compensationAmountCny
            }}<template v-if="breachCase.extraCompensationFen > 0">
              · 额外赔偿 ¥{{ breachCase.extraCompensationCny }}</template
            >
          </p>
          <p v-if="breachCase.verdictSource" class="pay-line">
            <strong>判定来源：</strong>{{ breachVerdictSourceText(breachCase.verdictSource) }}
          </p>
          <p v-if="breachCase.resolutionNote" class="pay-line">
            <strong>处理说明：</strong>{{ breachCase.resolutionNote }}
          </p>

          <!-- 中间态：赔付要打给需求方（本人），但收款结算账户还没就绪，钱落不下来。
               案件不转人工，等绑卡完成后平台自动按现有认定续做——所以这里给一个绑卡入口。 -->
          <template v-if="breachCase.status === 'awaiting_payer_settlement'">
            <p class="tip">
              赔付要打进你的渠道收款账户，但该账户还没就绪（未开通或未绑定收款银行卡），这笔钱暂时落不下来。
              案件已停在「等待需求方补收款账户」，<strong>不转人工</strong>；绑卡成功后平台会自动按现有认定
              续做赔付与退款，到账后可在账号中心提现。
            </p>
            <div class="actions">
              <button class="ghost primary" type="button" @click="goBindSettlementAccount">
                去完成收款银行卡
              </button>
            </div>
          </template>

          <!-- 协商阶段：对方同意即无责退出，不同意才申请平台介入。 -->
          <template v-if="isTerminationNegotiating(breachCase)">
            <p class="tip">
              先协商：对方同意即按协商一致处理——无责退出，定金全额原路退还需求方、无违约金、不产生赔付。
              对方不同意或超时未回应，任一方可申请平台介入。
            </p>
            <label v-if="canRespondTermination(breachCase)" class="pay-line breach-modal__field">
              <strong>同意或不同意的说明</strong>
              <textarea
                v-model="breachDecisionNote"
                rows="3"
                maxlength="1000"
                placeholder="可选：说明你同意或不同意的立场，双方与客服都会看到"
              ></textarea>
            </label>
            <p v-else class="tip">已提交申请，等待对方回应。</p>
          </template>
          <p v-else-if="breachCase.mutualAgreedAt" class="pay-line">
            <strong>协商结果：</strong>双方协商一致（无责退出），{{
              formatCnDateTime(breachCase.mutualAgreedAt)
            }}
          </p>
          <p v-else-if="breachCase.mutualRejectedAt" class="pay-line">
            <strong>协商结果：</strong>对方不同意解除合作（{{
              formatCnDateTime(breachCase.mutualRejectedAt)
            }}），任一方可申请平台介入
          </p>

          <div v-if="canDecideBreachCase(breachCase)" class="breach-modal__decision">
            <p class="pay-line">
              <strong>是否接受：</strong>双方都接受 AI
              判定后平台才会执行退款／赔付；任一方不接受或逾期未全部表态，案件转客服人工判定。
            </p>
            <label v-if="breachRejectPanel" class="pay-line breach-modal__field">
              <strong>不接受的原因</strong>
              <textarea
                v-model="breachDecisionNote"
                rows="3"
                maxlength="1000"
                placeholder="可选：说明不接受该判定的理由，便于客服人工复核"
              ></textarea>
            </label>
            <div class="actions">
              <template v-if="breachRejectPanel">
                <button
                  class="ghost"
                  type="button"
                  :disabled="breachDecisionLoading"
                  @click="cancelBreachRejectPanel"
                >
                  取消
                </button>
                <button
                  class="ghost danger"
                  type="button"
                  :disabled="breachDecisionLoading"
                  @click="submitBreachDecision('rejected')"
                >
                  {{ breachDecisionLoading ? '提交中...' : '确认不接受' }}
                </button>
              </template>
              <template v-else>
                <button
                  class="ghost danger-plain"
                  type="button"
                  :disabled="breachDecisionLoading"
                  @click="openBreachRejectPanel"
                >
                  不接受
                </button>
                <button
                  class="ghost primary"
                  type="button"
                  :disabled="breachDecisionLoading"
                  @click="submitBreachDecision('accepted')"
                >
                  {{ breachDecisionLoading ? '提交中...' : '接受判定' }}
                </button>
              </template>
            </div>
          </div>

          <p
            v-else-if="
              !isTerminationNegotiating(breachCase) &&
              !breachCase.mutualAgreedAt &&
              !breachCase.mutualRejectedAt &&
              (breachCase.status === 'submitted' || breachCase.status === 'ai_reviewing')
            "
            class="tip"
          >
            平台按 AI 判定 + 客服人工审核认定责任方，判定完成后由双方各自选择是否接受。
          </p>

          <div v-if="breachWithdrawConfirm" class="breach-modal__decision">
            <p class="pay-line">
              <strong>确认撤回：</strong
              >撤回后本次申请结束，如仍有争议可在同一需求上重新发起；撤回不会触发任何退款或赔付。
            </p>
            <div class="actions">
              <button
                class="ghost"
                type="button"
                :disabled="breachWithdrawLoading"
                @click="cancelBreachWithdrawConfirm"
              >
                再想想
              </button>
              <button
                class="ghost danger"
                type="button"
                :disabled="breachWithdrawLoading"
                @click="submitBreachWithdraw"
              >
                {{ breachWithdrawLoading ? '撤回中...' : '确认撤回申请' }}
              </button>
            </div>
          </div>

          <div class="actions">
            <button
              class="ghost"
              type="button"
              :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
              @click="closeBreachReport"
            >
              关闭
            </button>
            <button
              v-if="canWithdrawBreachCase(breachCase) && !breachWithdrawConfirm"
              class="ghost danger-plain"
              type="button"
              :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
              @click="openBreachWithdrawConfirm"
            >
              撤回申请
            </button>
            <button
              v-if="breachCase.status === 'withdrawn'"
              class="ghost primary"
              type="button"
              :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
              @click="reopenBreachReport"
            >
              {{ breachWithdrawnByMe ? '重新发起' : '提交解除合作申请' }}
            </button>
            <button
              v-else-if="
                (breachCase.status === 'rejected' || breachCase.status === 'succeeded') &&
                breachCanStartNewRound
              "
              class="ghost primary"
              type="button"
              :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
              @click="reopenBreachReport"
            >
              发起新的解除合作
            </button>
            <button
              v-if="canRequestPlatformReview(breachCase)"
              class="ghost primary"
              type="button"
              :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
              @click="submitPlatformReview"
            >
              {{ platformReviewLoading ? '提交中...' : '申请平台介入' }}
            </button>
            <template v-if="canRespondTermination(breachCase)">
              <button
                class="ghost danger-plain"
                type="button"
                :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
                @click="submitBreachDecision('rejected')"
              >
                {{ breachDecisionLoading ? '提交中...' : '不同意' }}
              </button>
              <button
                class="ghost primary"
                type="button"
                :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
                @click="submitBreachDecision('accepted')"
              >
                {{ breachDecisionLoading ? '提交中...' : '同意解除' }}
              </button>
            </template>
          </div>
          <!-- 上一轮结案会把合同作废、需求退回大厅：这时没有生效合同可依，按钮不给，
               但必须把「为什么不能再发起、要做什么」写清楚，不能让人对着一个结论干瞪眼（BUG-038）。 -->
          <p
            v-if="
              (breachCase.status === 'succeeded' || breachCase.status === 'rejected') &&
              !breachCanStartNewRound
            "
            class="tip"
          >
            {{ breachRoundHint() }}
          </p>
        </template>
        <template v-else>
          <p v-if="breachNewRound" class="tip">{{ breachRoundHint() }}</p>
          <label class="pay-line breach-modal__field">
            <strong>事实与依据</strong>
            <textarea
              v-model="breachReason"
              rows="6"
              maxlength="2000"
              placeholder="请填写时间、已交付内容、沟通记录和希望平台核查的事实"
            ></textarea>
          </label>
          <p class="tip">
            提交后案件进入「协商中」：双方先在案件内协商定金与尾款的退还额度，谈成即直接退款结案；协商不成再由任一方申请平台介入，由审核智能体依据双方会话与材料判定责任方。
          </p>
          <div class="actions">
            <button
              class="ghost"
              type="button"
              :disabled="breachLoading"
              @click="closeBreachReport"
            >
              取消
            </button>
            <button
              class="ghost primary"
              type="button"
              :disabled="breachLoading"
              @click="submitBreachReport"
            >
              {{ breachLoading ? '提交中...' : breachSubmitLabel() }}
            </button>
          </div>
        </template>
      </section>
    </div>

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

    <WechatAuthorizationModal
      :visible="wechatAuthorizationVisible"
      :authorization-url="wechatAuthorizationUrl"
      :token="auth.token"
      @close="closeWechatAuthorization"
      @authorized="handleWechatAuthorized"
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
.download-picker {
  display: grid;
  gap: 10px;
  max-height: 320px;
  margin: 12px 0 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.download-picker__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  border-radius: 10px;
  background: #f8fbff;
}

.download-picker__meta {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.download-picker__meta strong {
  font-size: 13px;
}

.download-picker__meta small,
.download-picker__meta p {
  margin: 0;
  color: var(--profile-text-sub, #64748b);
  font-size: 12px;
  word-break: break-word;
}

.requirement-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pay-modal .breach-modal__field {
  display: grid;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 14px;
}

.pay-modal .breach-modal__field > strong {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

/* 解除合作案件：双方表态（接受 / 不接受）区块 */
.pay-modal .breach-modal__decision {
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid rgba(191, 219, 254, 0.9);
  border-radius: 14px;
  background: rgba(239, 246, 255, 0.72);
}

.pay-modal .breach-modal__decision .pay-line {
  margin-bottom: 0;
}

.pay-modal .breach-modal__decision .actions {
  margin-top: 12px;
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
  .pay-modal .breach-modal__decision .actions .ghost {
    min-height: 44px;
  }
  .pay-modal .breach-modal__decision .actions {
    flex-direction: column;
  }
}
</style>
