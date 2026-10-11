<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRoute, useRouter } from 'vue-router'
import PublishModal from '@/components/PublishModal.vue'
import AfterSalesModal from '@/components/AfterSalesModal.vue'
import AcceptanceDialog from '@/components/AcceptanceDialog.vue'
import InvoiceApplyDialog from '@/components/InvoiceApplyDialog.vue'
import PaymentModeChip from '@/components/PaymentModeChip.vue'
import RequirementCommentDialog from '@/components/RequirementCommentDialog.vue'
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
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
  listPublicMcResourceVersions,
  type PublicMcResourceVersionItem,
} from '@/api/resources'
import { getResourceDetailSlug, getTagRouteSlug } from '@/api/resourceTags'
import { getMyRealnameVerification } from '@/api/realname'
import { getInvoiceSummary } from '@/api/invoices'
import { listMyAfterSalesCases } from '@/api/afterSales'
import { afterSalesBadgeText, isAwaitingViewerAction } from '@/shared/afterSalesStatus'
import {
  listRequirementConversations,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@/api/conversations'
import { createRequirementContract, fetchAsignRequirementPreviewUrl, fetchContractSigningStatus, type ContractSigningStatus } from '@/api/contracts'
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
import { invoiceEntryState, type InvoiceSummaryMap } from '@/shared/invoiceAvailability'
import {
  cancelRequirement as cancelRequirementApi,
  claimRequirementResource as claimRequirementResourceApi,
  createRequirement as createRequirementApi,
  listRequirements,
  requestRequirementFinalPayment as requestRequirementFinalPaymentApi,
  resubmitRequirement as resubmitRequirementApi,
  reviewRequirementResourceDelete as reviewRequirementResourceDeleteApi,
  updateRequirementResourceVisibility as updateRequirementResourceVisibilityApi,
  updateRequirementSubscription as updateRequirementSubscriptionApi,
  type RequirementItem,
  type RequirementPaymentMode,
  type RequirementPendingResourceVersionDeleteRequest,
  type RequirementResourceVisibility,
  type RequirementStatus,
} from '@/api/requirements'
import { getDepositRatio } from '@/api/settings'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useResourceDownload } from '@/composables/useResourceDownload'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { formatCnDateTime } from '@/shared/requirementDisplay'
import {
  canClaimRequirementResource,
  describeClaimResourceError,
  isRequirementResourceClaimed,
} from '@/shared/requirementResourceClaim'
import {
  canClaimResourceWhileLocked,
  isRequirementArchived,
  isRequirementCleared,
  normalizeDevelopmentCycle,
  requirementArchiveBanner,
  requirementLockRemainingDays,
  validateDevelopmentCycleInput,
} from '@/shared/requirementArchive'
import {
  calculateFinalDepositAmount,
  calculateFinalPaymentAmount,
} from '@/shared/requirementPayment'
import { buildAdapayPaymentQuery } from '@/shared/paymentRoute'
import {
  requirementRichTextPlainText,
  validateRequirementRichText,
} from '@/utils/requirementRichText'


import {
  TButton,
  TDropdown,
  TDropdownItem,
  TDropdownMenu,
  TIcon,
  TInput,
  TOption,
  TPagination,
  TSelect,
  ArrowDown,
  Refresh,
  RefreshLeft,
  Search,
} from 'ui_73info'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { showToast } = useToast()
const { triggerDownload } = useResourceDownload()

const requirementLoading = ref(false)
const myRequirements = ref<RequirementItem[]>([])
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
const conversationLoading = ref(false)
/** 获取发票：入口在每条需求的操作栏，弹窗内一次申请开出本需求能开的全部发票。 */
const invoiceDialogVisible = ref(false)
const invoiceRequirement = ref<RequirementItem | null>(null)
/**
 * 每条需求的可开票汇总，只用来决定「更多」里的「获取发票」灰不灰。
 *
 * 拿不到（还没回来 / 那次请求失败）时不写值，`invoiceEntryState` 会当作可点：开不出票的原因
 * 由弹窗里的汇总说明，入口不该因为一次预取失败就显得像丢了。
 */
const invoiceSummaryMap = ref<InvoiceSummaryMap>({})
const requirementConversationMap = ref<Record<string, RequirementConversation>>({})
const expandedVersionDeleteReviewRequirementId = ref<string | null>(null)
const versionDeleteRejectTargetId = ref<number | null>(null)
const versionDeleteRejectNotes = ref<Record<number, string>>({})
const depositRatioPercent = ref(20)
const contractSigningStatusMap = ref<Record<string, ContractSigningStatus | null>>({})
const contractCreatingId = ref('')
const resourceVersionsMap = ref<Record<string, PublicMcResourceVersionItem[]>>({})
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
    item.status === 'ai_judged' ||
    item.customerDecision != null ||
    item.developerDecision != null
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
  return (
    item?.status === 'submitted' && !item.mutualAgreedAt && !item.mutualRejectedAt
  )
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
  return item != null && !isSelfManagedRequirement(item) && isRequirementContractSigned(item)
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

/** 需求状态在这一页归到三个档位，每个状态都有归属，不留「其它」：
    - 审核中：待审核、已驳回（驳回后改了可再提审）
    - 开发中：待签署 / 待付定金、定金已付待开发、开发中、待付尾款（「待签署」没有独立状态，落在待付定金里）
    - 已完成：尾款已付待分账、已完成（含可评价）、已取消（终态）
    顶部读数条与状态筛选共用这一个定义：两边各写一遍的话，同一批需求会算出两个数字。 */
type RequirementBucket = 'pending' | 'active' | 'completed'

function bucketOf(status: RequirementStatus): RequirementBucket {
  switch (status) {
    case 'pending_review':
    case 'rejected':
      return 'pending'
    case 'pending_deposit':
    case 'deposit_paid':
    case 'in_development':
    case 'pending_final':
      return 'active'
    case 'pending_settlement':
    case 'completed':
    case 'cancelled':
      return 'completed'
  }
}

function countBucket(bucket: RequirementBucket) {
  return myRequirements.value.filter((item) => bucketOf(item.status) === bucket).length
}

const requirementStats = computed(() => ({
  total: myRequirements.value.length,
  active: countBucket('active'),
  pending: countBucket('pending'),
  completed: countBucket('completed'),
}))

/* 状态筛选走下拉（统一层 .wb-toolbar__field + el-select）：档位与顶部读数条同口径，
   条数直接写进选项文案里。几档合计在上面读数条已经报过一遍，所以收起时只显示当前口径也不丢信息。 */
type RequirementFilterKey = 'all' | RequirementBucket

const states: { value: RequirementFilterKey; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '审核中' },
  { value: 'active', label: '开发中' },
  { value: 'completed', label: '已完成' },
]

const keyword = ref('')
const selectedState = ref<RequirementFilterKey>('all')

/* 读数在加载中不报数：重新加载会先清空列表，直接显示 0 会被读成「一条需求都没有」。 */
function stripValue(count: number) {
  return requirementLoading.value ? '—' : String(count)
}

const filteredRequirements = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase()
  return myRequirements.value.filter((item) => {
    const matchesState = selectedState.value === 'all' || bucketOf(item.status) === selectedState.value
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

/** 刷新按钮只有一个图标，加载态与说明都靠 aria-label / title 承载。 */
const refreshButtonLabel = computed(() =>
  requirementLoading.value || conversationLoading.value ? '刷新中...' : '刷新',
)

/** 状态徽标的语义档：与统一层 .wb-badge 的四档（成功 / 警示 / 危险 / 主色）一一对应。
    此前全表只有一支琥珀胶囊，已完成与已驳回看起来是一回事，扫列表时看不出轻重。 */
function statusBadgeClass(item: RequirementItem) {
  if (isWaitingContractSign(item)) return 'wb-badge--warning'
  if (item.status === 'completed') return 'wb-badge--success'
  if (item.status === 'rejected' || item.status === 'cancelled') return 'wb-badge--danger'
  if (
    item.status === 'deposit_paid' ||
    item.status === 'in_development' ||
    item.status === 'pending_final' ||
    item.status === 'pending_settlement'
  ) {
    return 'wb-badge--accent'
  }
  return 'wb-badge--warning'
}

/** 状态文案走全站统一口径；`deposit_paid` 一码两义，拿到支付模式就传进去（见 `requirementStatusLabel`）。 */
function formatRequirementStatus(status: RequirementStatus, paymentMode?: RequirementPaymentMode) {
  return requirementStatusLabel(status, paymentMode)
}

function isWaitingContractSign(item: RequirementItem) {
  // 无担保模式（self_managed）不需要合同签署
  if (isSelfManagedRequirement(item)) {
    return false
  }
  const status = signingStatusForRequirement(item)
  return Boolean(
    (item.status === 'pending_deposit' || item.status === 'deposit_paid') &&
    status?.has_contract &&
    (!status.party_a_signed || !status.party_b_signed),
  )
}

function formatRequirementDisplayStatus(item: RequirementItem) {
  if (!isSelfManagedRequirement(item) && item.status === 'pending_deposit') {
    if (!hasBoundResource(item)) {
      return '待开发者接单'
    }
    if (!isRequirementContractSigned(item)) {
      return '待签合同'
    }
    return '待付定金'
  }
  return isWaitingContractSign(item) ? '待签合同' : formatRequirementStatus(item.status, item.payment_mode)
}

function isSelfManagedRequirement(item: RequirementItem) {
  return item.payment_mode === 'self_managed'
}

function isAdapayRequirement(item: RequirementItem) {
  return item.payment_mode === 'platform_guarantee'
}

function formatRequirementTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '刚刚更新'
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBudget(value?: number | null) {
  if (value == null) {
    return '待议价'
  }
  return `¥${value.toFixed(2)}`
}

function canPay(status: RequirementStatus, item?: RequirementItem) {
  if (item && isSelfManagedRequirement(item)) {
    return false
  }
  if (item && !isRequirementContractSigned(item)) {
    return false
  }

  return status === 'pending_deposit' || status === 'pending_final'
}

// 交付版本 = 绑定资源项目的资源版本，直接复用资源项目版本接口（见方案 B）。
function publishedVersionCount(item: RequirementItem) {
  const versions = resourceVersionsMap.value[item.requirement_id]
  return versions ? versions.length : (item.bound_resource_version_count ?? 0)
}

function deliveryVersionsFor(item: RequirementItem) {
  return resourceVersionsMap.value[item.requirement_id] ?? []
}

/** 交付版本摘要。只报版本数与最新版本号：到货时间在需求详情里看，卡片上再挂一串时间只是噪音。 */
function latestDeliveryVersionLabel(item: RequirementItem) {
  const latest = deliveryVersionsFor(item)[0]
  return latest ? `（最新 ${latest.version}）` : ''
}

function deliveryVersionNoteText(note?: string | null) {
  return requirementRichTextPlainText(note ?? '')
}

function canRequestFinalPayment(item: RequirementItem) {
  // 无担保模式（self_managed）完成无需合同已签；仅担保模式需要双方已签合同
  const contractSigned = isSelfManagedRequirement(item) || isRequirementContractSigned(item)
  return (
    hasBoundResource(item) &&
    item.status === 'in_development' &&
    publishedVersionCount(item) > 0 &&
    contractSigned
  )
}

function requirementFinalActionLabel(item: RequirementItem) {
  return isSelfManagedRequirement(item) ? '确认完成' : '支付尾款'
}

function canResubmit(status: RequirementStatus) {
  // 与后端一致：被驳回的需求改完可以再提；过审后撤回（已取消）的需求同样保留着，也能改完重新提交审核。
  return status === 'rejected' || status === 'cancelled'
}

function canCancel(item: RequirementItem) {
  // 与后端一致（P10）：担保模式停在「已缴定金」时，取消会把托管定金全额原路退还并顺带解绑，
  // 所以这一档不再要求「没有被接单」；其余档位仍是「未接单 + 处于可取消状态」。
  // 自管模式过审即「待开发者接单」（deposit_paid），同样允许撤回。
  if (item.status === 'deposit_paid') {
    return true
  }
  return (
    !hasBoundResource(item) &&
    (item.status === 'pending_review' ||
      item.status === 'rejected' ||
      item.status === 'pending_deposit')
  )
}

/** 取消确认文案：取消一律保留为「已取消」终态（P9 之后不再物理删除），可以改完重新提交审核。 */
function cancelConfirmHint(item: RequirementItem) {
  if (item.status === 'deposit_paid' && !isSelfManagedRequirement(item)) {
    return '取消后该需求单保留为「已取消」，托管定金将全额原路退还；开发者已占用的资源会随之释放。'
  }
  return '取消后该需求单保留为「已取消」，可以重新编辑后再提交审核。'
}

/** 待分账提示：尾款缴清到渠道分账之间有等待期。结单后的保证金说明已去掉。 */
function settlementHint(item: RequirementItem): string {
  if (item.status === 'pending_settlement') {
    return '尾款已缴，渠道分账中（通常 7 天），完成后结单并开放解除合作。'
  }
  return ''
}

function canReportBreach(item: RequirementItem) {
  // 待分账（尾款已缴、分账在排队）也允许解除合作：等待期内的违约由后端取消排队中的分账。
  // 待接单（`pending_deposit`）里含「已签约未缴定金」：甲方拒缴定金同样是违约，可以申报，
  // 那种案件没有支付单、只作责任认定；尚未签合同时后端按「无生效合同」拒掉，入口不给——
  // 结案回滚把需求打回待接单、合同同时作废，也正落在这条上（BUG-038）。
  return item.payment_mode !== 'self_managed' &&
    ['pending_deposit', 'deposit_paid', 'in_development', 'pending_final', 'pending_settlement'].includes(item.status) &&
    (item.status !== 'pending_deposit' || isRequirementContractSigned(item))
}

async function openBreachReport(item: RequirementItem) {
  if (!canReportBreach(item)) {
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
    showToast(error instanceof Error ? error.message : '加载解除合作案件失败', 'error')
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
    showToast('已申请平台介入，等待平台判定', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '申请平台介入失败', 'error')
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
    showToast('解除合作申请已撤回，如仍有争议可重新发起', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '撤回解除合作申请失败', 'error')
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
    showToast(toast, 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交解除合作案件表态失败', 'error')
  } finally {
    breachDecisionLoading.value = false
  }
}

async function submitBreachReport() {
  const item = breachRequirement.value
  const reason = breachReason.value.trim()
  if (!item || !reason) {
    showToast('请填写解除合作的事实和相关依据', 'warning')
    return
  }
  breachLoading.value = true
  try {
    breachCase.value = await reportAdapayTermination(auth.token, item.requirement_id, reason)
    breachNewRound.value = false
    showToast('解除合作申请已提交，请先与对方协商', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交解除合作申请失败', 'error')
  } finally {
    breachLoading.value = false
  }
}

function hasBoundResource(item: RequirementItem) {
  return item.bound_resource_id != null
}

/**
 * R014：归档（锁定 / 清除）横幅。未归档时 `title` 为空串，模板据此不渲染横幅。
 * 判定与文案都在 `shared/requirementArchive.ts`，页面只调用。
 */
function archiveBanner(item: RequirementItem) {
  return requirementArchiveBanner(item)
}

/** R014：锁定剩余天数文案（未锁定返回空串）。 */
function lockRemainingText(item: RequirementItem) {
  const days = requirementLockRemainingDays(item)
  return days == null ? '' : `约剩 ${days} 天`
}

function openConversation(item: RequirementItem) {
  conversationRequirement.value = item
  conversationVisible.value = true
}

function openInvoiceDialog(item: RequirementItem) {
  invoiceRequirement.value = item
  invoiceDialogVisible.value = true
}

function signingStatusForRequirement(item: RequirementItem) {
  return contractSigningStatusMap.value[item.requirement_id] ?? null
}

function isRequirementContractSigned(item: RequirementItem) {
  const status = signingStatusForRequirement(item)
  return Boolean(
    status?.party_a_signed &&
      status.party_b_signed,
  )
}

function canOpenContractSign(item: RequirementItem) {
  // 无担保模式（self_managed）不提供合同签署入口
  if (isSelfManagedRequirement(item)) {
    return false
  }
  return Boolean(signingStatusForRequirement(item)?.has_contract)
}

// 我方已签时该入口只是「查看合同」，未签时是「签署合同」，前者按查看类弱化显示。
function isContractButtonViewOnly(item: RequirementItem) {
  return Boolean(signingStatusForRequirement(item)?.party_a_signed)
}

function contractStatusHint(item: RequirementItem) {
  // 无担保模式（self_managed）不需要合同，不显示合同状态提示
  if (isSelfManagedRequirement(item)) {
    return ''
  }
  const status = signingStatusForRequirement(item)
  if (!status?.has_contract) return ''

  // 「可支付定金」只在还停在待付定金这一步时才成立。合同双方签完后是既成事实，
  // 需求还在开发中 / 待付尾款 / 已完成时再挂着「合同已签署」只是噪音，直接不显示。
  const awaitingDeposit = item.status === 'pending_deposit'
  if (status.party_a_signed && status.party_b_signed) {
    return awaitingDeposit ? '合同已签署，可支付定金' : ''
  }
  if (status.party_a_signed) {
    return awaitingDeposit ? '等待开发者签署合同，双方签完后可支付定金' : '等待开发者签署合同'
  }
  if (status.party_b_signed) {
    return awaitingDeposit ? '待您签署合同，签完后可支付定金' : '待您签署合同'
  }
  // R012：合同页多了「自定义合同附件」。不提示这句，双方会直接签平台模板，事后要改就得作废重签。
  // 附件只是条款补充，资金与期限仍按需求单与平台规则执行。
  return '双方均可进入合同页签署；如需补充条款，可先上传或拟定自定义附件，经平台审核放行后再签'
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

/**
 * 担保模式下，开发者接单后合同不再自动生成，需由需求方或开发者主动发起。
 */
function canCreateRequirementContract(item: RequirementItem) {
  if (isSelfManagedRequirement(item)) {
    return false
  }
  if (!hasBoundResource(item)) {
    return false
  }
  if (item.status !== 'pending_deposit' && item.status !== 'deposit_paid') {
    return false
  }
  return !signingStatusForRequirement(item)?.has_contract
}

async function createRequirementContractAction(item: RequirementItem) {
  if (!auth.isAuthed || !auth.token) {
    showToast('请先登录后再继续操作', 'error')
    return
  }
  contractCreatingId.value = item.requirement_id
  try {
    await createRequirementContract(auth.token, item.requirement_id)
    // R012：发起后引导到合同页的「自定义合同附件」区；附件经平台审核放行后才能发起签署。
    showToast('合同已发起；如需补充条款，可在合同页准备自定义附件，平台放行后即可签署', 'success')
    await loadContractSigningStatuses(myRequirements.value)
    openContractSign(item)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发起合同失败', 'error')
  } finally {
    contractCreatingId.value = ''
  }
}

function closeConversation() {
  conversationVisible.value = false
}

function applyConversationDetail(payload: RequirementConversationDetail) {
  requirementConversationMap.value = {
    ...requirementConversationMap.value,
    [payload.conversation.requirement_id]: payload.conversation,
  }
}

async function loadRequirementConversations() {
  if (!auth.token.trim()) {
    requirementConversationMap.value = {}
    return
  }

  conversationLoading.value = true
  try {
    const conversations = await listRequirementConversations(auth.token)
    requirementConversationMap.value = Object.fromEntries(
      conversations.map((item) => [item.requirement_id, item]),
    )
  } catch (error) {
    requirementConversationMap.value = {}
    showToast(error instanceof Error ? error.message : '加载沟通会话失败', 'error')
  } finally {
    conversationLoading.value = false
  }
}

function currentResourceVisibility(item: RequirementItem): RequirementItem['resource_visibility'] {
  return item.resource_visibility ?? null
}

function canToggleRequirementResourceVisibility(item: RequirementItem) {
  return hasBoundResource(item) && item.status === 'completed'
}

function hasPendingResourceVersionDeleteReview(item: RequirementItem) {
  return hasBoundResource(item) && pendingResourceVersionDeleteRequests(item).length > 0
}

function pendingResourceVersionDeleteRequests(item: RequirementItem) {
  return item.pending_resource_version_delete_requests ?? []
}

function pendingResourceVersionLabel(item?: RequirementPendingResourceVersionDeleteRequest | null) {
  return item?.version?.trim() || '未命名版本'
}

function pendingResourceVersionTitle(item?: RequirementPendingResourceVersionDeleteRequest | null) {
  return `版本号 ${pendingResourceVersionLabel(item)}`
}

/**
 * 拒绝过版本删除时回显理由。
 *
 * 待审核状态改由行内那枚「待审核」胶囊 + 右侧按钮表达，不再用一整行散文说「点哪里可以审核」，
 * 所以这里只负责拒绝理由（散文文案独占一行，见 .requirement-note--block）。
 */
function versionDeleteRejectNote(item: RequirementItem) {
  return item.resource_version_delete_review_note
    ? `你上次拒绝删除版本：${item.resource_version_delete_review_note}`
    : ''
}

function formatResourceVisibility(item: RequirementItem) {
  const visibility = currentResourceVisibility(item)
  if (visibility === 'public') {
    return '公开'
  }

  return visibility === 'review' ? '审核中' : '私有'
}

function requirementSubscriptionLabel(item: RequirementItem) {
  return item.subscribe_status_change ? '取消订阅' : '订阅'
}

/**
 * 只有当前是私有才提交公开审核，其余（已公开、审核中）都切回私有：
 * 审核中点一下即撤回，避免公开申请卡在审核队列里没有出口。
 */
function nextResourceVisibility(item: RequirementItem): RequirementResourceVisibility {
  return currentResourceVisibility(item) === 'private' ? 'public' : 'private'
}

function toggleResourceVisibilityLabel(item: RequirementItem) {
  if (currentResourceVisibility(item) === 'review') {
    return '审核中'
  }

  return nextResourceVisibility(item) === 'public' ? '公开' : '私有'
}

/**
 * 需求行上的「主页」需要拼资源详情路由，标签口径沿用原「我的定制」页：
 * 主标签 / 次标签取 group_path 的前两级（次标签缺失时回退平台），别名优先于原名。
 */
function boundResourceRouteSlugs(item: RequirementItem) {
  const tagSelections = item.bound_resource_tag_selections ?? []
  const rootName = tagSelections.find((entry) => entry.group_path.length > 0)?.group_path[0] ?? ''
  const entryName =
    tagSelections.find((entry) => entry.group_path.length > 1)?.group_path[1] ??
    (item.bound_resource_platform || '')
  const rootAlias =
    tagSelections.find((entry) => (entry.group_path_aliases?.length ?? 0) > 0)
      ?.group_path_aliases?.[0] ?? ''
  const entryAlias =
    tagSelections.find((entry) => (entry.group_path_aliases?.length ?? 0) > 1)
      ?.group_path_aliases?.[1] ?? ''
  const ownerName =
    item.creator?.trim() || auth.username || item.bound_resource_author?.trim() || item.title

  return {
    rootSlug: rootAlias || getTagRouteSlug(rootName),
    entrySlug: entryAlias || getTagRouteSlug(entryName),
    resourceSlug: getResourceDetailSlug(item.bound_resource_id as number, ownerName),
  }
}

function openBoundResourceHomepage(item: RequirementItem) {
  if (!hasBoundResource(item)) {
    return
  }

  const { rootSlug, entrySlug, resourceSlug } = boundResourceRouteSlugs(item)

  // 关联资源没有标签选择（历史数据未回填）时，分类段会拼成空字符串，
  // 直接 push 进带分类的详情路由会抛 `Missing required param "rootSlug"`。
  // 这种情况退回只需要资源 slug 的直达路由 `/resources/:resourceSlug`，主页照样能打开。
  if (!rootSlug || !entrySlug) {
    void router.push({ name: 'resource-detail-direct', params: { resourceSlug } })
    return
  }

  void router.push({ name: 'resource-detail', params: { rootSlug, entrySlug, resourceSlug } })
}

/** 下载绑定资源的最新已发布版本；版本列表在 loadResourceVersions 里已加载，不再单独发请求。 */
/** 行内「下载」：先弹版本选择（版本列表与详情面板共用 deliveryVersionsFor）。 */
function openDownloadPicker(item: RequirementItem) {
  if (!hasBoundResource(item)) {
    return
  }

  if (!deliveryVersionsFor(item).length) {
    showToast('开发者还没有发布可下载的版本', 'info')
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
        downloadPublicMcResourceVersionFile(resourceId, version.id, auth.token?.trim() || null, onProgress),
      extractResourceFileNameFromUrl(version.resource, `resource-${resourceId}-${version.version}`),
    )
  } catch (err) {
    showToast(err instanceof Error ? err.message : '下载资源失败', 'warning')
  } finally {
    resourceDownloadingId.value = null
  }
}

function isRejectingVersion(request: RequirementPendingResourceVersionDeleteRequest) {
  return versionDeleteRejectTargetId.value === request.version_id
}

function openRejectVersion(request: RequirementPendingResourceVersionDeleteRequest) {
  versionDeleteRejectTargetId.value = request.version_id
  versionDeleteRejectNotes.value = {
    ...versionDeleteRejectNotes.value,
    [request.version_id]: versionDeleteRejectNotes.value[request.version_id] ?? '',
  }
}

function cancelRejectVersion() {
  if (resourceVersionDeleteReviewLoadingId.value) {
    return
  }

  versionDeleteRejectTargetId.value = null
}

function pendingVersionRejectNote(request: RequirementPendingResourceVersionDeleteRequest) {
  return versionDeleteRejectNotes.value[request.version_id] ?? ''
}

function formatPendingVersionRequestedAt(item: RequirementPendingResourceVersionDeleteRequest) {
  return item.requested_at?.trim() || '时间未知'
}

function openPayModal(item: RequirementItem) {
  if (!canPay(item.status, item)) {
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
    showToast('请先登录后再继续操作', 'error')
    return
  }

  if (!hasBoundResource(item)) {
    showToast('当前需求尚未关联资源项目', 'warning')
    return
  }

  if (item.status !== 'in_development') {
    showToast('只有开发中的需求单才能确认完成', 'warning')
    return
  }

  if (publishedVersionCount(item) <= 0) {
    showToast('开发者至少发布一个资源版本后，才能确认完成', 'warning')
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
    showToast('需求已取消', 'success')
    cancelConfirmVisible.value = false
    cancelConfirmTarget.value = null
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '取消需求失败', 'error')
  } finally {
    cancelLoading.value = false
  }
}

/** 入口显示条件与后端前置一致：已结单 + 有交付资源 + 未转换（判定在 shared/requirementResourceClaim.ts）。 */
function canClaimResource(item: RequirementItem) {
  return canClaimRequirementResource(item)
}

function isResourceClaimed(item: RequirementItem) {
  return isRequirementResourceClaimed(item)
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
    showToast('已转为我的资源，可到开发者工作台「资源列表」管理', 'success')
    claimStep.value = 'done'
    await loadMyRequirements()
    try {
      await auth.fetchProfile(true)
    } catch {
      showToast('资源已转换，但刷新账号角色失败；若切换工作台不可用，请重新登录', 'warning')
    }
  } catch (err) {
    const failure = describeClaimResourceError(err)
    if (failure.alreadyClaimed) {
      // 后端说已经转过：按已转换展示即可，不算失败。
      showToast(failure.message, 'info')
      claimConfirmVisible.value = false
      claimConfirmTarget.value = null
      await loadMyRequirements()
    } else {
      showToast(failure.message, 'error')
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
    await loadMyRequirements()
    showToast('需求已确认完成', 'success')
    closeFinalPaymentConfirm()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '结束开发失败', 'error')
  }
}

/**
 * 担保模式的验收入口：开发中与待付尾款都能提交。
 *
 * 验收可重复提交——不通过会留档并通知开发者整改：「开发中」留在原状态；
 * 「待付尾款」会退回「开发中」并挡住宿尾款（后端 `accept_delivery` 的 rolling_back 分支），
 * 开发者整改后重新验收通过才谈尾款。
 */
function canOpenAcceptance(item: RequirementItem) {
  if (isSelfManagedRequirement(item) || !isRequirementContractSigned(item)) {
    return false
  }
  if (!hasBoundResource(item)) {
    return false
  }
  if (item.status !== 'in_development' && item.status !== 'pending_final') {
    return false
  }
  return publishedVersionCount(item) > 0
}

async function openAcceptanceModal(item: RequirementItem) {
  if (!auth.isAuthed || !auth.token) {
    showToast('请先登录后再继续操作', 'error')
    return
  }
  if (!canOpenAcceptance(item)) {
    showToast('当前需求还不能验收，请确认双方已签合同且开发者已提交交付版本', 'warning')
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

  await loadMyRequirements()
  if (result === 'rejected') {
    return
  }

  const updated = myRequirements.value.find((row) => row.requirement_id === requirementId)
  if (updated) {
    openPayModal(updated)
  }
}

/** 解除合作入口：只有担保模式的需求有解除合作（结单后仍需冻结接单保证金、且尾款能原路退回）。 */
function canOpenAfterSales(item: RequirementItem) {
  return item.status === 'completed' && !isSelfManagedRequirement(item)
}

/** 解除合作入口：结单后打开 `AfterSalesModal`（本页是需求方视角，可发起），案件列表与表态都在弹窗内。 */
function openAfterSalesModal(item: RequirementItem) {
  if (!auth.isAuthed || !auth.token) {
    showToast('请先登录后再继续操作', 'error')
    return
  }
  if (!canOpenAfterSales(item)) {
    showToast('只有已结单的需求可以发起解除合作', 'warning')
    return
  }

  afterSalesTarget.value = item
  afterSalesVisible.value = true
}

function closeAfterSalesModal() {
  afterSalesVisible.value = false
  afterSalesTarget.value = null
}

function canComment(status: RequirementStatus) {
  return status === 'completed'
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
  await loadMyRequirements()
}

function formatCommentSummary(rating: number, text?: string | null) {
  const score = `${rating.toFixed(1)} 分`
  const body = text?.trim() ?? ''
  // 纯数字文案多半是脏数据（评分/信用分误写入），不当作评语展示
  if (!body || /^\d+(\.\d+)?$/.test(body) || body.length < 2) {
    return score
  }
  return `${score} · ${body}`
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
    showToast('发布需求前请先登录', 'info')
    openAuthLogin()
    return false
  }

  try {
    const record = await getMyRealnameVerification(auth.token)
    if (record.status === 'approved') {
      return true
    }

    if (record.status === 'pending') {
      showToast('实名认证审核中，通过后可发布需求', 'warning')
      return false
    }

    showToast('实名认证未通过，请重新提交后再发布需求', 'warning')
    void router.push({
      name: 'workbench-realname',
      query: { redirect_to: redirectTarget },
    })
    return false
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      showToast('发布需求前请先完成实名认证', 'warning')
      void router.push({
        name: 'workbench-realname',
        query: { redirect_to: redirectTarget },
      })
      return false
    }

    showToast(err instanceof Error ? err.message : '实名认证状态校验失败', 'error')
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
    showToast(
      isSelfManagedRequirement(item)
        ? '需求完成后才能设置资源为公开或私有'
        : '需求必须在已付尾款后，才能设置资源为公开或私有',
      'warning',
    )
    return
  }

  const visibility = nextResourceVisibility(item)
  resourceVisibilityLoadingId.value = item.requirement_id
  try {
    await updateRequirementResourceVisibilityApi(auth.token, item.requirement_id, { visibility })
    showToast(
      visibility === 'public' ? '关联资源已提交公开审核' : '关联资源已设为私有',
      'success',
    )
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '更新资源可见性失败', 'error')
  } finally {
    resourceVisibilityLoadingId.value = null
  }
}

async function toggleRequirementSubscription(item: RequirementItem) {
  if (!auth.isAuthed) {
    showToast('请先登录后再设置需求订阅', 'error')
    return
  }

  requirementSubscriptionLoadingId.value = item.requirement_id
  const nextValue = !item.subscribe_status_change

  try {
    await updateRequirementSubscriptionApi(auth.token, item.requirement_id, {
      subscribe_status_change: nextValue,
    })
    item.subscribe_status_change = nextValue
    showToast(nextValue ? '已订阅该需求的状态变化' : '已取消该需求的状态变化订阅', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '更新需求订阅失败', 'error')
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

  const note = pendingVersionRejectNote(request).trim()

  if (action === 'reject' && note.length > 500) {
    showToast('拒绝原因不能超过 500 字', 'error')
    return
  }

  resourceVersionDeleteReviewLoadingId.value = item.requirement_id
  try {
    await reviewRequirementResourceDeleteApi(auth.token, item.requirement_id, {
      version_id: request.version_id,
      action,
      note: note || undefined,
    })
    showToast(action === 'approve' ? '已同意删除版本' : '已拒绝删除版本', 'success')
    versionDeleteRejectTargetId.value = null
    if (action === 'reject') {
      const nextNotes = { ...versionDeleteRejectNotes.value }
      delete nextNotes[request.version_id]
      versionDeleteRejectNotes.value = nextNotes
    }
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '审核版本删除失败', 'error')
  } finally {
    resourceVersionDeleteReviewLoadingId.value = null
  }
}

async function submitRequirementResubmit() {
  if (!auth.isAuthed || !editRequirement.value) {
    showToast('请先登录后再重新提交需求', 'error')
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
    showToast('需求标题至少 4 个字符', 'error')
    return
  }

  if (descriptionValidation.error) {
    showToast(descriptionValidation.error, 'error')
    return
  }

  if (!budgetRaw) {
    showToast('预算不能为空', 'error')
    return
  }

  const budget = Number(budgetRaw)

  if (Number.isNaN(budget) || budget < 0) {
    showToast('预算必须是大于等于0的数字', 'error')
    return
  }

  if (acceptanceValidation.error) {
    showToast(acceptanceValidation.error, 'error')
    return
  }

  // R014：担保需求必填「开发周期（天）」，且必须是正整数；配置下限由后端校验并回中文提示。
  const cycleError = validateDevelopmentCycleInput(editDevelopmentCycleDays.value, editPaymentMode.value)
  if (cycleError) {
    showToast(cycleError, 'error')
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
      development_cycle_days: normalizeDevelopmentCycle(editDevelopmentCycleDays.value, editPaymentMode.value),
    })

    showToast('需求已重新提交，等待审核', 'success')
    editModalRef.value?.clearDraft(`edit-${editRequirement.value.requirement_id}`)
    forceCloseEditModal()
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '重新提交失败', 'error')
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
    showToast('需求标题至少 4 个字符', 'error')
    return
  }

  if (descriptionValidation.error) {
    showToast(descriptionValidation.error, 'error')
    return
  }

  if (!budgetRaw) {
    showToast('预算不能为空', 'error')
    return
  }

  const budget = Number(budgetRaw)

  if (!Number.isFinite(budget) || budget < 0) {
    showToast('预算必须是大于等于0的数字', 'error')
    return
  }

  if (acceptanceValidation.error) {
    showToast(acceptanceValidation.error, 'error')
    return
  }

  // R014：担保需求必填「开发周期（天）」，且必须是正整数；配置下限由后端校验并回中文提示。
  const cycleError = validateDevelopmentCycleInput(publishDevelopmentCycleDays.value, publishPaymentMode.value)
  if (cycleError) {
    showToast(cycleError, 'error')
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
      development_cycle_days: normalizeDevelopmentCycle(publishDevelopmentCycleDays.value, publishPaymentMode.value),
    })

    showToast('需求已发布，等待审核', 'success')
    forceClosePublishModal()
    clearPublishModalQuery()
    publishModalRef.value?.clearDraft()
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发布失败', 'error')
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
const finalPaymentConfirmTip = computed(() => '确认后，当前需求会直接进入已完成状态，后续可继续评价。')
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

async function loadDepositRatio() {
  auth.hydrate()
  if (!auth.isAuthed) {
    return
  }

  try {
    const payload = await getDepositRatio(auth.token)

    if (!payload) {
      return
    }

    if (Number.isFinite(payload.deposit_ratio_percent)) {
      depositRatioPercent.value = payload.deposit_ratio_percent
    }
  } catch {
    // Keep the default deposit ratio when settings API is unavailable.
  }
}

async function loadMyRequirements() {
  auth.hydrate()
  if (!auth.isAuthed) {
    myRequirements.value = []
    return
  }

  requirementLoading.value = true
  try {
    const rows = await listRequirements(auth.token)
    // 不截断：列表页要能点进任何一条需求（此前 `slice(0, 20)` 让第 21 条起从列表消失，
    // 连解除合作弹窗都进不去）。下方的合同签署状态与资源版本查询是按条发起的，
    // ponytail: 请求数随需求数线性增长（N 条 ≈ 2N 个请求），需求很多时页面会变慢；
    // 上限的真正解法是服务端分页 + 批量状态接口，等 `/requirement/mine` 支持分页再做。
    myRequirements.value = rows
    // 不 await：菜单灰不灰不影响列表先画出来，汇总回来再补上禁用态。
    void loadInvoiceSummaries(myRequirements.value)
    await loadContractSigningStatuses(myRequirements.value)
    await loadResourceVersions(myRequirements.value)
    if (
      expandedVersionDeleteReviewRequirementId.value &&
      !myRequirements.value.some(
        (item) =>
          item.requirement_id === expandedVersionDeleteReviewRequirementId.value &&
          hasPendingResourceVersionDeleteReview(item),
      )
    ) {
      closeVersionDeleteReviewCard()
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载需求单失败', 'error')
  } finally {
    requirementLoading.value = false
  }
}

async function loadResourceVersions(items: RequirementItem[]) {
  auth.hydrate()
  if (!auth.token) {
    resourceVersionsMap.value = {}
    return
  }

  const boundItems = items.filter((item) => item.bound_resource_id != null)
  const entries = await Promise.allSettled(
    boundItems.map(async (item) => ({
      requirementId: item.requirement_id,
      versions: await listPublicMcResourceVersions(item.bound_resource_id as number, auth.token),
    })),
  )
  const map: Record<string, PublicMcResourceVersionItem[]> = {}
  for (const entry of entries) {
    if (entry.status === 'fulfilled') {
      map[entry.value.requirementId] = entry.value.versions
    }
  }
  resourceVersionsMap.value = map
}

async function refreshMyRequirements() {
  if (requirementLoading.value || conversationLoading.value) {
    return
  }

  await Promise.all([loadMyRequirements(), loadRequirementConversations(), loadDepositRatio()])
}

async function loadContractSigningStatuses(items: RequirementItem[]) {
  if (!auth.token || items.length === 0) {
    contractSigningStatusMap.value = {}
    return
  }

  // 无担保模式（self_managed）不需要合同，无需查询合同签署状态
  const guaranteedItems = items.filter((item) => item.payment_mode !== 'self_managed')

  const entries = await Promise.allSettled(
    guaranteedItems.map((item) =>
      fetchContractSigningStatus(auth.token, item.requirement_id).then((status) => ({
        requirementId: item.requirement_id,
        status,
      })),
    ),
  )
  const map: Record<string, ContractSigningStatus | null> = {}
  for (const entry of entries) {
    if (entry.status === 'fulfilled') {
      map[entry.value.requirementId] = entry.value.status
    }
  }
  contractSigningStatusMap.value = map
}

/**
 * 拉取「获取发票」的可点性依据：只查担保模式，无担保模式压根没有资金流（由 `invoiceEntryState`
 * 直接判死，不必发请求）。
 *
 * ponytail: 与上面的合同签署状态一样是按条请求，菜单灰不灰要等它回来才知道；上限的真正解法同样
 * 是服务端分页 + 批量汇总接口，等 `/invoices/summary` 支持一次问多条再做。
 */
async function loadInvoiceSummaries(items: RequirementItem[]) {
  if (!auth.token || items.length === 0) {
    invoiceSummaryMap.value = {}
    return
  }

  const guaranteedItems = items.filter((item) => item.payment_mode !== 'self_managed')

  const entries = await Promise.allSettled(
    guaranteedItems.map((item) =>
      getInvoiceSummary(auth.token, item.requirement_id).then((summary) => ({
        requirementId: item.requirement_id,
        summary,
      })),
    ),
  )
  const map: InvoiceSummaryMap = {}
  for (const entry of entries) {
    if (entry.status === 'fulfilled') {
      map[entry.value.requirementId] = entry.value.summary
    }
  }
  invoiceSummaryMap.value = map
}

async function submitRequirementPayment() {
  if (!payRequirement.value) {
    return
  }

  const requirement = payRequirement.value
  const channel = payChannel.value
  const clientPlatform = getAdapayClientPlatform()
  if (!isAdapayRequirement(requirement)) {
    showToast('无担保订单不通过平台收款，请由双方按约定自行结算', 'warning')
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
      showToast(`${payStageLabel.value}支付订单已生成，正在跳转支付页`, 'success')
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
          showToast('上次支付订单已失效，重新发起支付', 'warning')
          void submitRequirementPayment()
          return
        }
        showToast('支付尚未完成，请先完成 Adapay 支付', 'warning')
        return
      }
      showToast(`${payStageLabel.value}支付确认成功`, 'success')
      currentPayment.value = null
      payVisible.value = false
      await loadMyRequirements()
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
        showToast('云闪付授权仅适用于移动端，请重新选择支付方式', 'warning')
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
        showToast(
          authorizationError instanceof Error ? authorizationError.message : '发起云闪付授权失败',
          'error',
        )
        return
      }
    }

    showToast(err instanceof Error ? err.message : '支付失败', 'error')
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
  showToast('微信授权成功，请再次点击支付', 'success')
}

/**
 * 需求行操作区分四层展示：开关芯片（订阅 / 公开）、行内常用动作（下载 / 沟通 / 解除合作）、
 * 唯一主操作、以及低频动作的「更多」菜单。
 *
 * 下面这些函数只做展示分组，能不能做仍然由既有的 canXxx / hasXxx 守卫函数决定，
 * 展示层不重复实现业务判定，避免两处规则漂移。
 */
type RequirementRowActionKey =
  | 'contract-create'
  | 'contract-sign'
  | 'contract-view'
  | 'resubmit'
  | 'pay'
  | 'acceptance'
  | 'finish'
  | 'comment'
  | 'download'
  | 'conversation'
  | 'after-sales'
  | 'homepage'
  | 'invoice'
  | 'breach'
  | 'cancel'
  | 'claim-resource'

type RequirementRowAction = {
  key: RequirementRowActionKey
  label: string
  danger?: boolean
  disabled?: boolean
  title?: string
}

/** 合同入口全行只有一个：无合同→发起，我方未签→签署，已签→只看（进「更多」）。 */
function rowContractAction(item: RequirementItem): 'create' | 'sign' | 'view' | null {
  if (canCreateRequirementContract(item)) {
    return 'create'
  }
  if (!canOpenContractSign(item)) {
    return null
  }
  return isContractButtonViewOnly(item) ? 'view' : 'sign'
}

/**
 * 唯一主操作（实心按钮），取「当前该做的那一步」。
 * 返回 null 表示这一行没有待办（例如已结单且已评价），此时不画实心按钮。
 */
function primaryRowAction(item: RequirementItem): RequirementRowAction | null {
  const contractAction = rowContractAction(item)
  if (contractAction === 'create') {
    const creating = contractCreatingId.value === item.requirement_id
    return {
      key: 'contract-create',
      label: creating ? '发起中...' : '发起合同',
      disabled: creating,
    }
  }
  if (contractAction === 'sign') {
    return { key: 'contract-sign', label: '签署合同' }
  }

  if (canResubmit(item.status)) {
    return { key: 'resubmit', label: '编辑' }
  }

  // 「取消需求」与「支付 / 验收 / 评价」在原来的 v-if 链里就是互斥的，这里保持同样的优先级。
  if (!canCancel(item)) {
    if (canPay(item.status, item)) {
      return { key: 'pay', label: item.status === 'pending_final' ? '支付尾款' : '支付定金' }
    }
    if (canOpenAcceptance(item)) {
      return { key: 'acceptance', label: '验收' }
    }
    if (canRequestFinalPayment(item)) {
      return { key: 'finish', label: requirementFinalActionLabel(item) }
    }
    if (canComment(item.status) && item.comment_rating == null) {
      return { key: 'comment', label: '去评价' }
    }
  }

  return null
}

/**
 * 「更多」菜单项，同时用于决定是否渲染「更多」触发器（空数组时不渲染）。
 *
 * 已评价的行不再把评价做成主操作，但后端是 upsert（`comment_requirement_by_user`），
 * 仍可以改，所以菜单里保留「修改评价」，不能让这个入口消失。
 */
function moreRowActions(item: RequirementItem): RequirementRowAction[] {
  const entries: RequirementRowAction[] = []

  if (rowContractAction(item) === 'view') {
    entries.push({ key: 'contract-view', label: '查看合同' })
  }
  if (hasBoundResource(item)) {
    entries.push({ key: 'homepage', label: '资源主页' })
  }
  if (canComment(item.status) && item.comment_rating != null && !canCancel(item)) {
    entries.push({ key: 'comment', label: '修改评价' })
  }
  // 开不出票时不留一个点了才报错的入口：置灰并把原因挂在 title 上（灰项不可点，原因只能靠悬浮）。
  const invoiceState = invoiceEntryState(item.payment_mode, invoiceSummaryMap.value[item.requirement_id])
  entries.push(
    invoiceState.enabled
      ? { key: 'invoice', label: '获取发票' }
      : { key: 'invoice', label: '获取发票', disabled: true, title: invoiceState.reason },
  )
  // 「解除合作」是唯一的退出入口（2026-10-06 起两套旧出口合并）：进去先协商，
  // 对方同意即无责退出、不同意才申请平台介入。
  if (canReportBreach(item)) {
    entries.push({ key: 'breach', label: '解除合作', danger: true })
  }
  if (canCancel(item)) {
    entries.push({ key: 'cancel', label: '取消需求', danger: true })
  }

  return entries
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
 * 「更多」菜单的 `command` 回传的是字符串，在脚本里收口成联合类型再分发，
 * 避免在模板表达式里写类型断言。
 */
function runMoreRowAction(item: RequirementItem, key: string) {
  runRowAction(item, key as RequirementRowActionKey)
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
 * 解除合作待办：按需求统计「在等我动作」的案件数，给行内「解除合作」入口挂角标。
 *
 * 一次 `GET /api/dispute/cases` 就能拿到我参与的全部案件（含 `viewerRole`），不用逐条需求发请求。
 * 待办口径见 `shared/afterSalesStatus.ts` 的 `isAwaitingViewerAction`。
 */
const afterSalesPending = ref<Record<string, number>>({})

function afterSalesPendingCount(requirementId: string) {
  return afterSalesPending.value[requirementId] ?? 0
}

/** 角标读数；没有待办时返回空串，模板里据此决定是否渲染角标。 */
function afterSalesBadgeFor(requirementId: string) {
  const count = afterSalesPendingCount(requirementId)
  return count > 0 ? afterSalesBadgeText(count) : ''
}

async function loadAfterSalesPending() {
  if (!auth.token) {
    afterSalesPending.value = {}
    return
  }
  try {
    const list = await listMyAfterSalesCases(auth.token)
    const counts: Record<string, number> = {}
    for (const item of list.items) {
      if (isAwaitingViewerAction(item)) {
        counts[item.requirementId] = (counts[item.requirementId] ?? 0) + 1
      }
    }
    afterSalesPending.value = counts
  } catch {
    // 拉不到就当没有待办：不弹错、不阻塞列表，角标本身不该成为页面的故障点。
    afterSalesPending.value = {}
  }
}

onMounted(async () => {
  auth.hydrate()
  await Promise.all([loadMyRequirements(), loadRequirementConversations(), loadDepositRatio()])
  // 角标是锦上添花，不 await：列表先画出来，待办数回来再补上。
  void loadAfterSalesPending()

  const oauthResult = typeof route.query.wechat_oauth === 'string' ? route.query.wechat_oauth : ''
  const oauthError =
    typeof route.query.wechat_oauth_error === 'string' ? route.query.wechat_oauth_error : ''
  const unionOauthResult = typeof route.query.union_oauth === 'string' ? route.query.union_oauth : ''
  const unionOauthError =
    typeof route.query.union_oauth_error === 'string' ? route.query.union_oauth_error : ''
  if (oauthResult === 'success') {
    showToast('微信授权成功，请再次点击支付', 'success')
  } else if (oauthError) {
    showToast(`微信授权失败：${oauthError}`, 'error')
  }
  if (unionOauthResult === 'success') {
    payChannel.value = 'union'
    showToast('云闪付授权成功，请再次点击支付', 'success')
  } else if (unionOauthError) {
    showToast(`云闪付授权失败：${unionOauthError}`, 'error')
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
    <!-- 顶部读数条：四格读数在最左，页面级刷新固定在右上角，与其余菜单页同一套形状 -->
    <WorkbenchBarSlot>
      <div class="wb-strip my-requirements-strip" aria-label="需求概览">
        <div class="wb-strip__item" title="全部需求">
          <span class="wb-strip__label">全部</span>
          <span class="wb-strip__value">{{ stripValue(requirementStats.total) }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item" title="审核中：待审核、已驳回">
          <span class="wb-strip__label">审核</span>
          <span class="wb-strip__value">{{ stripValue(requirementStats.pending) }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item" title="开发中：待签署、待付定金、开发中、待付尾款">
          <span class="wb-strip__label">开发</span>
          <span class="wb-strip__value">{{ stripValue(requirementStats.active) }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item" title="已完成：可评价、已完成、已取消">
          <span class="wb-strip__label">完成</span>
          <span class="wb-strip__value">{{ stripValue(requirementStats.completed) }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton icon-only :loading="requirementLoading || conversationLoading"
            :aria-label="refreshButtonLabel" :title="refreshButtonLabel" @click="refreshMyRequirements">
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">需求列表</h3>
        </div>
        <div class="wb-card-head__actions">
          <TButton variant="solid" tone="accent" class="my-requirements-publish--head" @click="openPublishModal">
            发布新需求
          </TButton>
        </div>
      </div>

      <div class="wb-toolbar">
        <TSelect v-model="selectedState" class="wb-toolbar__field wb-toolbar__field--requirement-state"
          aria-label="需求状态">
          <TOption v-for="state in states" :key="state.value" :value="state.value" :label="state.label" />
        </TSelect>
        <TInput v-model="keyword" class="wb-toolbar__search" clearable placeholder="搜索需求标题、编号或发布人"
          aria-label="搜索需求">
          <template #prefix><TIcon><Search /></TIcon></template>
        </TInput>
        <TButton variant="solid" tone="accent" class="my-requirements-publish--toolbar" aria-label="发布新需求"
          @click="openPublishModal">
          发布
        </TButton>
        <div class="wb-toolbar__actions">
          <span v-if="hasActiveFilters" class="wb-toolbar__hint">
            筛选出 {{ filteredTotal }} / {{ myRequirements.length }} 条
          </span>
          <TButton variant="outline" @click="resetFilters">
            <TIcon><RefreshLeft /></TIcon><span>重置</span>
          </TButton>
        </div>
      </div>

      <p v-if="requirementLoading && myRequirements.length === 0" class="wb-empty" role="status">需求单加载中…</p>
      <div v-else-if="!filteredRequirements.length" class="wb-empty" role="status">
        <span class="wb-empty__title">
          {{ myRequirements.length ? '没有符合条件的需求单' : '还没有提交过需求单' }}
        </span>
        <template v-if="myRequirements.length">
          <div class="wb-empty__actions">
            <TButton variant="outline" @click="resetFilters">
              <TIcon><RefreshLeft /></TIcon><span>清除筛选</span>
            </TButton>
          </div>
        </template>
        <template v-else>点击右上角「发布新需求」即可创建你的第一个需求。</template>
      </div>
      <template v-else>
      <ul class="wb-list requirement-list">
        <template v-for="item in pagedRequirements" :key="item.requirement_id">
          <li class="requirement-row wb-item wb-item--clickable"
            :class="{ expanded: isVersionDeleteReviewExpanded(item) }"
            :aria-label="`打开「${item.title}」的沟通记录`" tabindex="0"
            @click="openRequirementConversationPage(item)"
            @keydown.enter.prevent="openRequirementConversationPage(item)"
            @keydown.space.prevent="openRequirementConversationPage(item)">
            <div class="requirement-card-body">
              <div class="requirement-main wb-item__main">
                <div class="requirement-title wb-item__title">
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.requirement_id }}</span>
                </div>
                <!-- R014：合同有效期届满后的锁定 / 清除横幅。锁定态可下载、写操作置灰；清除态只剩审计台账。 -->
                <div v-if="archiveBanner(item).title" class="requirement-archive-banner"
                  :class="`requirement-archive-banner--${archiveBanner(item).state}`" role="status"
                  data-testid="requirement-archive-banner">
                  <strong>{{ archiveBanner(item).title }}</strong>
                  <span v-if="lockRemainingText(item)" class="requirement-archive-banner__remaining">{{
                    lockRemainingText(item) }}</span>
                  <p>{{ archiveBanner(item).description }}</p>
                </div>
                <div class="requirement-details">
                  <!-- 短事实走标签：发布方式用全站共用的 .pay-mode-chip（见 PaymentModeChip，与需求大厅卡片同一枚胶囊，
                       底色按发布方式分档），其余走统一层 .wb-badge（浅底 + 深字：绿 = 已公开、琥珀 = 有待审核项）；
                       散文式的说明仍用 .requirement-note 独占一行。 -->
                  <PaymentModeChip :mode="item.payment_mode" />
                  <span v-if="hasBoundResource(item)" class="wb-badge wb-badge--success">{{
                    formatResourceVisibility(item)
                    }}</span>
                  <span v-if="hasBoundResource(item)" class="wb-badge">交付 {{
                    publishedVersionCount(item) }} 版{{ latestDeliveryVersionLabel(item) }}</span>
                  <!-- R014：开发周期（天）——担保需求合同有效期依据；无担保 / 未填不渲染。 -->
                  <span v-if="item.development_cycle_days != null" class="wb-badge"
                    data-testid="requirement-development-cycle">开发周期 {{ item.development_cycle_days }} 天</span>
                  <!-- 已转换的不再给按钮（点了必 409），改成一枚不可点的标记；时间挂在 title 上。 -->
                  <span v-if="isResourceClaimed(item)" class="wb-badge wb-badge--success"
                    :title="`转换时间：${formatRequirementTime(item.resource_claimed_at ?? '')}`"
                    data-testid="requirement-claimed-badge">已转为我的资源</span>
                  <small v-if="contractStatusHint(item)" class="requirement-note">{{
                    contractStatusHint(item)
                    }}</small>
                  <!-- R014：锁定期内的「转为我的资源」引导（复用 R006 转换入口，转换不可撤销）。 -->
                  <small v-if="canClaimResourceWhileLocked(item)"
                    class="requirement-note requirement-note--block" data-testid="requirement-claim-guidance">
                    资料保留期内请尽快把交付的资源项目「转为我的资源」：转换后资源归你所有、不可撤销，
                    保留期届满平台清除资料后，开发者侧不再控制该资源。
                  </small>
                  <span v-if="hasPendingResourceVersionDeleteReview(item)" class="wb-badge wb-badge--warning">
                    待审核 · 开发者申请删除 {{ pendingResourceVersionDeleteRequests(item).length }} 个版本
                  </span>
                  <small v-else-if="
                    hasBoundResource(item) &&
                    item.resource_version_delete_request_status === 'rejected' &&
                    item.resource_version_delete_review_note
                  " class="requirement-note requirement-note--block">{{ versionDeleteRejectNote(item) }}</small>
                  <small v-if="item.status === 'rejected' && item.review_note"
                    class="requirement-note requirement-note--block">驳回原因：{{ item.review_note }}</small>
                  <small v-if="settlementHint(item)"
                    class="requirement-note requirement-note--block">{{ settlementHint(item) }}</small>
                  <small
                    v-if="item.comment_rating != null"
                    class="requirement-note requirement-note--block"
                  >
                    我的评价：{{ formatCommentSummary(item.comment_rating, item.comment_text) }}
                  </small>
                  <small
                    v-if="item.developer_comment_rating != null"
                    class="requirement-note requirement-note--block"
                  >
                    对方评价（开发者）：{{
                      formatCommentSummary(item.developer_comment_rating, item.developer_comment_text)
                    }}
                  </small>
                </div>
              </div>
              <aside class="requirement-summary wb-item__side" aria-label="需求摘要">
                <span class="wb-badge" :class="statusBadgeClass(item)">
                  {{ formatRequirementDisplayStatus(item) }}
                </span>
                <div class="requirement-budget">
                  <small>预算</small>
                  <strong>{{ formatBudget(item.budget) }}</strong>
                </div>
                <time>
                  <small>更新时间</small>
                  <span>{{ formatRequirementTime(item.updated_at) }}</span>
                </time>
              </aside>
            </div>
            <!-- 操作区分四层：开关芯片（订阅 / 公开）→ 行内常用动作 → 更多菜单 → 唯一主操作。
                 订阅开关每行都有，所以这块不会为空。 -->
            <div class="requirement-actions">
              <div class="requirement-toggles">
                <button class="requirement-toggle" type="button" :aria-pressed="item.subscribe_status_change"
                  :disabled="requirementSubscriptionLoadingId === item.requirement_id"
                  :title="item.subscribe_status_change ? '已订阅状态变化，点击取消' : '订阅状态变化后通知我'"
                  @click.stop="toggleRequirementSubscription(item)">
                  <span class="requirement-toggle__track" aria-hidden="true"></span>
                  {{
                    requirementSubscriptionLoadingId === item.requirement_id
                      ? '提交中...'
                      : requirementSubscriptionLabel(item)
                  }}
                </button>
                <button v-if="canToggleRequirementResourceVisibility(item) && !isRequirementArchived(item)" class="requirement-toggle" type="button"
                  :aria-pressed="currentResourceVisibility(item) === 'public'"
                  :disabled="resourceVisibilityLoadingId === item.requirement_id"
                  :title="currentResourceVisibility(item) === 'review' ? '点击撤回公开审核，资源恢复为私有' : '切换关联资源的公开 / 私有'"
                  @click.stop="toggleRequirementResourceVisibility(item)">
                  <span class="requirement-toggle__track" aria-hidden="true"></span>
                  {{
                    resourceVisibilityLoadingId === item.requirement_id
                      ? '提交中...'
                      : toggleResourceVisibilityLabel(item)
                  }}
                </button>
              </div>

              <!-- 行内控件各自处理自己的点击与回车，在容器这一层就拦住，别再冒泡到整行的「打开沟通页」。
                   注意「更多」那个按钮上不能再挂 @click.stop：TDropdown 的触发监听挂在自己的外层
                   span 上（el-dropdown 当时是挂在触发元素自身），在按钮处截断冒泡等于菜单永远打不开。 -->
              <div class="requirement-actions__list" @click.stop @keydown.stop>
                <button v-if="hasBoundResource(item) && !isRequirementCleared(item)" class="ghost small action-emphasis" type="button"
                  :disabled="resourceDownloadingId === item.bound_resource_id"
                  @click.stop="runRowAction(item, 'download')">
                  {{ resourceDownloadingId === item.bound_resource_id ? '准备中...' : '下载' }}
                </button>
                <button v-if="hasBoundResource(item)" class="ghost small action-quiet" type="button"
                  @click.stop="runRowAction(item, 'conversation')">
                  会话
                </button>
                <!-- 已结单且有交付资源、尚未转换时才出现；转换后由上方的「已转为我的资源」标记接替。 -->
                <button v-if="canClaimResource(item)" class="ghost small action-emphasis" type="button"
                  title="把开发者交付的资源转为我自己的资源项目（不可撤销）"
                  @click.stop="runRowAction(item, 'claim-resource')">
                  转为我的资源
                </button>
                <!-- 版本删除审核没有别的入口（整行点击归会话），所以这里给它一个按钮，
                     与下方展开的审核卡片成对出现。 -->
                <button v-if="hasPendingResourceVersionDeleteReview(item) && !isRequirementArchived(item)"
                  class="ghost small action-emphasis"
                  type="button" :aria-expanded="isVersionDeleteReviewExpanded(item)"
                  @click.stop="toggleVersionDeleteReviewCard(item)">
                  {{ isVersionDeleteReviewExpanded(item) ? '收起审核' : '审核资源' }}
                </button>
                <button v-if="canOpenAfterSales(item) && !isRequirementArchived(item)" class="ghost small action-emphasis"
                  :class="{ 'has-todo-badge': afterSalesBadgeFor(item.requirement_id) }" type="button"
                  @click.stop="runRowAction(item, 'after-sales')">
                  解除合作
                  <span v-if="afterSalesBadgeFor(item.requirement_id)" class="todo-badge"
                    :title="`有 ${afterSalesPendingCount(item.requirement_id)} 条解除合作待你处理`">{{
                      afterSalesBadgeFor(item.requirement_id) }}</span>
                </button>

                <TDropdown v-if="moreRowActions(item).length && !isRequirementArchived(item)" trigger="click"
                  @command="(key) => runMoreRowAction(item, String(key))">
                  <button class="ghost small requirement-actions__more" type="button" aria-haspopup="menu"
                    title="更多操作">
                    更多
                    <TIcon>
                      <ArrowDown />
                    </TIcon>
                  </button>
                  <template #dropdown>
                    <TDropdownMenu>
                      <TDropdownItem v-for="entry in moreRowActions(item)" :key="entry.key" :command="entry.key"
                        :disabled="entry.disabled" :title="entry.title"
                        :class="{ 'is-danger': entry.danger }">
                        {{ entry.label }}
                      </TDropdownItem>
                    </TDropdownMenu>
                  </template>
                </TDropdown>

                <button v-if="primaryRowAction(item) && !isRequirementArchived(item)" class="ghost small action-primary" type="button"
                  :disabled="primaryRowAction(item)?.disabled"
                  @click.stop="runRowAction(item, primaryRowAction(item)!.key)">
                  {{ primaryRowAction(item)!.label }}
                </button>
              </div>
            </div>
          </li>

          <li v-if="isVersionDeleteReviewExpanded(item) && pendingResourceVersionDeleteRequests(item).length && !isRequirementArchived(item)"
            class="requirement-review-card-row">
            <section class="requirement-review-card" @click.stop>
              <div class="requirement-review-card__header">
                <div>
                  <h4>版本删除审核</h4>
                </div>
                <button class="ghost small" type="button" @click.stop="closeVersionDeleteReviewCard">
                  收起
                </button>
              </div>
              <div class="requirement-review-card-list">
                <article v-for="request in pendingResourceVersionDeleteRequests(item)" :key="request.version_id"
                  class="requirement-review-item">
                  <div class="requirement-review-item__main">
                    <div>
                      <strong>{{ pendingResourceVersionTitle(request) }}</strong>
                      <p>申请时间：{{ formatPendingVersionRequestedAt(request) }}</p>
                    </div>
                    <div class="requirement-review-item__actions">
                      <button class="ghost small" type="button"
                        :disabled="resourceVersionDeleteReviewLoadingId === item.requirement_id"
                        @click.stop="submitVersionDeleteReview(item, request, 'approve')">
                        {{
                          resourceVersionDeleteReviewLoadingId === item.requirement_id
                            ? '处理中...'
                            : '同意删除'
                        }}
                      </button>
                      <button class="ghost small" type="button" :class="{ active: isRejectingVersion(request) }"
                        :disabled="resourceVersionDeleteReviewLoadingId === item.requirement_id"
                        @click.stop="openRejectVersion(request)">
                        拒绝删除
                      </button>
                    </div>
                  </div>
                  <p class="requirement-review-card__hint danger">
                    同意后该版本文件会被永久删除，且无法恢复。
                  </p>
                  <div v-if="isRejectingVersion(request)" class="requirement-review-item__reject-panel">
                    <label class="requirement-review-card__field requirement-review-card__field--stacked">
                      <span>拒绝原因</span>
                      <textarea v-model="versionDeleteRejectNotes[request.version_id]" class="comment-input" rows="4"
                        maxlength="500" placeholder="可选：说明拒绝删除该版本的原因"></textarea>
                      <small class="requirement-note">已输入 {{ pendingVersionRejectNote(request).length }} / 500 字</small>
                    </label>
                    <div class="requirement-review-card__actions">
                      <button class="ghost small" type="button" @click.stop="cancelRejectVersion">
                        取消
                      </button>
                      <button class="ghost small" type="button"
                        :disabled="resourceVersionDeleteReviewLoadingId === item.requirement_id"
                        @click.stop="submitVersionDeleteReview(item, request, 'reject')">
                        {{
                          resourceVersionDeleteReviewLoadingId === item.requirement_id
                            ? '处理中...'
                            : '确认拒绝删除'
                        }}
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </li>
        </template>
      </ul>

      <div class="wb-pager">
        <div class="wb-pager__count">
          <TSelect v-model="pageSize" class="wb-pager__size" aria-label="每页需求单数">
            <TOption v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
          </TSelect>
        </div>
        <TPagination v-model:current-page="page" :page-size="pageSize" :total="filteredTotal"
          :pager-count="5" background aria-label="需求单分页" />
      </div>
      </template>
    </section>

    <PublishModal ref="publishModalRef" :visible="publishVisible" v-model:publishTitle="publishTitle"
      v-model:publishDescription="publishDescription" v-model:publishBudget="publishBudget"
      v-model:publishAcceptance="publishAcceptance" v-model:publishPaymentMode="publishPaymentMode"
      v-model:publishDevelopmentCycleDays="publishDevelopmentCycleDays"
      :publishLoading="publishLoading"
      :draft-scope="auth.isAuthed ? auth.username : 'default'" @close="closePublishModal" @notify="showToast"
      @submit="submitRequirementPublish" />

    <PublishModal ref="editModalRef" :visible="editVisible" modalTitle="重新编辑需求" submitText="重新提交审核"
      loadingText="提交中..." v-model:publishTitle="editTitle" v-model:publishDescription="editDescription"
      v-model:publishBudget="editBudget" v-model:publishAcceptance="editAcceptance"
      v-model:publishPaymentMode="editPaymentMode"
      v-model:publishDevelopmentCycleDays="editDevelopmentCycleDays"
      :publishLoading="editLoading"
      :draft-scope="editRequirement ? `edit-${editRequirement.requirement_id}` : ''" @close="closeEditModal"
      @notify="showToast" @submit="submitRequirementResubmit" />

    <RequirementConversationModal :visible="conversationVisible" :token="auth.token" :current-username="auth.username"
      :requirement-id="conversationRequirement?.requirement_id ?? ''" :title="conversationRequirement?.title"
      @updated="applyConversationDetail" @close="closeConversation" />

    <InvoiceApplyDialog v-model:visible="invoiceDialogVisible" :token="auth.token"
      :requirement-id="invoiceRequirement?.requirement_id ?? ''" role="customer" @submitted="loadMyRequirements" />

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
        <p class="tip">{{ currentPayment ? '订单已创建，点下列按钮查询支付结果' : '选择支付方式，付款后回来确认' }}</p>

        <div class="payment-options" role="radiogroup" aria-label="支付方式选择">
          <button type="button" class="payment-option"
            :class="{ active: payChannel === 'alipay', 'payment-option--alipay': payChannel === 'alipay' }"
            @click="updatePayChannel('alipay')">
            <img class="payment-option-icon" src="/icons/alipay.png" alt="支付宝" />
            支付宝
          </button>
          <button type="button" class="payment-option"
            :class="{ active: payChannel === 'wechat', 'payment-option--wechat': payChannel === 'wechat' }"
            @click="updatePayChannel('wechat')">
            <img class="payment-option-icon" src="/icons/wechat-pay.png" alt="微信" />
            微信
          </button>
        </div>

        <div class="actions">
          <button class="ghost" type="button" @click="closePayModal">取消</button>
          <button class="ghost primary" type="button" :disabled="payLoading" @click="submitRequirementPayment">
            {{ payLoading ? '处理中...' : currentPayment ? '查询支付结果' : `支付${payStageLabel}` }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="downloadPickerRequirement" class="modal-wrap" @click.self="closeDownloadPicker">
      <section class="pay-modal" aria-label="选择下载版本">
        <h3>选择要下载的版本</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ downloadPickerRequirement.title }}</p>
        <ul class="download-picker">
          <li v-for="version in deliveryVersionsFor(downloadPickerRequirement)" :key="version.id"
            class="download-picker__item">
            <div class="download-picker__meta">
              <strong>{{ version.version }}</strong>
              <small>{{ version.created_at }}</small>
              <p v-if="deliveryVersionNoteText(version.note)">{{ deliveryVersionNoteText(version.note) }}</p>
            </div>
            <button class="ghost small" type="button"
              :disabled="resourceDownloadingId === downloadPickerRequirement.bound_resource_id"
              @click="downloadRequirementVersion(downloadPickerRequirement, version)">
              {{ resourceDownloadingId === downloadPickerRequirement.bound_resource_id ? '准备中...' : '下载' }}
            </button>
          </li>
        </ul>
        <div class="actions">
          <button class="ghost" type="button" @click="closeDownloadPicker">关闭</button>
        </div>
      </section>
    </div>

    <div v-if="finalPaymentConfirmVisible && finalPaymentConfirmTarget" class="modal-wrap"
      @click.self="closeFinalPaymentConfirm">
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

    <div v-if="cancelConfirmVisible && cancelConfirmTarget" class="modal-wrap"
      @click.self="closeCancelConfirm">
      <section class="pay-modal" aria-label="取消需求弹窗">
        <h3>取消需求单</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ cancelConfirmTarget.title }}</p>
        <p class="pay-line">
          <strong>需求编号：</strong>{{ cancelConfirmTarget.requirement_id }}
        </p>
        <p class="tip">{{ cancelConfirmHint(cancelConfirmTarget) }}</p>

        <div class="actions">
          <button class="ghost" type="button" :disabled="cancelLoading" @click="closeCancelConfirm">
            返回
          </button>
          <button class="ghost danger" type="button" :disabled="cancelLoading"
            @click="submitCancelRequirement">
            {{ cancelLoading ? '取消中...' : '确认取消' }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="claimConfirmVisible && claimConfirmTarget" class="modal-wrap" @click.self="closeClaimConfirm">
      <section class="pay-modal" aria-label="转为我的资源弹窗">
        <template v-if="claimStep === 'confirm'">
          <h3>转为我的资源</h3>
          <p class="pay-line"><strong>需求标题：</strong>{{ claimConfirmTarget.title }}</p>
          <p class="pay-line"><strong>需求编号：</strong>{{ claimConfirmTarget.requirement_id }}</p>
          <p v-if="claimConfirmTarget.bound_resource_title" class="pay-line">
            <strong>交付资源：</strong>{{ claimConfirmTarget.bound_resource_title }}
          </p>
          <ul class="claim-notes" aria-label="转换须知">
            <li>这一步<strong>不可撤销</strong>：资源归你所有，开发者那边不再把它当作自己的资源。</li>
            <li>转换后这笔需求的会话将关闭，双方都不能再发言，但都仍能查看全部历史。</li>
            <li>若你还没有开发者身份，会自动开通，以便在开发者工作台管理该资源。</li>
          </ul>

          <div class="actions">
            <button class="ghost" type="button" :disabled="claimLoading" @click="closeClaimConfirm">
              返回
            </button>
            <button class="ghost primary" type="button" :disabled="claimLoading" @click="submitClaimResource">
              {{ claimLoading ? '转换中...' : '确认转换' }}
            </button>
          </div>
        </template>
        <template v-else>
          <h3>已转为我的资源</h3>
          <p class="pay-line"><strong>需求标题：</strong>{{ claimConfirmTarget.title }}</p>
          <p class="tip">资源已归入你的名下，会话已关闭（仅供查看）。可以到开发者工作台的「资源列表」继续管理它。</p>

          <div class="actions">
            <button class="ghost" type="button" @click="closeClaimConfirm">留在这里</button>
            <button class="ghost primary" type="button" @click="goToDevResourceList">去开发者工作台查看</button>
          </div>
        </template>
      </section>
    </div>

    <div v-if="breachVisible && breachRequirement" class="modal-wrap" @click.self="closeBreachReport">
      <section class="pay-modal breach-modal" aria-label="解除合作弹窗">
        <h3>{{ breachDialogTitle() }}</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ breachRequirement.title }}</p>
        <p class="pay-line"><strong>需求编号：</strong>{{ breachRequirement.requirement_id }}</p>
        <p v-if="breachCaseLoading" class="pay-line">正在加载解除合作案件…</p>
        <template v-else-if="breachCase && !breachNewRound">
          <p class="pay-line"><strong>案件编号：</strong>{{ breachCase.caseNo }}</p>
          <p class="pay-line"><strong>当前状态：</strong>{{ breachStatusLabel(breachCase.status) }}</p>
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
              <strong>AI 判定：</strong>{{ breachCase.aiLiableParty ? breachLiablePartyLabel(breachCase.aiLiableParty) : '无法判定，已转客服人工判定' }}
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
            <p class="pay-line"><strong>我方表态：</strong>{{ breachDecisionText(breachCase.customerDecision) }}</p>
            <p class="pay-line"><strong>对方表态：</strong>{{ breachDecisionText(breachCase.developerDecision) }}</p>
          </template>
          <p class="pay-line">
            <strong>资金处理：</strong>定金 ¥{{ breachCase.depositAmountCny }} · 已退尾款 ¥{{ breachCase.refundAmountCny }} · 赔付 ¥{{ breachCase.compensationAmountCny }}<template v-if="breachCase.extraCompensationFen > 0"> · 额外赔偿 ¥{{ breachCase.extraCompensationCny }}</template>
          </p>
          <p v-if="breachCase.verdictSource" class="pay-line">
            <strong>判定来源：</strong>{{ breachVerdictSourceText(breachCase.verdictSource) }}
          </p>
          <p v-if="breachCase.resolutionNote" class="pay-line"><strong>处理说明：</strong>{{ breachCase.resolutionNote }}</p>

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
              <textarea v-model="breachDecisionNote" rows="3" maxlength="1000"
                placeholder="可选：说明你同意或不同意的立场，双方与客服都会看到"></textarea>
            </label>
            <p v-else class="tip">已提交申请，等待对方回应。</p>
          </template>
          <p v-else-if="breachCase.mutualAgreedAt" class="pay-line">
            <strong>协商结果：</strong>双方协商一致（无责退出），{{ formatCnDateTime(breachCase.mutualAgreedAt) }}
          </p>
          <p v-else-if="breachCase.mutualRejectedAt" class="pay-line">
            <strong>协商结果：</strong>对方不同意解除合作（{{ formatCnDateTime(breachCase.mutualRejectedAt) }}），任一方可申请平台介入
          </p>

          <div v-if="canDecideBreachCase(breachCase)" class="breach-modal__decision">
            <p class="pay-line"><strong>是否接受：</strong>双方都接受 AI 判定后平台才会执行退款／赔付；任一方不接受或逾期未全部表态，案件转客服人工判定。</p>
            <label v-if="breachRejectPanel" class="pay-line breach-modal__field">
              <strong>不接受的原因</strong>
              <textarea v-model="breachDecisionNote" rows="3" maxlength="1000"
                placeholder="可选：说明不接受该判定的理由，便于客服人工复核"></textarea>
            </label>
            <div class="actions">
              <template v-if="breachRejectPanel">
                <button class="ghost" type="button" :disabled="breachDecisionLoading" @click="cancelBreachRejectPanel">
                  取消
                </button>
                <button class="ghost danger" type="button" :disabled="breachDecisionLoading"
                  @click="submitBreachDecision('rejected')">
                  {{ breachDecisionLoading ? '提交中...' : '确认不接受' }}
                </button>
              </template>
              <template v-else>
                <button class="ghost danger-plain" type="button" :disabled="breachDecisionLoading"
                  @click="openBreachRejectPanel">
                  不接受
                </button>
                <button class="ghost primary" type="button" :disabled="breachDecisionLoading"
                  @click="submitBreachDecision('accepted')">
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
            <p class="pay-line"><strong>确认撤回：</strong>撤回后本次申请结束，如仍有争议可在同一需求上重新发起；撤回不会触发任何退款或赔付。</p>
            <div class="actions">
              <button class="ghost" type="button" :disabled="breachWithdrawLoading"
                @click="cancelBreachWithdrawConfirm">再想想</button>
              <button class="ghost danger" type="button" :disabled="breachWithdrawLoading"
                @click="submitBreachWithdraw">
                {{ breachWithdrawLoading ? '撤回中...' : '确认撤回申请' }}
              </button>
            </div>
          </div>

          <div class="actions">
            <button class="ghost" type="button"
              :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
              @click="closeBreachReport">关闭</button>
            <button v-if="canWithdrawBreachCase(breachCase) && !breachWithdrawConfirm" class="ghost danger-plain"
              type="button" :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
              @click="openBreachWithdrawConfirm">
              撤回申请
            </button>
            <button v-if="breachCase.status === 'withdrawn'" class="ghost primary" type="button"
              :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
              @click="reopenBreachReport">
              {{ breachWithdrawnByMe ? '重新发起' : '提交解除合作申请' }}
            </button>
            <button v-else-if="(breachCase.status === 'rejected' || breachCase.status === 'succeeded') && breachCanStartNewRound"
              class="ghost primary" type="button"
              :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
              @click="reopenBreachReport">
              发起新的解除合作
            </button>
            <button v-if="canRequestPlatformReview(breachCase)" class="ghost primary" type="button"
              :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
              @click="submitPlatformReview">
              {{ platformReviewLoading ? '提交中...' : '申请平台介入' }}
            </button>
            <template v-if="canRespondTermination(breachCase)">
              <button class="ghost danger-plain" type="button"
                :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
                @click="submitBreachDecision('rejected')">
                {{ breachDecisionLoading ? '提交中...' : '不同意' }}
              </button>
              <button class="ghost primary" type="button"
                :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
                @click="submitBreachDecision('accepted')">
                {{ breachDecisionLoading ? '提交中...' : '同意解除' }}
              </button>
            </template>
          </div>
          <!-- 上一轮结案会把合同作废、需求退回大厅：这时没有生效合同可依，按钮不给，
               但必须把「为什么不能再发起、要做什么」写清楚，不能让人对着一个结论干瞪眼（BUG-038）。 -->
          <p v-if="(breachCase.status === 'succeeded' || breachCase.status === 'rejected') && !breachCanStartNewRound"
            class="tip">{{ breachRoundHint() }}</p>
        </template>
        <template v-else>
          <p v-if="breachNewRound" class="tip">{{ breachRoundHint() }}</p>
          <label class="pay-line breach-modal__field">
            <strong>事实与依据</strong>
            <textarea v-model="breachReason" rows="6" maxlength="2000"
              placeholder="请填写时间、已交付内容、沟通记录和希望平台核查的事实"></textarea>
          </label>
          <p class="tip">提交后案件进入「协商中」：双方先在案件内协商定金与尾款的退还额度，谈成即直接退款结案；协商不成再由任一方申请平台介入，由审核智能体依据双方会话与材料判定责任方。</p>
          <div class="actions">
            <button class="ghost" type="button" :disabled="breachLoading" @click="closeBreachReport">取消</button>
            <button class="ghost primary" type="button" :disabled="breachLoading" @click="submitBreachReport">
              {{ breachLoading ? '提交中...' : breachSubmitLabel() }}
            </button>
          </div>
        </template>
      </section>
    </div>

    <AcceptanceDialog :visible="acceptanceVisible" :token="auth.token"
      :requirement-id="acceptanceTarget?.requirement_id ?? ''"
      :requirement-title="acceptanceTarget?.title ?? ''" @close="closeAcceptanceModal"
      @submitted="handleAcceptanceSubmitted" />

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

.wallet-header {
  align-items: flex-start;
}

.my-requirements-summary.wallet-section {
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.my-requirements-summary__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.my-requirements-summary__grid article {
  display: grid;
  gap: 8px;
  padding: 16px;
  border: 1px solid rgba(224, 232, 255, 0.96);
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(76, 103, 172, 0.06);
}

.my-requirements-summary__grid strong {
  color: #0f172a;
  font-size: 28px;
  line-height: 1;
}

.my-requirements-summary__grid span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.my-requirements-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 0 auto;
}

.my-requirements-refresh.small {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
}

@keyframes my-requirements-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 档位名只有三个字，状态下拉收窄；宽度必须写成 flex 基宽而不是 width——TSelect 自带 width: 100%，
   flex-basis 会被 width 顶掉，细节见 portal-workbench.css 里 .wb-toolbar__field 的注释。 */
.wb-toolbar__field--requirement-state {
  flex: 0 1 140px;
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

.my-requirement-detail-wrap {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(5px);
}

.my-requirement-detail {
  width: min(860px, 100%);
  max-height: min(760px, calc(100dvh - 32px));
  overflow-y: auto;
  border: 1px solid rgba(203, 213, 225, 0.82);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 28px 72px rgba(15, 23, 42, 0.22);
}

.my-requirement-detail__head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.84);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
}

.my-requirement-detail__head h3 {
  margin: 0;
  color: #0f172a;
  font-size: 22px;
  line-height: 1.3;
}

.my-requirement-detail__head p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.my-requirement-detail__chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid rgba(191, 219, 254, 0.94);
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.92);
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.my-requirement-detail__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 10px;
  background: #fff;
  color: #334155;
  cursor: pointer;
}

.my-requirement-detail__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 10px;
  padding: 14px 22px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.76);
}

.my-requirement-detail__meta span {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(241, 245, 249, 0.92);
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.my-requirement-detail__meta span.my-requirement-detail__meta--developer {
  background: rgba(236, 253, 245, 0.92);
  border: 1px solid rgba(167, 243, 208, 0.96);
  color: #047857;
}

.my-requirement-detail__review-panel {
  display: grid;
  gap: 12px;
  margin: 16px 22px;
  padding: 16px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.92));
}

.my-requirement-detail__review-grid {
  display: grid;
  grid-template-columns: minmax(0, 160px) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}

.my-requirement-detail__review-item {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.my-requirement-detail__review-grid .my-requirement-detail__review-item {
  grid-template-rows: auto 1fr;
}

.my-requirement-detail__review-label {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  line-height: 1.35;
}

.my-requirement-detail__review-value {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  color: #0f172a;
  font-weight: 700;
  line-height: 1.7;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}

.my-requirement-detail__review-grid .my-requirement-detail__review-value {
  height: 100%;
}

.my-requirement-detail__review-grid div.my-requirement-detail__review-value {
  display: flex;
  align-items: center;
}

.my-requirement-detail__review-value--multiline {
  white-space: pre-wrap;
}

.my-requirement-detail__version-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.my-requirement-detail__version-list li {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}

.my-requirement-detail__version-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.my-requirement-detail__version-head strong {
  color: #0f172a;
  font-size: 14px;
  font-weight: 800;
}

.my-requirement-detail__version-head time {
  color: #94a3b8;
  font-size: 12px;
}

.my-requirement-detail__version-note {
  margin: 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.my-requirement-detail__version-link {
  width: fit-content;
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
}

.my-requirement-detail__version-link:hover {
  color: #1d4ed8;
}

.my-requirement-detail__rich {
  color: #334155;
  font-weight: 500;
  line-height: 1.75;
  overflow-wrap: anywhere;
}

.my-requirement-detail__rich :deep(*:not(a)) {
  color: inherit;
}

.my-requirement-detail__rich :deep(strong),
.my-requirement-detail__rich :deep(b) {
  color: #1e293b;
  font-weight: 700;
}

.my-requirement-detail__rich :deep(p),
.my-requirement-detail__rich :deep(ul),
.my-requirement-detail__rich :deep(ol),
.my-requirement-detail__rich :deep(blockquote) {
  margin: 0 0 12px;
}

.my-requirement-detail__rich :deep(ul),
.my-requirement-detail__rich :deep(ol) {
  padding-left: 22px;
}

.my-requirement-detail__rich :deep(a) {
  color: #2563eb;
  font-weight: 600;
}

.my-requirement-detail__rich :deep(pre) {
  overflow-x: auto;
  padding: 14px 16px;
  border-radius: 14px;
  background: #0f172a;
  color: #e2e8f0;
}

.my-requirement-detail__rich :deep(.rich-editor-media) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 12px 0;
  border-radius: 14px;
}

.my-requirement-detail__rich :deep(.rich-editor-attachment) {
  display: inline-flex;
  max-width: 100%;
  margin: 8px 0;
  padding: 8px 12px;
  border: 1px solid rgba(191, 219, 254, 0.96);
  border-radius: 10px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-weight: 800;
  text-decoration: none;
}

.my-requirement-detail__actions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
  padding: 0 22px 22px;
  background: rgba(248, 250, 252, 0.62);
}

.my-requirement-detail__payment-panel {
  display: grid;
  gap: 14px;
  margin: 16px 22px 0;
  padding: 16px;
  border: 1px solid rgba(147, 197, 253, 0.82);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.9), rgba(248, 250, 252, 0.94));
}

.my-requirement-detail__payment-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.my-requirement-detail__payment-head > div {
  display: grid;
  gap: 4px;
}

.my-requirement-detail__payment-label {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.my-requirement-detail__payment-head strong {
  color: #1d4ed8;
  font-size: 20px;
  line-height: 1.3;
}

.my-requirement-detail__payment-status {
  flex: 0 0 auto;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
}

.my-requirement-detail__payment-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  color: #475569;
  font-size: 13px;
  font-weight: 700;
}

.my-requirement-detail__payment-channel {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}

.my-requirement-detail__payment-channel > strong {
  color: #334155;
  font-size: 13px;
}

.my-requirement-detail__primary {
  min-height: 38px;
  padding: 0 18px;
  border: 1px solid #2563eb;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}

.my-requirement-detail__primary:hover:not(:disabled) {
  border-color: #1d4ed8;
  background: #1d4ed8;
}

.my-requirement-detail__primary:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.my-requirement-detail__secondary {
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid rgba(191, 219, 254, 0.96);
  border-radius: 8px;
  background: rgba(239, 246, 255, 0.82);
  color: #2563eb;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}

.my-requirement-detail__secondary:hover {
  border-color: rgba(37, 99, 235, 0.34);
  background: rgba(219, 234, 254, 0.92);
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

/* 「发布新需求」放在「需求列表」卡头右端；手机档卡头整块收起，按钮改放搜索栏右端 */
.my-requirements-page .wb-card-head:has(.my-requirements-publish--head) {
  align-items: center;
}

.my-requirements-publish--toolbar {
  display: none;
}

@media (max-width: 640px) {
  .my-requirements-page .wb-card-head:has(.my-requirements-publish--head) {
    display: none;
  }

  /* 操作槽只剩刷新，钉在顶栏右侧，四组读数才排得进一行 */
  /* 四组读数均分四格，文字在上、数字在下 */
  #workbench-mobile-bar-extra .my-requirements-strip {
    position: relative;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
    padding-right: 32px;
  }

  #workbench-mobile-bar-extra .my-requirements-strip .wb-strip__item:not(.wb-strip__action) {
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 0;
  }

  #workbench-mobile-bar-extra .my-requirements-strip .wb-strip__label {
    color: #94a3b8;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.2;
  }

  #workbench-mobile-bar-extra .my-requirements-strip .wb-strip__value {
    color: #0f172a;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.2;
  }

  #workbench-mobile-bar-extra .my-requirements-strip .wb-strip__action {
    position: absolute;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
  }

  /* 搜索栏右端的小号胶囊：浅蓝底蓝字，融进白色搜索栏，不压过搜索框本身 */
  .my-requirements-publish--toolbar,
  .my-requirements-publish--toolbar:hover,
  .my-requirements-publish--toolbar:focus-visible {
    display: inline-flex;
    flex: 0 0 auto;
    height: 32px;
    min-height: 32px;
    margin-left: 4px;
    padding: 0 16px;
    border: 0 !important;
    border-radius: 999px;
    background: #eaf1ff !important;
    box-shadow: none !important;
    color: #1d4ed8 !important;
    font-size: 13px;
    font-weight: 700;
  }

  .my-requirements-publish--toolbar:active {
    background: #dbe7ff !important;
  }
}

@media (max-width: 980px) {
  .my-requirements-summary__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .wallet-header {
    flex-direction: column;
    align-items: stretch;
  }

  .my-requirements-header__actions {
    justify-content: stretch;
  }

  .my-requirements-header__actions .ghost.small {
    flex: 1 1 0;
  }

  .my-requirements-header__actions .ghost.small.my-requirements-refresh {
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
  }

  /* 触屏档：四张统计卡改成一条统计条，四列并排用竖线分隔。
     单列堆叠时四张卡各占 89px，吃掉大半屏首屏空间；这里压到约 64px 一行。 */
  .my-requirements-summary__grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
    padding: 12px 4px;
    border: 1px solid rgba(224, 232, 255, 0.96);
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(76, 103, 172, 0.06);
  }

  .my-requirements-summary__grid article {
    align-content: end;
    gap: 2px;
    padding: 0 6px;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    text-align: center;
  }

  .my-requirements-summary__grid article + article {
    border-left: 1px solid rgba(224, 232, 255, 0.96);
  }

  .my-requirements-summary__grid span {
    font-size: 11px;
    font-weight: 600;
    line-height: 1.35;
  }

  .my-requirements-summary__grid strong {
    font-size: 22px;
  }

  .my-requirement-detail__actions {
    padding: 0 16px 18px;
  }

  .my-requirement-detail__payment-panel {
    margin: 14px 16px 0;
    padding: 14px;
  }

  .my-requirement-detail__payment-channel {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .my-requirement-detail__secondary {
    width: 100%;
  }

  .my-requirement-detail__primary {
    width: 100%;
  }

  .pay-modal .breach-modal__decision .actions .ghost {
    min-height: 44px;
  }

  .pay-modal .breach-modal__decision .actions {
    flex-direction: column;
  }

  .my-requirement-detail__review-panel {
    margin: 14px 16px;
    padding: 14px;
    border-radius: 16px;
  }

  .my-requirement-detail__review-grid {
    grid-template-columns: 1fr;
  }
}

/* R014：合同有效期届满后的锁定 / 清除横幅。锁定是「限时保留资料」，用琥珀提醒；
   清除是终态，用中性灰，表示只剩审计台账。 */
.requirement-archive-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin: 10px 0 4px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #fde68a;
  background: #fffbeb;
  color: #92400e;
}

.requirement-archive-banner--cleared {
  border-color: #cbd5e1;
  background: #f8fafc;
  color: #475569;
}

.requirement-archive-banner strong {
  font-size: 13px;
  font-weight: 800;
}

.requirement-archive-banner__remaining {
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(146, 64, 14, 0.1);
  font-size: 12px;
  font-weight: 700;
}

.requirement-archive-banner p {
  flex: 1 1 100%;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
}

</style>
