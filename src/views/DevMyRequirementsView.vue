<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getAdapayBreachCase,
  reportAdapayTermination,
  requestAdapayPlatformReview,
  submitAdapayBreachDecision,
  withdrawAdapayBreach,
  type AdapayBreachCase,
  type AdapayBreachDecisionValue,
  type AdapayBreachVerdictParty,
  type AdapayBreachVerdictSource,
} from '@/api/adapay'
import AfterSalesModal from '@/components/AfterSalesModal.vue'
import DeliverySubmitDialog from '@/components/DeliverySubmitDialog.vue'
import PaymentModeChip from '@/components/PaymentModeChip.vue'
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import RequirementProgressGuide from '@/components/RequirementProgressGuide.vue'
import { breachStatusLabel } from '@/shared/breachStatus'
import { afterSalesBadgeText, isAwaitingViewerAction } from '@/shared/afterSalesStatus'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { listMyAfterSalesCases } from '@/api/afterSales'
import {
  listRequirementConversations,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@/api/conversations'
import {
  listMyRequirements,
  type RequirementItem,
  type RequirementPaymentMode,
} from '@/api/devRequirements'
import {
  listMcResources,
  listMcResourceVersions,
  type McResourcePayload,
  type McResourceVersionPayload,
} from '@/api/mcResources'
import { getDevWalletOverview, type DevWalletIncomeItem } from '@/api/devWallet'
import {
  buildDevOrderRows,
  deliveryVersionLine,
  latestReceiptAt,
  receiptTotal,
  timeValue,
  type DevOrderRow,
} from '@/shared/devDelivery'
import {
  createRequirementContract,
  fetchAsignRequirementPreviewUrl,
  fetchDevContractSigningStatus,
  type ContractSigningStatus,
} from '@/api/contracts'
import { useToast } from '@/composables/useToast'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import { formatCnDateTime } from '@/shared/requirementDisplay'
import { sanitizeRequirementRichText } from '@/utils/requirementRichText'
import {
  TButton,
  TCard,
  TDescriptions,
  TDescriptionsItem,
  TDialog,
  TForm,
  TFormItem,
  TIcon,
  TInput,
  TLoading,
  TOption,
  TPagination,
  TSelect,
  TTag,
  ArrowDown,
  ArrowUp,
  ChatDotRound,
  Refresh,
  RefreshLeft,
  Search,
  View,
} from 'ui_73info'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)
const rows = ref<RequirementItem[]>([])

/* 交付与到账的数据：与需求单一起拼成本页的行。
   交付侧来自「资源项目」（资源 + 资源版本），到账侧来自「收益钱包」的入账回执——
   与钱包「收入记录」同一个接口，不另算一份，免得两处金额对不上。 */
const resources = ref<McResourcePayload[]>([])
const versionsByResource = ref<Map<number, McResourceVersionPayload[]>>(new Map())
const income = ref<DevWalletIncomeItem[]>([])
const signingStatusMap = ref<Record<string, ContractSigningStatus | null>>({})
const contractCreatingId = ref('')
const conversationVisible = ref(false)
const conversationRequirement = ref<RequirementItem | null>(null)
const conversationLoading = ref(false)
const requirementConversationMap = ref<Record<string, RequirementConversation>>({})
/* 需求说明（需求描述 + 验收标准）的折叠状态，三份都按 requirement_id 归键：
   `briefEls` 存这一段 DOM 用来量高度，`briefOverflowMap` 记该不该出「展开」，
   `expandedBriefs` 记用户展开过没有。 */
const briefOverflowMap = ref<Record<string, boolean>>({})
const expandedBriefs = ref<Record<string, boolean>>({})
const briefEls = ref<Record<string, HTMLElement>>({})

/**
 * 列表里的一行：交付与到账先按需求归并（见 `shared/devDelivery.ts`），再把需求单本身贴回来。
 *
 * `item` 为空的两种行都不是需求单、也不出签署与操作栏：
 * 有资源版本却没被任何需求单绑定的资源，以及到账归属的需求已解绑的那一笔。
 */
type MyOrderRow = DevOrderRow & { item: RequirementItem | null }

const requirementById = computed(
  () => new Map(rows.value.map((item) => [item.requirement_id, item])),
)
const resourceById = computed(() => new Map(resources.value.map((item) => [item.id, item])))

const mergedRows = computed<MyOrderRow[]>(() =>
  buildDevOrderRows(rows.value, resources.value, versionsByResource.value, income.value).map(
    (row) => ({
      ...row,
      item: row.requirementId ? requirementById.value.get(row.requirementId) ?? null : null,
    }),
  ),
)

/* 回款详情弹窗：行上只留合计与笔数，点开才把逐笔到账摊开。
   这里存的是行标识而不是行快照：弹窗开着时点顶部刷新，下面仍从最新的数据里重新找同一行，
   不会留下一份过期的金额。 */
const receiptDialogVisible = ref(false)
const activeReceiptKey = ref<string | null>(null)

const activeReceiptRow = computed(
  () => mergedRows.value.find((row) => row.key === activeReceiptKey.value) ?? null,
)

const breachVisible = ref(false)
/** 解除合作：结单后的唯一业务入口，案件列表与表态都在 `AfterSalesModal` 里。 */
const afterSalesVisible = ref(false)
const afterSalesTarget = ref<RequirementItem | null>(null)
const deliveryDialogVisible = ref(false)
const deliveryRequirement = ref<RequirementItem | null>(null)
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

/** 本页是开发者视角：`developerDecision` 是我方表态，`customerDecision` 是对方表态。 */
function canDecideBreachCase(item: AdapayBreachCase | null) {
  return item?.status === 'ai_judged' && item.developerDecision == null
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

const emptyText = computed(() => {
  if (loading.value) {
    return '接单、交付与到账加载中'
  }

  return hasActiveFilters.value ? '没有符合筛选条件的记录' : '当前账号还没有已关联需求'
})

// 搜索与状态筛选都在前端做：这一页的数据源本来就是把当前开发者的需求单与交付、到账一次取回。
const filters = reactive({
  keyword: '',
  status: '',
})

const hasActiveFilters = computed(
  () => Boolean(filters.keyword.trim()) || Boolean(filters.status),
)

// 「待签合同」是 signingStatusMap 推出来的中间态，不是 RequirementItem.status 的取值，
// 单独给它一个 key，否则筛不到。
function statusKey(item: RequirementItem): string {
  return isWaitingContractSign(item) ? 'contract_pending' : item.status
}

/** 行的状态档位：补充行（未关联需求）单独一档，需求单行沿用需求状态与「待签合同」的中间态。 */
function rowStatusKey(row: MyOrderRow): string {
  return row.item ? statusKey(row.item) : 'unlinked'
}

/* 搜索覆盖需求与交付／回款两侧的标识：开发者核对一笔到账时，
   手里多数只有其中任意一个标识，全给上才不用先猜是哪个字段。 */
function rowKeywordValues(row: MyOrderRow): string[] {
  return [
    row.requirementId ?? '',
    row.item?.title ?? row.title ?? '',
    row.item?.description ?? '',
    row.delivery?.resourceTitle ?? '',
    row.delivery?.latestVersion ?? '',
    rowCustomer(row) ?? '',
    row.receipts.map((receipt) => receipt.paymentId).join(' '),
  ]
}

const filteredRows = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()

  return mergedRows.value.filter((row) => {
    if (filters.status && rowStatusKey(row) !== filters.status) {
      return false
    }

    if (!keyword) {
      return true
    }

    return rowKeywordValues(row).some((value) => value.toLowerCase().includes(keyword))
  })
})

function resetFilters() {
  filters.keyword = ''
  filters.status = ''
}

/**
 * 总览页的进行中项目与最近交付带 `requirement_id` 跳进来（见 DevHomeView 的 openMyOrder）：
 * 这一页的需求单一次全取回、筛选在前端做，所以把编号灌进搜索框就是「定位到这一单」，
 * 顺带在搜索框里留下「列表为什么只剩一条」的说明；清空搜索框或点重置即可回全量。
 *
 * `routeSeededKeyword` 记住上一次由跳转灌进来的编号：路由参数被去掉时（例如点侧边栏回这一页）
 * 只回收它，用户在搜索框里自己敲的词不动。
 */
let routeSeededKeyword = ''

function applyRouteRequirementFilter() {
  const requirementId = typeof route.query.requirement_id === 'string' ? route.query.requirement_id.trim() : ''

  if (routeSeededKeyword && filters.keyword === routeSeededKeyword) {
    filters.keyword = requirementId
  } else if (requirementId) {
    filters.keyword = requirementId
  }

  routeSeededKeyword = requirementId
}

applyRouteRequirementFilter()
watch(() => route.query.requirement_id, applyRouteRequirementFilter)

/* 分页与其余菜单页同构（资源项目、团队资源、收益钱包、需求大厅都带表尾分页器）。
   需求单一次取回全部、筛选在前端做，所以这里是客户端切片，不走服务端页码。 */
const { page, pageSize, total: filteredTotal, paged: pagedRows } = useClientPagination(filteredRows)

/* 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。 */
watch([() => filters.keyword, () => filters.status], () => {
  page.value = 1
})
const boundCount = computed(() => rows.value.filter((item) => item.bound_resource_id != null).length)
const activeCount = computed(() => rows.value.filter((item) => item.status === 'in_development').length)
/** 累计到账：所有行上到账合计的和，与「收益钱包」的入账口径同源，不另算一份。 */
const incomeTotal = computed(() =>
  mergedRows.value.reduce((total, row) => total + receiptTotal(row.receipts), 0),
)

onMounted(async () => {
  auth.hydrate()
  await loadMyRequirements()
  // 角标是锦上添花，不 await：列表先画出来，待办数回来再补上。
  void loadAfterSalesPending()
})

/**
 * 解除合作待办：按需求统计「在等我动作」的案件数，给行内「解除合作」入口挂角标。
 *
 * 一次 `GET /api/dispute/cases` 就能拿到我参与的全部案件，不用逐条需求发请求
 * （与列表页其它按条发起的查询不同，这里刻意只打一次）。
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

async function loadMyRequirements() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  const token = auth.token
  loading.value = true
  try {
    /* 资源与钱包是补充数据：任一失败不该把需求单列表一起清空，
       所以各自兜底成空值，只提示少了哪一块。 */
    const [myRequirements, resourceResult, walletResult] = await Promise.all([
      listMyRequirements(token),
      settle(listMcResources(token), [] as McResourcePayload[], '加载资源列表失败'),
      settle(getDevWalletOverview(token), null, '加载钱包失败'),
    ])

    rows.value = myRequirements
    resources.value = resourceResult.value
    income.value = walletResult.value?.recent_income ?? []
    versionsByResource.value = await loadResourceVersions(token, resourceResult.value)

    const supplementaryError = resourceResult.error ?? walletResult.error
    if (supplementaryError) {
      showToast(`${supplementaryError}，交付与到账暂不完整`, 'warning')
    }

    // 无担保模式（self_managed）不需要合同，无需查询合同签署状态
    const guaranteedRows = rows.value.filter((item) => item.payment_mode !== 'self_managed')
    const [statusEntries] = await Promise.all([
      Promise.allSettled(
        guaranteedRows.map((item) =>
          fetchDevContractSigningStatus(token, item.requirement_id).then((s) => ({ id: item.requirement_id, s })),
        ),
      ),
      loadRequirementConversations(),
    ])
    const map: Record<string, ContractSigningStatus | null> = {}
    for (const entry of statusEntries) {
      if (entry.status === 'fulfilled') {
        map[entry.value.id] = entry.value.s
      }
    }
    signingStatusMap.value = map
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载已关联需求失败'
    showToast(message, 'error')
    rows.value = []
  } finally {
    loading.value = false
  }
}

/** 补充数据的兜底：失败时退到默认值、把错误文案带回去提示，不让整页跟着空掉。 */
async function settle<T>(request: Promise<T>, fallback: T, fallbackMessage: string) {
  try {
    return { value: await request, error: null as string | null }
  } catch (error) {
    return {
      value: fallback,
      error: error instanceof Error ? error.message : fallbackMessage,
    }
  }
}

/* 版本按资源逐个取（后端没有批量接口）。取不到的那个资源按「没有版本」处理，
   只有它这一行的交付物留空，其余照常显示。 */
async function loadResourceVersions(token: string, list: McResourcePayload[]) {
  const entries = await Promise.allSettled(
    list.map(async (resource) => ({
      resourceId: resource.id,
      versions: await listMcResourceVersions(token, resource.id),
    })),
  )

  const map = new Map<number, McResourceVersionPayload[]>()
  for (const entry of entries) {
    if (entry.status === 'fulfilled') {
      map.set(entry.value.resourceId, entry.value.versions)
    }
  }
  return map
}

function formatMoney(value?: number | null): string {
  if (value == null) {
    return '待议价'
  }

  return `¥${value}`
}

/** 到账金额：与收益钱包同一口径（两位小数），行上是合计、弹窗里是逐笔。 */
function receiptMoney(value: number): string {
  return `¥${value.toFixed(2)}`
}

/**
 * 本页的状态文案表。
 *
 * `deposit_paid` 一码两义，不写死：电签担保（`platform_guarantee`）是「定金已进托管、等合同签署
 * 完成」的过渡态，写「已付定金」；无电签约定（`self_managed`）没有合同也没有定金，审核通过即待
 * 开发者接单，写「待开发」。拿不到支付模式时两种含义都写出来——口径见 `shared/requirementStatus.ts`。
 */
function statusLabel(status: RequirementItem['status'], paymentMode?: RequirementPaymentMode): string {
  switch (status) {
    case 'pending_review':
      return '待审核'
    case 'rejected':
      return '已驳回'
    case 'pending_deposit':
      return '待签合同'
    case 'deposit_paid':
      return requirementStatusLabel(status, paymentMode)
    case 'in_development':
      return '开发中'
    case 'pending_final':
      return '待付尾款'
    case 'pending_settlement':
      return '待分账'
    case 'completed':
      return '已完成'
    default:
      return status
  }
}

function isWaitingContractSign(item: RequirementItem): boolean {
  // 无担保模式（self_managed）不需要合同签署
  if (item.payment_mode === 'self_managed') {
    return false
  }
  const status = signingStatusMap.value[item.requirement_id]
  return Boolean(
    (item.status === 'pending_deposit' || item.status === 'deposit_paid') &&
    status?.has_contract &&
    (!status.party_a_signed || !status.party_b_signed),
  )
}

function displayStatusLabel(item: RequirementItem): string {
  return isWaitingContractSign(item) ? '待签合同' : statusLabel(item.status, item.payment_mode)
}

/** 需求正文类字段的富文本：净化后渲染；字段为空时给一句占位，免得卡片上只剩一个空白块。 */
function requirementFieldHtml(value?: string | null, fallback = '当前需求暂未补充详细描述。'): string {
  return sanitizeRequirementRichText(value ?? '') || fallback
}

function statusType(status: RequirementItem['status']): 'info' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'completed':
    case 'deposit_paid':
    case 'pending_settlement':
      return 'success'
    case 'in_development':
    case 'pending_final':
      return 'warning'
    case 'rejected':
      return 'danger'
    default:
      return 'info'
  }
}

function displayStatusType(item: RequirementItem): 'info' | 'success' | 'warning' | 'danger' {
  return isWaitingContractSign(item) ? 'warning' : statusType(item.status)
}

/* === 合并后的行：交付物与到账 ===
   交付物与到账原先是「交付记录」页的两列，现在长在需求单卡片上，
   行上的取数、文案与占位口径都只留这一处（见 `shared/devDelivery.ts`）。 */

/** 行抬头：需求单行取需求标题，补充行取钱包回执里的标题。 */
function rowTitle(row: MyOrderRow): string {
  return row.item?.title ?? row.title ?? '未关联需求'
}

/** 委托方：需求单行取需求方，补充行取钱包回执里的客户名。 */
function rowCustomer(row: MyOrderRow): string | null {
  return row.item?.creator ?? row.customer
}

/** 最近更新：需求单行看需求的更新时间，补充行看最近一次到账或交付。 */
function rowUpdatedAt(row: MyOrderRow): string {
  if (row.item) {
    return row.item.updated_at
  }

  return latestReceiptAt(row.receipts) ?? row.delivery?.latestVersionAt ?? '—'
}

function rowStatusLabel(row: MyOrderRow): string {
  if (row.item) {
    return displayStatusLabel(row.item)
  }

  // 补充行只剩「需求已解绑」这一类：没绑定需求单的交付不成行（见 shared/devDelivery.ts）。
  return '需求已解绑'
}

function rowStatusType(row: MyOrderRow): 'info' | 'success' | 'warning' | 'danger' {
  return row.item ? displayStatusType(row.item) : 'info'
}

/** 交付物标题：有版本时用交付行，没有版本时回落到需求绑定的资源，没绑定才是「未关联资源」。 */
function deliveryTitle(row: MyOrderRow): string {
  if (row.delivery) {
    return row.delivery.resourceTitle
  }

  const resourceId = row.item?.bound_resource_id
  if (resourceId != null) {
    return resourceById.value.get(resourceId)?.title ?? '资源已不在列表'
  }

  return '未关联资源'
}

/** 交付物副行：平台 · 最新版本 · 版本总数 · 资源状态；没有版本时说清原因，不留一行空白。 */
function deliveryLine(row: MyOrderRow): string {
  return row.delivery ? deliveryVersionLine(row.delivery) : '暂无交付版本'
}

/** 到账合计：没有到账给占位符；笔数只在多笔时说，否则一个合计对不上看到的逐笔流水。 */
function receiptAmountText(row: MyOrderRow): string {
  return row.receipts.length > 0 ? receiptMoney(receiptTotal(row.receipts)) : '—'
}

function receiptMetaText(row: MyOrderRow): string {
  const latest = latestReceiptAt(row.receipts)
  if (!latest) {
    return '暂无到账'
  }

  const counted = row.receipts.length > 1 ? `共 ${row.receipts.length} 笔 · ` : ''
  return `${counted}最近 ${formatCnDateTime(latest)}`
}

/** 打开回款详情：只记行标识，弹窗里从最新的数据里重新取这一行，不存快照。 */
function openReceiptDialog(row: MyOrderRow) {
  activeReceiptKey.value = row.key
  receiptDialogVisible.value = true
}

/* 弹窗里的逐笔按到账时间正序排：托管模式下定金先分账、尾款后分账，
   顺着时间读下来才是「第 1 笔 / 第 2 笔」应有的顺序（与列表里最近一笔在最上面相反）。 */
const activeReceipts = computed(() =>
  [...(activeReceiptRow.value?.receipts ?? [])].sort(
    (left, right) => timeValue(left.paidAt) - timeValue(right.paidAt),
  ),
)

const activeReceiptTotal = computed(() => receiptTotal(activeReceipts.value))

const receiptDialogTitle = computed(() =>
  activeReceiptRow.value?.requirementId
    ? `回款详情 · ${activeReceiptRow.value.requirementId}`
    : '回款详情',
)

function openConversation(item: RequirementItem) {
  conversationRequirement.value = item
  conversationVisible.value = true
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

function conversationForRequirement(item: RequirementItem) {
  return requirementConversationMap.value[item.requirement_id] ?? null
}

function conversationStatusLabel(item: RequirementItem) {
  const conversation = conversationForRequirement(item)
  if (!conversation) {
    return '打开后创建会话'
  }
  return conversation.last_message_at ? `最近：${conversation.last_message_at}` : '暂无消息'
}

function isBriefExpanded(item: RequirementItem) {
  return Boolean(expandedBriefs.value[item.requirement_id])
}

function briefOverflow(item: RequirementItem) {
  return Boolean(briefOverflowMap.value[item.requirement_id])
}

function toggleBrief(item: RequirementItem) {
  expandedBriefs.value = {
    ...expandedBriefs.value,
    [item.requirement_id]: !isBriefExpanded(item),
  }
}

/** 每段正文的类名：本地只拿它逐段量高度，截几行走样式里的 `calc(1.5em * 3)`。 */
const BRIEF_FIELD_BODY_SELECTOR = '.dev-requirement-card__field-body'

/**
 * 量这两段正文有没有被折叠截掉：**逐段量**，任一段被截就出「展开」。
 * 只量整块的话，只要需求描述够长、整块就溢出，验收标准那边有没有被截根本看不出来。
 *
 * 只置位、不翻回 false：展开状态下两段都没有 max-height，量出来当然不溢出；这时若把标记翻回
 * false，「收起」按钮会当场消失，收起来之后连「展开」也没了，用户就再也打不开。
 */
function setBriefRef(el: HTMLElement | null, item: RequirementItem) {
  if (!el) {
    delete briefEls.value[item.requirement_id]
    return
  }

  briefEls.value[item.requirement_id] = el
  void nextTick(() => {
    const target = briefEls.value[item.requirement_id]
    if (!target) {
      return
    }

    const overflows = Array.from(target.querySelectorAll<HTMLElement>(BRIEF_FIELD_BODY_SELECTOR))
      .some((body) => body.scrollHeight > body.clientHeight + 2)
    if (overflows && !briefOverflowMap.value[item.requirement_id]) {
      briefOverflowMap.value = {
        ...briefOverflowMap.value,
        [item.requirement_id]: true,
      }
    }
  })
}

function canOpenContractSign(item: RequirementItem) {
  // 无担保模式（self_managed）不提供合同签署/查看入口
  if (item.payment_mode === 'self_managed') {
    return false
  }
  return Boolean(signingStatusMap.value[item.requirement_id]?.has_contract)
}

function contractButtonLabel(item: RequirementItem) {
  const status = signingStatusMap.value[item.requirement_id]
  return status?.party_b_signed ? '查看合同' : '签署合同'
}

function contractStartHint(item: RequirementItem): string {
  if (!isWaitingContractSign(item)) {
    return ''
  }

  const status = signingStatusMap.value[item.requirement_id]
  if (!status?.party_b_signed && !status?.party_a_signed) {
    // R012：合同页多了「自定义合同附件」；不提示这句双方会直接签平台模板，事后要改只能作废重签。
    return '请完成开发者签署，客户也需完成签署后才能支付定金；如需补充条款可先在合同页准备自定义附件'
  }
  if (!status.party_b_signed) {
    return '等待开发者完成签署'
  }
  return '等待客户签署，双方签署完成后由需求方支付定金'
}

/** 待分账 / 结单后的提示：尾款缴清到渠道分账之间有等待期，结单后还有解除合作窗口。 */
function settlementHint(item: RequirementItem): string {
  if (item.status === 'pending_settlement') {
    return '需求方已缴纳尾款，正在等待渠道分账（通常 7 天），分账完成后正式结单并结算'
  }
  if (item.status === 'completed') {
    return '需求已结单，接单保证金在解除合作窗口结束且无未结解除合作案件后释放'
  }
  return ''
}

// 方案 B：交付物就是绑定资源项目的资源版本，直接复用资源项目版本接口。
function canSubmitDeliveryVersion(item: RequirementItem) {
  return (
    item.bound_resource_id != null &&
    ['in_development', 'pending_final'].includes(item.status)
  )
}

function openDeliveryDialog(item: RequirementItem) {
  if (item.bound_resource_id == null) {
    showToast('当前需求还没有关联资源项目', 'warning')
    return
  }

  deliveryRequirement.value = item
  deliveryDialogVisible.value = true
}

/** 交付版本提交成功后刷新接单列表：需求的交付版本与进度会一起变化。 */
async function handleDeliverySubmitted() {
  await loadMyRequirements()
}

function canReportBreach(item: RequirementItem) {
  return item.payment_mode !== 'self_managed' &&
    // 待分账（尾款已缴、分账排队中）仍在等待期内，此时解除合作会把排队分账置为 cancelled，
    // 与后端一样留出这条出口。
    // 待接单（`pending_deposit`）含「已签约未缴定金」：甲方拒缴定金同样是违约，可以申报，
    // 那种案件没有支付单、只作责任认定；尚未签合同时后端按无生效合同拒掉——结案回滚把需求
    // 打回待接单、合同同时作废，也正落在这条上（BUG-038）。
    ['pending_deposit', 'deposit_paid', 'in_development', 'pending_final', 'pending_settlement'].includes(item.status) &&
    (item.status !== 'pending_deposit' ||
      Boolean(signingStatusMap.value[item.requirement_id]?.has_contract))
}

/** 解除合作入口：结单后打开 `AfterSalesModal`。开发者是乙方，只查看案件与表态，不能发起。 */
function canOpenAfterSales(item: RequirementItem) {
  return item.status === 'completed' && item.payment_mode !== 'self_managed'
}

function openAfterSalesModal(item: RequirementItem) {
  if (!canOpenAfterSales(item)) {
    showToast('只有已结单的需求有解除合作入口', 'warning')
    return
  }
  afterSalesTarget.value = item
  afterSalesVisible.value = true
}

function closeAfterSalesModal() {
  afterSalesVisible.value = false
  afterSalesTarget.value = null
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

async function submitPlatformReview() {
  if (!breachCase.value) {
    return
  }
  platformReviewLoading.value = true
  try {
    breachCase.value = await requestAdapayPlatformReview(auth.token, breachCase.value.id)
    showToast('已申请平台介入，案件转客服人工判定', 'success')
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
 * 已结束的案件回到申报表单：结案 / 驳回会新建一条案件，撤回则沿用同一案件重新提交；
 * 两种情况都保留上一轮案件，供表单上方的说明引用。
 */
function reopenBreachReport() {
  breachNewRound.value = true
  breachReason.value = ''
  breachWithdrawConfirm.value = false
}

/** 上一轮撤回人是不是本人：只有本人撤回才叫「重新申报」，对方撤回时本人是首次申报。 */
const breachWithdrawnByMe = computed(
  () => breachCase.value?.status === 'withdrawn' && breachCase.value.reportedBy === auth.username,
)

/**
 * 无生效合同时不能再发起一轮（BUG-038）：结案（`succeeded`）会作废合同、把需求退回大厅，
 * 此时后端会按「无生效担保合同」直接拒收，界面上不该留一个点了才报错的按钮。
 * 判据用签约状态（后端已把作废合同排除在 `has_contract` 之外），与需求卡片的入口同一口径。
 */
const breachCanStartNewRound = computed(() => {
  const item = breachRequirement.value
  if (item == null || item.payment_mode === 'self_managed') {
    return false
  }
  return Boolean(signingStatusMap.value[item.requirement_id]?.has_contract)
})

/**
 * 撤回后再次申请沿用同一条案件（后端复用该行、案件编号不变），只有驳回 / 结案才会新建案件。
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
  // 结案（`succeeded`）按「结案即自动解除」作废合同、把需求退回大厅：同一需求上已经没有可裁决
  // 的合同，所以不是「再提一条新案件」而是「重新接单并签约」（BUG-038）。
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

function openContractSign(item: RequirementItem) {
  router.push({
    name: 'contract-sign',
    query: { requirement_id: item.requirement_id, from: 'dev' },
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

function handleContractButtonClick(item: RequirementItem) {
  if (contractButtonLabel(item) === '查看合同') {
    void viewContractPreview(item)
    return
  }
  openContractSign(item)
}

/**
 * 担保模式下，接单不再自动创建合同，需由需求方或开发者主动发起。
 */
function canCreateRequirementContract(item: RequirementItem) {
  if (item.payment_mode === 'self_managed') {
    return false
  }
  if (item.status !== 'pending_deposit' && item.status !== 'deposit_paid') {
    return false
  }
  return !signingStatusMap.value[item.requirement_id]?.has_contract
}

async function createRequirementContractAction(item: RequirementItem) {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }
  contractCreatingId.value = item.requirement_id
  try {
    await createRequirementContract(auth.token, item.requirement_id)
    // R012：发起后引导到合同页的「自定义合同附件」区；附件经平台审核放行后才能发起签署。
    showToast('合同已发起；如需补充条款，可在合同页准备自定义附件，平台放行后即可签署', 'success')
    const status = await fetchDevContractSigningStatus(auth.token, item.requirement_id)
    signingStatusMap.value = { ...signingStatusMap.value, [item.requirement_id]: status }
    openContractSign(item)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '发起合同失败', 'error')
  } finally {
    contractCreatingId.value = ''
  }
}

async function loadRequirementConversations() {
  if (!auth.token) {
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
</script>

<template>
  <div class="dev-page dev-page--my-requirements">
    <div class="dev-meta-strip">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">总需求单</span>
        <span class="dev-meta-strip__value">{{ rows.length }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">已关联资源</span>
        <span class="dev-meta-strip__value">{{ boundCount }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">开发中</span>
        <span class="dev-meta-strip__value">{{ activeCount }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">累计到账</span>
        <span class="dev-meta-strip__value">{{ receiptMoney(incomeTotal) }}</span>
      </div>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <TButton icon-only aria-label="刷新接单列表" @click="loadMyRequirements">
          <TIcon>
            <Refresh />
          </TIcon>
        </TButton>
      </div>
    </div>

    <TCard class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">接单与交付</h3>
        </div>
      </div>

      <div class="dev-toolbar">
        <TSelect
          v-model="filters.status"
          clearable
          placeholder="需求状态"
          class="dev-toolbar__field"
          aria-label="按需求状态筛选"
        >
          <TOption label="待签合同" value="contract_pending" />
          <TOption label="待缴定金" value="pending_deposit" />
          <TOption label="开发中" value="in_development" />
          <TOption label="待付尾款" value="pending_final" />
          <TOption label="待分账" value="pending_settlement" />
          <TOption label="已完成" value="completed" />
          <TOption label="已取消" value="cancelled" />
          <TOption label="需求已解绑" value="unlinked" />
        </TSelect>

        <TInput
          v-model="filters.keyword"
          clearable
          placeholder="搜索需求编号、标题、资源、版本或流水号"
          class="dev-toolbar__search"
        >
          <template #prefix>
            <TIcon>
              <Search />
            </TIcon>
          </template>
        </TInput>

        <div class="dev-toolbar__actions">
          <span v-if="hasActiveFilters" class="dev-toolbar__hint">
            筛选出 {{ filteredRows.length }} / {{ mergedRows.length }} 条
          </span>
          <TButton variant="outline" @click="resetFilters">
            <TIcon>
              <RefreshLeft />
            </TIcon>
            <span>重置</span>
          </TButton>
        </div>
      </div>

      <!-- 列表容器走统一层的 .dev-stack-list：它给的就是「卡片式列表」的 14px 行距，
           与资源项目、我的团队的卡片列表差同一档。
           一行一个需求单：交付物与到账长在同一张卡上（原「交付记录」页的两列），
           没被任何需求单绑定的交付、以及需求已解绑的到账，同样成行但不出签署与操作栏。 -->
      <TLoading tag="div" class="dev-stack-list" :loading="loading">
        <div v-if="filteredRows.length === 0" class="dev-empty-state">{{ emptyText }}</div>
        <article v-for="row in pagedRows" :key="row.key" class="dev-requirement-card">
          <header class="dev-requirement-card__head">
            <div class="dev-requirement-card__title-block">
              <span class="dev-requirement-hall__requirement-id">{{ row.requirementId }}</span>
              <h3 class="dev-requirement-hall__title">{{ rowTitle(row) }}</h3>
              <!-- 需求说明：需求描述与验收标准各一段，收起时**各段各截头几行**（见样式里的 .is-collapsed），
                   一个「展开 / 收起」管两段——各挂一个折叠按钮的话，同一块正文会有两个开关。 -->
              <div
                v-if="row.item"
                class="dev-requirement-card__brief"
                :class="{ 'is-collapsed': !isBriefExpanded(row.item) }"
                :ref="(el) => setBriefRef(el as HTMLElement | null, row.item!)"
              >
                <section class="dev-requirement-card__field">
                  <span class="dev-requirement-card__field-label">需求描述</span>
                  <article
                    class="dev-requirement-hall__desc dev-requirement-card__description dev-requirement-card__field-body"
                    v-html="requirementFieldHtml(row.item.description)"
                  ></article>
                </section>
                <section class="dev-requirement-card__field">
                  <span class="dev-requirement-card__field-label">验收标准</span>
                  <article
                    class="dev-requirement-hall__desc dev-requirement-card__description dev-requirement-card__field-body"
                    v-html="
                      requirementFieldHtml(
                        row.item.acceptance_criteria,
                        '当前需求暂未补充验收标准。',
                      )
                    "
                  ></article>
                </section>
              </div>
              <p v-else class="dev-requirement-card__description">
                这条到账所属的需求已解除绑定，需求单列表里已经查不到它。
              </p>
              <button
                v-if="row.item && (isBriefExpanded(row.item) || briefOverflow(row.item))"
                type="button"
                class="dev-requirement-card__description-toggle"
                @click="toggleBrief(row.item)"
              >
                <TIcon>
                  <ArrowUp v-if="isBriefExpanded(row.item)" />
                  <ArrowDown v-else />
                </TIcon>
                <span>{{ isBriefExpanded(row.item) ? '收起' : '展开' }}</span>
              </button>
            </div>
            <div class="dev-requirement-card__tags">
              <!-- 状态标签已去掉：卡内的流程进度条（RequirementProgressGuide）已经写明走到哪一步，
                   卡片头再顶一枚「开发中 / 待付尾款」是同一条信息的第二遍。
                   发布方式走全站共用的 .pay-mode-chip（见 PaymentModeChip），
                   与需求大厅、我的需求、搜索结果同一枚胶囊。 -->
              <PaymentModeChip v-if="row.item" :mode="row.item.payment_mode" />
            </div>
          </header>

          <div class="dev-requirement-card__meta">
            <span v-if="row.item" class="dev-requirement-card__meta-item">
              <label>预算</label>
              <strong>{{ formatMoney(row.item.budget) }}</strong>
            </span>
            <span class="dev-requirement-card__meta-item">
              <label>委托方</label>
              <strong>{{ rowCustomer(row) || '—' }}</strong>
            </span>
            <span class="dev-requirement-card__meta-item">
              <label>最近更新</label>
              <strong>{{ rowUpdatedAt(row) }}</strong>
            </span>
            <span v-if="row.item" class="dev-requirement-card__meta-item">
              <label>会话</label>
              <strong>{{
                conversationLoading ? '加载中' : conversationStatusLabel(row.item)
              }}</strong>
            </span>
          </div>

          <!-- 交付物与到账：原「交付记录」页的两列，现在与需求单同卡。
               到账是多笔时行上只放合计与笔数，逐笔摊开在「查看回款详情」弹窗里。 -->
          <div class="dev-requirement-card__delivery">
            <div class="dev-delivery-cell">
              <label>交付物</label>
              <strong>{{ deliveryTitle(row) }}</strong>
              <span class="dev-delivery-cell__line">{{ deliveryLine(row) }}</span>
            </div>
            <div class="dev-delivery-cell">
              <label>到账</label>
              <strong class="dev-delivery-cell__amount">{{ receiptAmountText(row) }}</strong>
              <span class="dev-delivery-cell__line">{{ receiptMetaText(row) }}</span>
              <button
                v-if="row.receipts.length > 0"
                type="button"
                class="dev-requirement-card__receipt-toggle"
                @click="openReceiptDialog(row)"
              >
                <TIcon><View /></TIcon>
                <span>查看回款详情</span>
              </button>
            </div>
          </div>

          <div v-if="row.item" class="dev-requirement-card__progress">
            <RequirementProgressGuide
              :requirement="row.item"
              :payment-mode="row.item.payment_mode"
              view="dev"
              :contract-status="signingStatusMap[row.item.requirement_id]"
            />
          </div>

          <div v-if="row.item && settlementHint(row.item)" class="signing-start-hint">
            {{ settlementHint(row.item) }}
          </div>

          <div
            v-if="row.item && row.item.payment_mode !== 'self_managed'"
            class="dev-requirement-card__signing"
          >
            <div class="signing-status-bar">
              <span
                class="signing-step"
                :class="
                  signingStatusMap[row.item.requirement_id]?.has_contract ? 'done' : 'pending'
                "
              >
                协议已创建
              </span>
              <span class="signing-arrow">›</span>
              <span
                class="signing-step"
                :class="
                  signingStatusMap[row.item.requirement_id]?.party_b_signed ? 'done' : 'pending'
                "
              >
                乙方已签
              </span>
              <span class="signing-arrow">›</span>
              <span
                class="signing-step"
                :class="
                  signingStatusMap[row.item.requirement_id]?.party_a_signed ? 'done' : 'pending'
                "
              >
                甲方已签
              </span>
            </div>
            <div v-if="contractStartHint(row.item)" class="signing-start-hint">
              {{ contractStartHint(row.item) }}
            </div>
          </div>

          <!-- 签署与操作栏只给需求单行：补充行（未关联需求的交付／到账）没有可执行的接单动作。
               行内事件处理器拿不到 v-if 的类型收窄，所以这一段的处理函数参数带 `!`。 -->
          <footer v-if="row.item" class="dev-requirement-card__actions">
            <!-- 行内操作按钮走统一层的 .dev-list-actions（32px 高 / 10px 圆角），
                 与资源列表、我的团队的行内按钮同一规格。
                 这里原先是本页自写的 .dev-requirement-card__buttons + 逐个 size="small"
                 （Element 的 24px 小号），同一张卡里按钮比顶部工具栏矮一档。 -->
            <div class="dev-list-actions">
              <!-- 行内按钮的上色走统一层的 .dev-action--soft / .dev-action--soft-danger：
                   原来挂的是裸 `type="primary" plain` / `type="danger" plain`，
                   Element 的 plain 变体给的是浅蓝底（#e8edfa）与粉底三件套，
                   与表格行里的白底 + 主色描边不是一套，禁用态的「解除合作」更是一片粉。 -->
              <TButton
                variant="outline"
                tone="accent"
                v-if="canSubmitDeliveryVersion(row.item)"
                title="交付物以绑定资源项目的新版本提交"
                @click="openDeliveryDialog(row.item!)"
              >
                提交交付版本
              </TButton>
              <TButton
                variant="outline"
                tone="accent"
                v-if="canOpenAfterSales(row.item)"
                :class="{ 'has-todo-badge': afterSalesBadgeFor(row.item.requirement_id) }"
                @click="openAfterSalesModal(row.item!)"
              >
                解除合作
                <span
                  v-if="afterSalesBadgeFor(row.item.requirement_id)"
                  class="todo-badge"
                  :title="`有 ${afterSalesPendingCount(row.item.requirement_id)} 条解除合作待你处理`"
                  >{{ afterSalesBadgeFor(row.item.requirement_id) }}</span
                >
              </TButton>
              <TButton
                variant="outline"
                tone="danger"
                v-if="canReportBreach(row.item)"
                @click="openBreachReport(row.item!)"
              >
                解除合作
              </TButton>
              <TButton
                variant="solid"
                tone="accent"
                v-if="canCreateRequirementContract(row.item)"
                :loading="contractCreatingId === row.item.requirement_id"
                @click="createRequirementContractAction(row.item!)"
              >
                发起合同
              </TButton>
              <TButton
                v-if="canOpenContractSign(row.item)"
                @click="handleContractButtonClick(row.item!)"
              >
                {{ contractButtonLabel(row.item) }}
              </TButton>
              <TButton
                variant="outline"
                tone="accent"
                class="dev-action--soft dev-requirement-card__conversation"
                @click="openConversation(row.item!)"
              >
                <TIcon><ChatDotRound /></TIcon>
                <span>会话</span>
              </TButton>
            </div>
          </footer>
        </article>
      </TLoading>

      <div class="dev-pager">
        <div class="dev-pager__count">
          <TSelect v-model="pageSize" aria-label="每页条数" class="dev-pager__size">
            <TOption
              v-for="size in LIST_PAGE_SIZES"
              :key="size"
              :label="`${size} 条/页`"
              :value="size"
            />
          </TSelect>
        </div>
        <TPagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="filteredTotal"
          :pager-count="5"
          background
          aria-label="接单与交付列表分页"
        />
      </div>
    </TCard>

    <!-- 回款详情弹窗：卡上只放合计与笔数，逐笔到这里摊开。
         金额、时间、流水号都来自同一份钱包回执（与「收益钱包 → 收入记录」同一个接口），
         不在这里另算，避免两处对不上。 -->
    <TDialog
      v-model:open="receiptDialogVisible"
      :title="receiptDialogTitle"
      width="560px"
      class="dev-dialog"
    >
      <div v-if="activeReceiptRow" class="dev-receipt-detail">
        <div class="dev-receipt-detail__head">
          <div class="dev-receipt-detail__title">{{ rowTitle(activeReceiptRow) }}</div>
          <div class="dev-receipt-detail__meta">
            <span>{{ activeReceiptRow.requirementId }}</span>
            <span>委托方 {{ rowCustomer(activeReceiptRow) || '—' }}</span>
            <TTag variant="outline" :tone="rowStatusType(activeReceiptRow)">
              {{ rowStatusLabel(activeReceiptRow) }}
            </TTag>
          </div>
        </div>

        <div class="dev-receipt-detail__total">
          <span class="dev-receipt-detail__total-label">
            累计到账 · 共 {{ activeReceipts.length }} 笔
          </span>
          <span class="dev-figure dev-figure--sm">{{ receiptMoney(activeReceiptTotal) }}</span>
        </div>

        <ul class="dev-receipt-detail__list">
          <li
            v-for="(receipt, index) in activeReceipts"
            :key="receipt.paymentId"
            class="dev-receipt-detail__item"
          >
            <div class="dev-receipt-detail__item-head">
              <span class="dev-receipt-detail__item-index">第 {{ index + 1 }} 笔</span>
              <span class="dev-receipt-detail__item-amount">{{
                receiptMoney(receipt.amount)
              }}</span>
            </div>
            <div class="dev-receipt-detail__facts">
              <div class="dev-receipt-detail__fact">
                <span class="dev-receipt-detail__fact-label">到账时间</span>
                <span class="dev-receipt-detail__fact-value">{{
                  formatCnDateTime(receipt.paidAt)
                }}</span>
              </div>
              <div class="dev-receipt-detail__fact">
                <span class="dev-receipt-detail__fact-label">支付流水号</span>
                <span class="dev-receipt-detail__fact-value">{{ receipt.paymentId }}</span>
              </div>
            </div>
          </li>
        </ul>

        <p class="dev-receipt-detail__note">
          托管模式下定金与尾款各分账一次，同一需求会有两笔到账，金额按分账净额逐笔列出。
        </p>
      </div>

      <template #footer>
        <TButton variant="outline" @click="receiptDialogVisible = false">关闭</TButton>
      </template>
    </TDialog>

    <DeliverySubmitDialog
      v-model:visible="deliveryDialogVisible"
      :token="auth.token"
      :bound-resource-id="deliveryRequirement?.bound_resource_id ?? null"
      @submitted="handleDeliverySubmitted"
    />

    <TDialog
      v-model:open="breachVisible"
      :title="breachDialogTitle()"
      width="520px"
      class="dev-dialog"
      :mask-closable="false"
      :escape-closable="false"
      @close="closeBreachReport"
    >
      <div class="delivery-dialog-body">
        <p class="unbind-dialog-tip">
          提交后案件进入「协商中」：双方先在案件内协商定金与尾款的退还额度，谈成即直接退款结案。
          协商不成再由任一方申请平台介入，平台核对合同、支付、交付与沟通记录，由审核智能体判定责任方，客服人工复核。
        </p>
        <p v-if="breachCaseLoading" class="unbind-dialog-tip">正在加载解除合作案件…</p>
        <template v-else-if="breachCase && !breachNewRound">
          <TDescriptions :column="1" border size="sm">
            <TDescriptionsItem label="案件编号">{{ breachCase.caseNo }}</TDescriptionsItem>
            <TDescriptionsItem label="当前状态">
              {{ breachStatusLabel(breachCase.status) }}
            </TDescriptionsItem>
            <TDescriptionsItem v-if="breachCase.status === 'withdrawn'" label="申请人">
              {{ breachWithdrawnByMe ? '我方' : '对方' }}
            </TDescriptionsItem>
            <TDescriptionsItem
              v-if="breachCase.status === 'withdrawn' && breachCase.resolvedAt"
              label="撤回时间"
            >
              {{ formatCnDateTime(breachCase.resolvedAt) }}
            </TDescriptionsItem>
            <TDescriptionsItem v-if="breachCase.liableParty" label="责任认定">
              {{ breachLiablePartyLabel(breachCase.liableParty) }}
            </TDescriptionsItem>
            <TDescriptionsItem label="申请理由">{{ breachCase.reason }}</TDescriptionsItem>
            <TDescriptionsItem
              v-if="breachCase.aiJudgedAt || breachCase.aiReasoning"
              label="AI 判定"
            >
              {{
                breachCase.aiLiableParty
                  ? breachLiablePartyLabel(breachCase.aiLiableParty)
                  : '无法判定，已转客服人工判定'
              }}
            </TDescriptionsItem>
            <TDescriptionsItem v-if="breachCase.aiJudgedAt" label="判定时间">
              {{ formatCnDateTime(breachCase.aiJudgedAt) }}
            </TDescriptionsItem>
            <TDescriptionsItem v-if="breachCase.aiReasoning" label="判定理由">
              {{ breachCase.aiReasoning }}
            </TDescriptionsItem>
            <TDescriptionsItem v-if="breachCase.decisionDeadlineAt" label="表态截止">
              {{ formatCnDateTime(breachCase.decisionDeadlineAt) }}
            </TDescriptionsItem>
            <TDescriptionsItem v-if="showBreachDecisions(breachCase)" label="我方表态">
              {{ breachDecisionText(breachCase.developerDecision) }}
            </TDescriptionsItem>
            <TDescriptionsItem v-if="showBreachDecisions(breachCase)" label="对方表态">
              {{ breachDecisionText(breachCase.customerDecision) }}
            </TDescriptionsItem>
            <TDescriptionsItem label="资金处理">
              定金 ¥{{ breachCase.depositAmountCny }} · 已退尾款 ¥{{ breachCase.refundAmountCny }} ·
              赔付 ¥{{ breachCase.compensationAmountCny
              }}<template v-if="breachCase.extraCompensationFen > 0">
                · 额外赔偿 ¥{{ breachCase.extraCompensationCny }}</template
              >
            </TDescriptionsItem>
            <TDescriptionsItem v-if="breachCase.verdictSource" label="判定来源">
              {{ breachVerdictSourceText(breachCase.verdictSource) }}
            </TDescriptionsItem>
            <TDescriptionsItem v-if="breachCase.resolutionNote" label="处理说明">
              {{ breachCase.resolutionNote }}
            </TDescriptionsItem>
          </TDescriptions>
          <!-- 上一轮结案会把合同作废、需求退回大厅：这时没有生效合同可依，按钮不给，
               但必须把「为什么不能再发起、要做什么」写清楚（BUG-038）。 -->
          <p
            v-if="
              (breachCase.status === 'succeeded' || breachCase.status === 'rejected') &&
              !breachCanStartNewRound
            "
            class="unbind-dialog-tip"
          >
            {{ breachRoundHint() }}
          </p>

          <!-- 协商阶段：对方同意即无责退出，不同意才申请平台介入。 -->
          <template v-if="isTerminationNegotiating(breachCase)">
            <p class="unbind-dialog-tip">
              先协商：对方同意即按协商一致处理——无责退出，定金全额原路退还需求方、无违约金、不产生赔付。
              对方不同意或超时未回应，任一方可申请平台介入。
            </p>
            <TInput
              v-if="canRespondTermination(breachCase)"
              show-count
              v-model="breachDecisionNote"
              type="textarea"
              :rows="3"
              :maxlength="1000"
              placeholder="可选：说明你同意或不同意的立场，双方与客服都会看到"
            />
            <p v-else class="unbind-dialog-tip">已提交申请，等待对方回应。</p>
          </template>
          <p v-else-if="breachCase.mutualAgreedAt" class="unbind-dialog-line">
            协商结果：双方协商一致（无责退出），{{ formatCnDateTime(breachCase.mutualAgreedAt) }}
          </p>
          <p v-else-if="breachCase.mutualRejectedAt" class="unbind-dialog-line">
            协商结果：对方不同意解除合作（{{ formatCnDateTime(breachCase.mutualRejectedAt) }}），任一方可申请平台介入
          </p>

          <div v-if="canDecideBreachCase(breachCase)" class="breach-decision">
            <p class="unbind-dialog-line">
              请选择是否接受 AI
              判定：双方都接受后平台才会执行退款／赔付；任一方不接受或逾期未全部表态，案件转客服人工判定。
            </p>
            <TInput
              show-count
              v-if="breachRejectPanel"
              v-model="breachDecisionNote"
              type="textarea"
              :rows="3"
              :maxlength="1000"
              placeholder="可选：说明不接受该判定的理由，便于客服人工复核"
            />
            <div class="breach-decision__actions">
              <template v-if="breachRejectPanel">
                <TButton :disabled="breachDecisionLoading" @click="cancelBreachRejectPanel"
                  >取消</TButton
                >
                <TButton
                  variant="solid"
                  tone="danger"
                  :loading="breachDecisionLoading"
                  @click="submitBreachDecision('rejected')"
                  >确认不接受</TButton
                >
              </template>
              <template v-else>
                <TButton
                  variant="outline"
                  tone="danger"
                  :disabled="breachDecisionLoading"
                  @click="openBreachRejectPanel"
                  >不接受</TButton
                >
                <TButton
                  variant="solid"
                  tone="accent"
                  :loading="breachDecisionLoading"
                  @click="submitBreachDecision('accepted')"
                  >接受判定</TButton
                >
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
            class="unbind-dialog-tip"
          >
            平台按 AI 判定 + 客服人工审核认定责任方，判定完成后由双方各自选择是否接受。
          </p>

          <div v-if="breachWithdrawConfirm" class="breach-decision">
            <p class="unbind-dialog-line">
              确认撤回本次解除合作申请？撤回后本次申请结束，如仍有争议可在同一需求上重新发起；撤回不会触发任何退款或赔付。
            </p>
            <div class="breach-decision__actions">
              <TButton :disabled="breachWithdrawLoading" @click="cancelBreachWithdrawConfirm"
                >再想想</TButton
              >
              <TButton
                variant="solid"
                tone="danger"
                :loading="breachWithdrawLoading"
                @click="submitBreachWithdraw"
                >确认撤回申请</TButton
              >
            </div>
          </div>
        </template>
        <TForm v-else label-position="top">
          <p v-if="breachNewRound" class="unbind-dialog-tip">{{ breachRoundHint() }}</p>
          <TFormItem label="事实与依据" required>
            <TInput
              show-count
              v-model="breachReason"
              type="textarea"
              :rows="6"
              :maxlength="2000"
              placeholder="请填写时间、已交付内容、沟通记录和希望平台核查的事实"
            />
          </TFormItem>
        </TForm>
      </div>
      <template #footer>
        <TButton
          :disabled="
            platformReviewLoading || breachLoading || breachDecisionLoading || breachWithdrawLoading
          "
          @click="closeBreachReport"
        >
          {{ breachCase && !breachNewRound ? '关闭' : '取消' }}
        </TButton>
        <TButton
          variant="outline"
          tone="danger"
          v-if="canWithdrawBreachCase(breachCase) && !breachWithdrawConfirm"
          :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
          @click="openBreachWithdrawConfirm"
          >撤回申请</TButton
        >
        <TButton
          variant="solid"
          tone="accent"
          v-else-if="breachCase?.status === 'withdrawn' && !breachNewRound"
          :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
          @click="reopenBreachReport"
          >{{ breachWithdrawnByMe ? '重新发起' : '提交解除合作申请' }}</TButton
        >
        <TButton
          variant="solid"
          tone="accent"
          v-else-if="
            (breachCase?.status === 'rejected' || breachCase?.status === 'succeeded') &&
            !breachNewRound &&
            breachCanStartNewRound
          "
          :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
          @click="reopenBreachReport"
          >发起新的解除合作</TButton
        >
        <TButton
          variant="outline"
          tone="accent"
          v-if="canRequestPlatformReview(breachCase)"
          :loading="platformReviewLoading"
          @click="submitPlatformReview"
          >申请平台介入</TButton
        >
        <template v-if="canRespondTermination(breachCase)">
          <TButton
            variant="outline"
            tone="danger"
            :loading="breachDecisionLoading"
            :disabled="platformReviewLoading || breachWithdrawLoading"
            @click="submitBreachDecision('rejected')"
            >不同意</TButton
          >
          <TButton
            variant="solid"
            tone="accent"
            :loading="breachDecisionLoading"
            :disabled="platformReviewLoading || breachWithdrawLoading"
            @click="submitBreachDecision('accepted')"
            >同意解除</TButton
          >
        </template>
        <TButton
          variant="solid"
          tone="accent"
          v-else-if="!breachCase || breachNewRound"
          :loading="breachLoading"
          @click="submitBreachReport"
        >
          {{ breachSubmitLabel() }}
        </TButton>
      </template>
    </TDialog>

    <AfterSalesModal
      :visible="afterSalesVisible"
      :token="auth.token"
      :current-username="auth.username"
      :requirement-id="afterSalesTarget?.requirement_id ?? ''"
      :requirement-title="afterSalesTarget?.title ?? ''"
      :requirement-budget="afterSalesTarget?.budget ?? null"
      :can-open-case="false"
      @close="closeAfterSalesModal"
    />

    <RequirementConversationModal
      :visible="conversationVisible"
      api-mode="dev"
      :token="auth.token"
      :current-username="auth.username"
      :requirement-id="conversationRequirement?.requirement_id ?? ''"
      :title="conversationRequirement?.title"
      @updated="applyConversationDetail"
      @close="closeConversation"
    />
  </div>
</template>

<style scoped>
.dev-requirement-card {
  /* 需求说明（需求描述 + 验收标准）的排版参数：正文行高、收起时留几行。
     正文的 line-height、收起的 max-height、收起时压平的段落网格三处必须是同一个值，
     提到卡片上做变量，免得三处各写一遍、改一处忘两处。 */
  --dev-brief-line-height: 1.5;
  --dev-brief-collapsed-lines: 3;
  display: grid;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid var(--dev-line);
  border-radius: var(--dev-radius-inner);
  background: var(--dev-surface-strong);
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.dev-requirement-card:hover {
  border-color: var(--wb-accent-line);
  box-shadow: 0 12px 26px color-mix(in srgb, var(--dev-ink) 10%, transparent);
}

.dev-requirement-card__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.dev-requirement-card__title-block {
  display: grid;
  gap: 4px;
  min-width: 0;
}

/* 卡片式列表的行标题取统一层的 .dev-stack-item__title 档位（16px），
   原来是 17px，比同一页的其他行标题大一档 */
.dev-requirement-card__title-block .dev-requirement-hall__title {
  font-size: 16px;
}

/* 需求说明：需求描述一段、验收标准一段，两段都是正文（13px），段标题走下面那个小标签。
   两段字数都会很多，所以收起时**各段各截头几行**（见下面的 .is-collapsed），
   不是整块只截一次——整块截的话描述一长，验收标准整段就都看不见了。 */
.dev-requirement-card__brief {
  display: grid;
  gap: 12px;
}

.dev-requirement-card__field {
  display: grid;
  gap: 4px;
  min-width: 0;
}

/* 段标题走卡片里既有的小标签口径（与 .dev-requirement-card__meta-item label 同档 11px）：
   验收标准与需求描述是两件事，不能糊成一段。 */
.dev-requirement-card__field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--dev-muted);
}

/* 收起时每段各留 N 行：3 行 × 行高 1.5 × 字号 13px = 58.5px。
   按行高算而不是写死 px，改字号或改行数都不用回来重新量。 */
.dev-requirement-card__brief.is-collapsed .dev-requirement-card__field-body {
  max-height: calc(1em * var(--dev-brief-line-height) * var(--dev-brief-collapsed-lines));
  overflow: hidden;
}

/* 卡片里的描述是正文，取 13px（与 .dev-stack-item__meta 同档）；
   表格单元格里的描述用 .dev-requirement-hall__desc 的 12px 弱字，
   这里带上一层 .dev-requirement-card__title-block 前缀，才稳定压得住那份 12px。

   正文里是富文本，门户那套全局规则（resource-core.css）会直接命中里面的段落与标题——
   `p { line-height: 1.6; color: var(--text-sub) }`、`h1 / h2 { font-size: 2.5rem / 1.5rem }`。
   其中行高最要命：段落实际是 20.8px 高，而收起的 max-height 是按 19.5px 算的，
   截断就切在行中间（「3. 交付源码与部署说明」被削掉一半就是这么来的），
   所以正文字号、行高、颜色都在这里重新定死，段落与标题再逐个 reset（见下面）。 */
.dev-requirement-card__title-block .dev-requirement-card__description {
  margin: 0;
  font-size: 13px;
  line-height: var(--dev-brief-line-height);
  color: var(--dev-muted);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

/* 行高与颜色一律回到卡片正文：富文本里的段落、列表项、标题都得压在同一个行网格上，
   否则收起时截断落不到行与行之间。 */
.dev-requirement-card__description :deep(p),
.dev-requirement-card__description :deep(li),
.dev-requirement-card__description :deep(h1),
.dev-requirement-card__description :deep(h2),
.dev-requirement-card__description :deep(h3),
.dev-requirement-card__description :deep(h4),
.dev-requirement-card__description :deep(h5),
.dev-requirement-card__description :deep(h6) {
  line-height: inherit;
  color: inherit;
}

/* 从别处粘进来的标题一律压回正文字号（h1 是 2.5rem、h2 是 1.5rem，
   卡片里放不下，收起的那 3 行也装不下一行标题），只留加粗与深色做层级。 */
.dev-requirement-card__description :deep(h1),
.dev-requirement-card__description :deep(h2),
.dev-requirement-card__description :deep(h3),
.dev-requirement-card__description :deep(h4),
.dev-requirement-card__description :deep(h5),
.dev-requirement-card__description :deep(h6) {
  margin: 10px 0 4px;
  font-size: 13px;
  font-weight: 700;
  color: var(--dev-ink);
}

.dev-requirement-card__description :deep(p) {
  margin: 0 0 8px;
}

/* 列表缩进按 13px 正文收窄（浏览器默认 40px 在卡片里太空），段间距与段落对齐 8px */
.dev-requirement-card__description :deep(ul),
.dev-requirement-card__description :deep(ol) {
  margin: 0 0 8px;
  padding-left: 20px;
}

.dev-requirement-card__description :deep(li) {
  margin: 2px 0;
}

/* 首尾元素的外边距贴齐容器，卡片里不外溢出一截空白 */
.dev-requirement-card__description :deep(> *:first-child) {
  margin-top: 0;
}

.dev-requirement-card__description :deep(> *:last-child) {
  margin-bottom: 0;
}

/* 加粗在弱字上只粗一点点，扫读时抓不住，所以再加一档色 */
.dev-requirement-card__description :deep(strong),
.dev-requirement-card__description :deep(b) {
  color: var(--dev-ink);
}

.dev-requirement-card__description :deep(a) {
  color: var(--dev-blue);
  overflow-wrap: anywhere;
}

.dev-requirement-card__description :deep(a:hover) {
  text-decoration: underline;
}

.dev-requirement-card__description :deep(blockquote) {
  margin: 8px 0;
  padding-left: 12px;
  border-left: 3px solid var(--wb-accent-line);
}

.dev-requirement-card__description :deep(hr) {
  margin: 12px 0;
  border: 0;
  border-top: 1px solid var(--dev-line);
}

/* 描述里可能夹着图片、视频、表格与代码块（富文本编辑器都插得进来）。
   卡片宽度有限，一律按卡片宽收住，不让它们把卡片撑出横向滚动。 */
.dev-requirement-card__description :deep(img),
.dev-requirement-card__description :deep(video) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 8px 0;
  border-radius: 8px;
}

.dev-requirement-card__description :deep(table) {
  display: block;
  max-width: 100%;
  margin: 8px 0;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: 12px;
}

.dev-requirement-card__description :deep(th),
.dev-requirement-card__description :deep(td) {
  padding: 6px 10px;
  border: 1px solid var(--dev-line);
  text-align: left;
  vertical-align: top;
}

.dev-requirement-card__description :deep(th) {
  background: var(--dev-bg);
  font-weight: 700;
  color: var(--dev-ink);
}

.dev-requirement-card__description :deep(pre) {
  margin: 8px 0;
  overflow-x: auto;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--dev-bg);
  white-space: pre;
}

.dev-requirement-card__description :deep(code) {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--dev-bg);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--dev-ink);
}

/* 代码块里的 code 不再叠一层行内码的底色与内边距 */
.dev-requirement-card__description :deep(pre code) {
  padding: 0;
  border-radius: 0;
  background: transparent;
  font-size: inherit;
}

/* 收起时把正文里所有块级外边距压平：几像素的段间距就会让行落不到 19.5px 的行网格上，
   max-height 只能切在行中间。压平之后每行等高，截断正好落在行与行之间，
   不需要再叠一层渐隐遮罩。 */
.dev-requirement-card__brief.is-collapsed .dev-requirement-card__description :deep(*) {
  margin-block: 0;
}

.dev-requirement-card__description-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dev-blue);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.dev-requirement-card__description-toggle:hover {
  color: var(--dev-blue);
  text-decoration: underline;
}

/* 会话按钮的圆角与字重都走统一层的 .dev-action--soft（10px 方角），
   这里不再把它单独扭成胶囊——同一排的「签署合同 / 解除合作」都是方角，
   只有这一颗是 999px 时整排按钮横竖不齐（见 dev-base.css 的行内软按钮一节）。 */
.dev-requirement-card__conversation {
  font-weight: 700;
}

.dev-requirement-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

.dev-requirement-card__meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 12px 0;
  border-top: 1px dashed var(--dev-line);
  border-bottom: 1px dashed var(--dev-line);
}

.dev-requirement-card__meta-item {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.dev-requirement-card__meta-item label {
  font-size: 11px;
  font-weight: 600;
  color: var(--dev-muted);
}

.dev-requirement-card__meta-item strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--dev-ink);
  overflow-wrap: anywhere;
}

/* === 交付物与到账（合并自「交付记录」页） ===
   两格并排：左边是交付的资源与版本，右边是到账合计、笔数与最近一笔时间。
   窄屏收成一列（见本页 720px 的媒体查询）。 */
.dev-requirement-card__delivery {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.dev-delivery-cell {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--dev-line);
  border-radius: var(--dev-radius-inner);
  background: var(--dev-bg);
}

.dev-delivery-cell label {
  font-size: 11px;
  font-weight: 600;
  color: var(--dev-muted);
}

.dev-delivery-cell strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--dev-ink);
  overflow-wrap: anywhere;
}

/* 到账金额用金色：与收益钱包的入账、回款详情里的逐笔金额同一支。
   选择器带 `strong` 是为了压过上面那条（同权重、写在后面）。 */
strong.dev-delivery-cell__amount {
  color: var(--dev-gold);
  font-variant-numeric: tabular-nums;
}

.dev-delivery-cell__line {
  font-size: 12px;
  line-height: 1.5;
  color: var(--dev-ink-soft);
  overflow-wrap: anywhere;
}

/* 查看回款详情：与描述「展开 / 收起」同一支文字按钮，不挤进行内操作栏 */
.dev-requirement-card__receipt-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-self: start;
  margin-top: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dev-blue);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.dev-requirement-card__receipt-toggle:hover {
  text-decoration: underline;
}

.dev-requirement-card__signing {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 配色统一：这里原先混用了青绿 #4caf81、琥珀 #b45309、Element 灰 #909399/#c0c4cc/#303133、
   暖黄 rgba(251,191,36)，与开发者体系的蓝/青/金三支强调色都对不上，一律换成令牌。 */
.dev-requirement-card__actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 0;
  padding: 12px 0 0;
  border-top: 1px dashed var(--dev-line);
  background: transparent;
  text-align: left;
}

/* 行内操作按钮的容器与规格都走统一层的 .dev-list-actions（见 dev-base.css），
   本页不再自己写一份 flex 布局，否则按钮高度会退回按钮自己的默认档。 */

.signing-status-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  max-width: 100%;
  row-gap: 6px;
}

.signing-step {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  white-space: nowrap;
}

.signing-step.done {
  background: color-mix(in srgb, var(--dev-cyan) 14%, transparent);
  color: var(--dev-cyan);
  font-weight: 700;
}

.signing-step.pending {
  background: color-mix(in srgb, var(--dev-muted) 16%, transparent);
  color: var(--dev-muted);
}

.signing-arrow {
  color: var(--dev-muted);
  font-size: 12px;
}

.signing-start-hint {
  margin-top: 4px;
  color: var(--dev-gold);
  font-size: 12px;
  line-height: 1.5;
}

.unbind-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.unbind-dialog-tip {
  margin: 0;
  color: var(--dev-gold);
  font-size: 13px;
  line-height: 1.6;
}

.unbind-dialog-line {
  margin: 0;
  color: var(--dev-ink);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.delivery-dialog-body {
  display: grid;
  gap: 10px;
}

.delivery-dialog-body .unbind-dialog-tip {
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--dev-gold) 28%, transparent);
  border-radius: var(--dev-radius-control);
  background: color-mix(in srgb, var(--dev-gold) 10%, transparent);
  font-size: 12px;
  line-height: 1.5;
}

/* 解除合作案件：双方表态（接受 / 不接受）区块 */
.breach-decision {
  display: grid;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--wb-accent-line);
  border-radius: var(--dev-radius-control);
  background: var(--wb-accent-soft);
}

.breach-decision .unbind-dialog-line {
  font-size: 12px;
  line-height: 1.5;
}

.breach-decision__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

/* === 回款详情弹窗（从「交付记录」页搬来） ===
   弹窗由 TDialog teleport 到 body，配色令牌靠 .dev-dialog（见 dev-base.css），
   排版是本页特有的。整块分三层：需求抬头 → 累计到账读数 → 逐笔清单。 */
.dev-receipt-detail {
  display: grid;
  gap: 18px;
}

.dev-receipt-detail__title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--dev-ink);
  overflow-wrap: anywhere;
}

.dev-receipt-detail__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--dev-muted);
}

/* 累计到账：读数取统一层的 .dev-figure--sm（金色大数），
   这里只把它和左侧说明排成一行、压一条分隔线与下面的清单分开。 */
.dev-receipt-detail__total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 0 0 16px;
  border-bottom: 1px solid var(--dev-line);
}

.dev-receipt-detail__total-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--dev-ink-soft);
}

.dev-receipt-detail__list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 一笔到账一块：白底细描边的内嵌容器，圆角取 --dev-radius-inner（卡片内嵌块那一档） */
.dev-receipt-detail__item {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--dev-line);
  border-radius: var(--dev-radius-inner);
  background: var(--dev-surface-strong);
}

.dev-receipt-detail__item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.dev-receipt-detail__item-index {
  font-size: 12px;
  font-weight: 700;
  color: var(--dev-muted);
}

/* 单笔金额同样用金色（与累计读数、钱包里的入账金额同一支） */
.dev-receipt-detail__item-amount {
  font-size: 18px;
  font-weight: 800;
  color: var(--dev-gold);
  font-variant-numeric: tabular-nums;
}

/* 流水号是长串，窄屏必须能断行，否则会把弹窗顶宽 */
.dev-receipt-detail__facts {
  display: grid;
  gap: 6px;
}

.dev-receipt-detail__fact {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-size: 13px;
}

.dev-receipt-detail__fact-label {
  flex: 0 0 76px;
  color: var(--dev-muted);
}

.dev-receipt-detail__fact-value {
  min-width: 0;
  color: var(--dev-ink-soft);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.dev-receipt-detail__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--dev-muted);
}

@media (max-width: 720px) {
  .dev-requirement-card__head {
    flex-direction: column;
  }

  .dev-requirement-card__meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  /* 交付与到账并排两格在窄屏会各剩不到 150px，读不出资源标题与流水时间，收成一列 */
  .dev-requirement-card__delivery {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
