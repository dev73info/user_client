<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRoute, useRouter } from 'vue-router'
import AfterSalesModal from '@/components/AfterSalesModal.vue'
import DeliverySubmitDialog from '@/components/DeliverySubmitDialog.vue'
import PaymentModeChip from '@/components/PaymentModeChip.vue'
import RequirementBreachDialog from '@/components/dev/RequirementBreachDialog.vue'
import RequirementCommentDialog from '@/components/RequirementCommentDialog.vue'
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import RequirementProgressGuide from '@/components/RequirementProgressGuide.vue'
import { useBreachCase } from '@/composables/useBreachCase'
import { afterSalesBadgeText, isAwaitingViewerAction } from '@/shared/afterSalesStatus'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { developmentCycleLabel } from '@/shared/requirementArchive'
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
import { CONTRACT_STATUS, contractStatusLabel } from '@/shared/contracts'
import {
  listMyInvoices,
  uploadInvoiceDocument,
  type InvoiceRecord,
} from '@/api/invoices'
import { canUploadInvoiceDocument } from '@/shared/invoiceAction'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import { formatCnDateTime } from '@/shared/requirementDisplay'
import { sanitizeRequirementRichText } from '@/utils/requirementRichText'
import {
  TButton,
  TCard,
  TDialog,
  TIcon,
  TInput,
  TLoading,
  TMessage,
  TOption,
  TPagination,
  TSelect,
  TTag,
  ArrowDown,
  ArrowUp,
  ChatDotRound,
  Refresh,
  Search,
  UploadFilled,
  View,
} from 'ui_73info'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

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
const commentVisible = ref(false)
const commentRequirement = ref<RequirementItem | null>(null)
const requirementConversationMap = ref<Record<string, RequirementConversation>>({})
/**
 * 我作为乙方的开发者收入票：按需求编号索引。
 *
 * 列表加载时一并 `listMyInvoices`，只留下 `invoiceRole === 'developer'` 且乙方是我的票。
 * 卡片 footer 的「上传发票」据此显示——与财务中心「我的发票」同一套判定
 * （`canUploadInvoiceDocument`）。
 */
const developerInvoiceByRequirement = ref<Record<string, InvoiceRecord>>({})
const uploadingInvoiceId = ref<number | null>(null)
const hiddenInvoiceFileInput = ref<HTMLInputElement | null>(null)
const pickingInvoiceId = ref<number | null>(null)
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

/** 解除合作：结单后的唯一业务入口，案件列表与表态都在 `AfterSalesModal` 里。 */
const afterSalesVisible = ref(false)
const afterSalesTarget = ref<RequirementItem | null>(null)
const deliveryDialogVisible = ref(false)
const deliveryRequirement = ref<RequirementItem | null>(null)

/**
 * 解除合作案件的编排层：案件加载、协商、AI 判定表态、撤回与重新申报。
 *
 * 签约状态**注入**进去（`contractOf` 读本页一次取回的 `signingStatusMap`），
 * 弹窗与卡片因此共用同一份「有没有生效合同」的事实——在别处再查一次就是第二套口径。
 */
const {
  breachVisible,
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
  breachCanDecide,
  breachCanStartNewRound,
  openBreachReport: openBreachReportDialog,
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
} = useBreachCase({
  token: () => auth.token,
  username: () => auth.username,
  contractOf: (item) => signingStatusMap.value[item.requirement_id] ?? null,
})

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

/**
 * 总览页的进行中项目与最近交付带 `requirement_id` 跳进来（见 DevHomeView 的 openMyOrder）：
 * 这一页的需求单一次全取回、筛选在前端做，所以把编号灌进搜索框就是「定位到这一单」，
 * 顺带在搜索框里留下「列表为什么只剩一条」的说明；清空搜索框即可回全量。
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
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  const token = auth.token
  loading.value = true
  try {
    /* 资源与钱包是补充数据：任一失败不该把需求单列表一起清空，
       所以各自兜底成空值，只提示少了哪一块。 */
    const [myRequirements, resourceResult, walletResult, invoiceResult] = await Promise.all([
      listMyRequirements(token),
      settle(listMcResources(token), [] as McResourcePayload[], '加载资源列表失败'),
      settle(getDevWalletOverview(token), null, '加载钱包失败'),
      settle(listMyInvoices(token), [] as InvoiceRecord[], '加载发票记录失败'),
    ])

    rows.value = myRequirements
    resources.value = resourceResult.value
    income.value = walletResult.value?.recent_income ?? []
    versionsByResource.value = await loadResourceVersions(token, resourceResult.value)
    applyDeveloperInvoices(invoiceResult.value)

    const supplementaryError = resourceResult.error ?? walletResult.error
    if (supplementaryError) {
      TMessage.warning(`${supplementaryError}，交付与到账暂不完整`)
    }
    // 发票是补充数据：失败不打断需求列表，只提示一声（与资源 / 钱包同一口径）。
    if (invoiceResult.error) {
      TMessage.warning(`${invoiceResult.error}，上传发票入口暂不可用`)
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
    TMessage.error(message)
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

/** R014：开发周期（天）文案（担保需求合同有效期的依据）；未填返回空串，卡片据此不渲染该格。 */
function developmentCycleText(item: RequirementItem): string {
  return developmentCycleLabel(item.development_cycle_days)
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

/**
 * 把「我作为乙方」的开发者收入票按需求编号收进映射，供卡片操作栏取用。
 * 同一需求若有多张（历史 / 红冲后重开），后写覆盖前写——列表接口通常只回当前有效票。
 */
function applyDeveloperInvoices(invoices: InvoiceRecord[]) {
  const map: Record<string, InvoiceRecord> = {}
  for (const invoice of invoices) {
    if (invoice.invoiceRole === 'developer' && invoice.developerUsername === auth.username) {
      map[invoice.requirementId] = invoice
    }
  }
  developerInvoiceByRequirement.value = map
}

/** 该需求是否该显示「上传发票」：有开发者收入蓝票，且共享层判定可传。 */
function uploadableInvoiceFor(item: RequirementItem): InvoiceRecord | null {
  const invoice = developerInvoiceByRequirement.value[item.requirement_id]
  if (!invoice) {
    return null
  }
  return canUploadInvoiceDocument(invoice, auth.username, 'developer') ? invoice : null
}

/** 模板用：0 或 1 张可上传票，避免同一行反复调 `uploadableInvoiceFor`。 */
function uploadableInvoicesFor(item: RequirementItem): InvoiceRecord[] {
  const invoice = uploadableInvoiceFor(item)
  return invoice ? [invoice] : []
}

function pickInvoiceFile(invoiceId: number) {
  pickingInvoiceId.value = invoiceId
  hiddenInvoiceFileInput.value?.click()
}

function selectInvoiceFile(event: Event) {
  const input = event.target as HTMLInputElement
  const invoiceId = pickingInvoiceId.value
  const file = input.files?.[0]
  // 清空 value，否则同一张发票连选两次同一个文件不会触发 change
  input.value = ''
  if (!file || invoiceId === null) {
    return
  }
  const invoice = Object.values(developerInvoiceByRequirement.value).find(
    (item) => item.id === invoiceId,
  )
  if (!invoice) {
    return
  }
  // 列表卡按钮固定文案「上传发票」：选完文件立刻上传，不再二次确认。
  void uploadInvoiceDoc(invoice, file)
}

async function uploadInvoiceDoc(invoice: InvoiceRecord, file: File) {
  uploadingInvoiceId.value = invoice.id
  try {
    const replacing = Boolean(invoice.documentUrl)
    const updated = await uploadInvoiceDocument(auth.token, invoice.id, file)
    developerInvoiceByRequirement.value = {
      ...developerInvoiceByRequirement.value,
      [updated.requirementId]: updated,
    }
    TMessage.success(
      replacing ? '发票文件已替换，客户下载到的就是这一份' : '发票文件已上传，客户可下载了',
    )
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '上传发票文件失败')
  } finally {
    uploadingInvoiceId.value = null
  }
}

/** 列表卡固定「上传发票」；上传中短暂换成「上传中…」。 */
function invoiceUploadButtonLabel(invoice: InvoiceRecord) {
  return uploadingInvoiceId.value === invoice.id ? '上传中…' : '上传发票'
}

function onInvoiceUploadClick(invoice: InvoiceRecord) {
  pickInvoiceFile(invoice.id)
}

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

/** 待分账提示：尾款缴清到渠道分账之间有等待期。结单后的保证金说明已去掉（操作区有解除合作入口）。 */
function settlementHint(item: RequirementItem): string {
  if (item.status === 'pending_settlement') {
    return '需求方已缴纳尾款，正在等待渠道分账（通常 7 天），分账完成后正式结单并结算'
  }
  return ''
}

/** 合同状态标签：优先用后端带回的 status 码；尚无合同按「等待签约」。 */
function contractStatusBadge(item: RequirementItem): string {
  const status = signingStatusMap.value[item.requirement_id]?.status
  if (typeof status === 'number') {
    return contractStatusLabel(status)
  }
  return contractStatusLabel(CONTRACT_STATUS.awaiting)
}

function contractStatusTone(item: RequirementItem): 'signed' | 'progress' | 'danger' | 'muted' {
  const status = signingStatusMap.value[item.requirement_id]?.status
  if (status === CONTRACT_STATUS.signed) return 'signed'
  if (status === CONTRACT_STATUS.signing || status === CONTRACT_STATUS.awaiting) return 'progress'
  if (
    status === CONTRACT_STATUS.expired ||
    status === CONTRACT_STATUS.rejected ||
    status === CONTRACT_STATUS.voided ||
    status === CONTRACT_STATUS.revoked
  ) {
    return 'danger'
  }
  return 'muted'
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
    TMessage.warning('当前需求还没有关联资源项目')
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
    TMessage.warning('只有已结单的需求有解除合作入口')
    return
  }
  afterSalesTarget.value = item
  afterSalesVisible.value = true
}

function closeAfterSalesModal() {
  afterSalesVisible.value = false
  afterSalesTarget.value = null
}

function canComment(item: RequirementItem) {
  return item.status === 'completed'
}

function openCommentModal(item: RequirementItem) {
  if (!canComment(item)) {
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

/** 纯数字评语多半是脏数据（评分/信用分误写入），不当作正文展示。 */
function commentBodyText(text?: string | null) {
  const body = text?.trim() ?? ''
  if (!body || /^\d+(\.\d+)?$/.test(body) || body.length < 2) {
    return ''
  }
  return body
}

function starFill(rating: number, index: number): 'full' | 'half' | 'empty' {
  if (rating >= index) return 'full'
  if (rating >= index - 0.5) return 'half'
  return 'empty'
}

/**
 * 解除合作入口：能不能申报由本页判定（要读一次取回的 `signingStatusMap`），
 * 打开之后的案件加载、协商、表态与撤回都在 `useBreachCase` 里。
 */
function openBreachReport(item: RequirementItem) {
  if (!canReportBreach(item)) {
    return
  }
  void openBreachReportDialog(item)
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
    TMessage.error('登录状态已失效，请重新登录')
    return
  }
  contractCreatingId.value = item.requirement_id
  try {
    await createRequirementContract(auth.token, item.requirement_id)
    // R012：发起后引导到合同页的「自定义合同附件」区；附件经平台审核放行后才能发起签署。
    TMessage.success('合同已发起；如需补充条款，可在合同页准备自定义附件，平台放行后即可签署')
    const status = await fetchDevContractSigningStatus(auth.token, item.requirement_id)
    signingStatusMap.value = { ...signingStatusMap.value, [item.requirement_id]: status }
    openContractSign(item)
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '发起合同失败')
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
    TMessage.error(error instanceof Error ? error.message : '加载沟通会话失败')
  } finally {
    conversationLoading.value = false
  }
}
</script>

<template>
  <div class="dev-page dev-page--my-requirements">
    <WorkbenchBarSlot>
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
          <TButton icon-only :loading="loading" aria-label="刷新接单列表" @click="loadMyRequirements">
            <TIcon>
              <Refresh />
            </TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

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
            <!-- R014：开发周期（天）——担保需求合同有效期的依据；无担保 / 未填不渲染。 -->
            <span v-if="row.item && developmentCycleText(row.item)" class="dev-requirement-card__meta-item"
              data-testid="dev-requirement-development-cycle">
              <label>开发周期</label>
              <strong>{{ developmentCycleText(row.item) }}</strong>
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
            v-if="
              row.item &&
              (row.item.comment_rating != null || row.item.developer_comment_rating != null)
            "
            class="dev-requirement-card__comments"
          >
            <div v-if="row.item.comment_rating != null" class="dev-rating-row">
              <span class="dev-rating-row__label">对方评价</span>
              <span class="dev-rating-stars" :aria-label="`${row.item.comment_rating.toFixed(1)} 分`">
                <span
                  v-for="n in 5"
                  :key="`peer-${n}`"
                  class="dev-rating-star"
                  :class="`is-${starFill(row.item.comment_rating, n)}`"
                  aria-hidden="true"
                >★</span>
              </span>
              <strong class="dev-rating-row__score">{{ row.item.comment_rating.toFixed(1) }}</strong>
              <span v-if="commentBodyText(row.item.comment_text)" class="dev-rating-row__text">
                {{ commentBodyText(row.item.comment_text) }}
              </span>
            </div>
            <div v-if="row.item.developer_comment_rating != null" class="dev-rating-row">
              <span class="dev-rating-row__label">我的评价</span>
              <span
                class="dev-rating-stars"
                :aria-label="`${row.item.developer_comment_rating.toFixed(1)} 分`"
              >
                <span
                  v-for="n in 5"
                  :key="`mine-${n}`"
                  class="dev-rating-star"
                  :class="`is-${starFill(row.item.developer_comment_rating, n)}`"
                  aria-hidden="true"
                >★</span>
              </span>
              <strong class="dev-rating-row__score">
                {{ row.item.developer_comment_rating.toFixed(1) }}
              </strong>
              <span
                v-if="commentBodyText(row.item.developer_comment_text)"
                class="dev-rating-row__text"
              >
                {{ commentBodyText(row.item.developer_comment_text) }}
              </span>
            </div>
          </div>

          <div
            v-if="row.item && row.item.payment_mode !== 'self_managed'"
            class="dev-requirement-card__signing"
          >
            <div class="signing-status-bar">
              <span
                class="signing-status-badge"
                :class="`signing-status-badge--${contractStatusTone(row.item)}`"
              >
                {{ contractStatusBadge(row.item) }}
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
              <!-- 客户已申请开发者收入票、且我是乙方可上传时显示；交互对齐 InvoiceCenterView。 -->
              <TButton
                v-for="invoice in uploadableInvoicesFor(row.item)"
                :key="`invoice-upload-${invoice.id}`"
                variant="outline"
                tone="accent"
                :loading="uploadingInvoiceId === invoice.id"
                :disabled="uploadingInvoiceId !== null && uploadingInvoiceId !== invoice.id"
                @click="onInvoiceUploadClick(invoice)"
              >
                <TIcon><UploadFilled /></TIcon>
                <span>{{ invoiceUploadButtonLabel(invoice) }}</span>
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
              <TButton
                v-if="canComment(row.item) && row.item.developer_comment_rating == null"
                variant="solid"
                tone="accent"
                @click="openCommentModal(row.item!)"
              >
                去评价
              </TButton>
              <TButton
                v-if="canComment(row.item) && row.item.developer_comment_rating != null"
                variant="outline"
                tone="accent"
                @click="openCommentModal(row.item!)"
              >
                修改评价
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

    <!-- 解除合作案件弹窗：编排在 `useBreachCase`，组件只渲染、只 emit。
         签约状态（`breachCanStartNewRound`）由本页注入，弹窗不再自己查一次。 -->
    <RequirementBreachDialog
      v-model:visible="breachVisible"
      v-model:reason="breachReason"
      v-model:decision-note="breachDecisionNote"
      :breach-case="breachCase"
      :case-loading="breachCaseLoading"
      :new-round="breachNewRound"
      :report-loading="breachLoading"
      :platform-review-loading="platformReviewLoading"
      :withdraw-loading="breachWithdrawLoading"
      :withdraw-confirm="breachWithdrawConfirm"
      :decision-loading="breachDecisionLoading"
      :reject-panel="breachRejectPanel"
      :withdrawn-by-me="breachWithdrawnByMe"
      :can-start-new-round="breachCanStartNewRound"
      :can-respond="breachCanRespond"
      :can-withdraw="breachCanWithdraw"
      :can-decide="breachCanDecide"
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
    />

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

    <RequirementCommentDialog
      :visible="commentVisible && !!commentRequirement"
      :token="auth.token"
      :requirement-id="commentRequirement?.requirement_id ?? ''"
      :title="commentRequirement?.title ?? ''"
      :initial-rating="commentRequirement?.developer_comment_rating ?? null"
      :initial-text="commentRequirement?.developer_comment_text ?? null"
      @close="closeCommentModal"
      @submitted="handleCommentSubmitted"
    />

    <!-- 隐藏 file input：行上「上传发票」共用一个，选完按 pickingInvoiceId 直接上传。 -->
    <input
      ref="hiddenInvoiceFileInput"
      class="dev-requirement-card__invoice-file"
      type="file"
      accept="application/pdf,image/png,image/jpeg,image/webp"
      aria-hidden="true"
      tabindex="-1"
      @change="selectInvoiceFile"
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

/* 发票上传的原生 file input：外观走行内 TButton，本节点只负责选文件。 */
.dev-requirement-card__invoice-file {
  display: none;
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

.dev-rating-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  min-width: 0;
  color: var(--dev-ink);
  font-size: 12px;
  line-height: 1.4;
}

.dev-rating-row__label {
  flex: 0 0 auto;
  color: var(--dev-muted);
  font-weight: 700;
}

.dev-rating-stars {
  display: inline-flex;
  align-items: center;
  gap: 1px;
}

/* 实心 ★：ui_73info 的 Star 是空心描边，评分展示用不合适 */
.dev-rating-star {
  display: inline-block;
  width: 1em;
  height: 1em;
  color: color-mix(in srgb, var(--dev-muted) 38%, transparent);
  font-size: 14px;
  font-style: normal;
  line-height: 1;
}

.dev-rating-star.is-full {
  color: var(--dev-gold);
}

.dev-rating-star.is-half {
  background: linear-gradient(
    90deg,
    var(--dev-gold) 50%,
    color-mix(in srgb, var(--dev-muted) 38%, transparent) 50%
  );
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}

.dev-rating-row__score {
  flex: 0 0 auto;
  color: var(--dev-ink);
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.dev-rating-row__text {
  flex: 1 1 12rem;
  min-width: 0;
  color: var(--dev-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  gap: 8px;
  flex-wrap: wrap;
  max-width: 100%;
}

.signing-status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.signing-status-badge--signed {
  background: color-mix(in srgb, var(--dev-cyan) 16%, transparent);
  color: var(--dev-cyan);
}

.signing-status-badge--progress {
  background: color-mix(in srgb, var(--dev-blue) 14%, transparent);
  color: var(--dev-blue);
}

.signing-status-badge--danger {
  background: color-mix(in srgb, var(--dev-danger, #dc2626) 12%, transparent);
  color: var(--dev-danger, #dc2626);
}

.signing-status-badge--muted {
  background: color-mix(in srgb, var(--dev-muted) 16%, transparent);
  color: var(--dev-muted);
}

.signing-start-hint {
  margin-top: 4px;
  color: var(--dev-gold);
  font-size: 12px;
  line-height: 1.5;
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

.dev-requirement-card__comments {
  display: grid;
  gap: 4px;
}

.dev-requirement-card__comments p {
  margin: 0;
}

/* R047 断点收敛：原档位 720px → 640px */
@media (max-width: 640px) {
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
