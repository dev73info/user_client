<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { ArrowDown, ArrowUp, ChatDotRound, Refresh, RefreshLeft, Search, View } from '@element-plus/icons-vue'

import {
  getAdapayBreachCase,
  reportAdapayBreach,
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
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import RequirementProgressGuide from '@/components/RequirementProgressGuide.vue'
import { breachStatusLabel } from '@/shared/breachStatus'
import {
  listRequirementConversations,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@/api/conversations'
import {
  listMyRequirements,
  requestUnbindRequirement,
  respondUnbindRequirement,
  type RequirementItem,
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

const auth = useAuthStore()
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
const descriptionOverflowMap = ref<Record<string, boolean>>({})
const expandedRequirements = ref<Record<string, boolean>>({})
const descriptionEls = ref<Record<string, HTMLElement>>({})

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

const unbindVisible = ref(false)
const unbindRequirement = ref<RequirementItem | null>(null)
const unbindReason = ref('')
const unbindLoading = ref(false)
const unbindRespondVisible = ref(false)
const unbindRespondRequirement = ref<RequirementItem | null>(null)
const unbindRespondLoading = ref(false)
const breachVisible = ref(false)
/** 售后：结单后的唯一业务入口，案件列表与表态都在 `AfterSalesModal` 里。 */
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
})

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

function statusLabel(status: RequirementItem['status']): string {
  switch (status) {
    case 'pending_review':
      return '待审核'
    case 'rejected':
      return '已驳回'
    case 'pending_deposit':
      return '待签合同'
    case 'deposit_paid':
      return '待开发'
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
  return isWaitingContractSign(item) ? '待签合同' : statusLabel(item.status)
}

function paymentModeLabel(item: RequirementItem): string {
  return item.payment_mode === 'self_managed' ? '无电签约定' : '电签担保'
}

function requirementFieldHtml(value?: string | null): string {
  return sanitizeRequirementRichText(value ?? '') || '当前需求暂未补充详细描述。'
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

/** 行抬头：需求单行取需求标题，补充行取钱包回执里的标题或资源名。 */
function rowTitle(row: MyOrderRow): string {
  return row.item?.title ?? row.title ?? row.delivery?.resourceTitle ?? '未关联需求'
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

  // 补充行的两档来源不同：只有交付说明这份资源还没被需求单绑定，只有到账说明需求已经解绑。
  return row.delivery ? '交付未绑定需求' : '需求已解绑'
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

function isDescriptionExpanded(item: RequirementItem) {
  return Boolean(expandedRequirements.value[item.requirement_id])
}

function descriptionOverflow(item: RequirementItem) {
  return Boolean(descriptionOverflowMap.value[item.requirement_id])
}

function toggleDescription(item: RequirementItem) {
  expandedRequirements.value = {
    ...expandedRequirements.value,
    [item.requirement_id]: !isDescriptionExpanded(item),
  }
}

function setDescriptionRef(el: HTMLElement | null, item: RequirementItem) {
  if (!el) {
    delete descriptionEls.value[item.requirement_id]
    return
  }

  descriptionEls.value[item.requirement_id] = el
  void nextTick(() => {
    const target = descriptionEls.value[item.requirement_id]
    if (!target) {
      return
    }

    const overflows = target.scrollHeight > target.clientHeight + 2
    if (overflows !== Boolean(descriptionOverflowMap.value[item.requirement_id])) {
      descriptionOverflowMap.value = {
        ...descriptionOverflowMap.value,
        [item.requirement_id]: overflows,
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
    return '请完成开发者签署，客户也需完成签署后才能支付定金'
  }
  if (!status.party_b_signed) {
    return '等待开发者完成签署'
  }
  return '等待客户签署，双方签署完成后由需求方支付定金'
}

/** 待分账 / 结单后的提示：尾款缴清到渠道分账之间有等待期，结单后还有售后窗口。 */
function settlementHint(item: RequirementItem): string {
  if (item.status === 'pending_settlement') {
    return '需求方已缴纳尾款，正在等待渠道分账（通常 7 天），分账完成后正式结单并结算'
  }
  if (item.status === 'completed') {
    return '需求已结单，接单保证金在售后窗口结束且无未结售后案件后释放'
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
    // 待分账（尾款已缴、分账排队中）仍在等待期内，此时终止合作会把排队分账置为 cancelled，
    // 与后端一样留出这条出口。
    ['deposit_paid', 'in_development', 'pending_final', 'pending_settlement'].includes(item.status)
}

/** 售后入口：结单后打开 `AfterSalesModal`。开发者是乙方，只查看案件与表态，不能发起。 */
function canOpenAfterSales(item: RequirementItem) {
  return item.status === 'completed' && item.payment_mode !== 'self_managed'
}

function openAfterSalesModal(item: RequirementItem) {
  if (!canOpenAfterSales(item)) {
    showToast('只有已结单的需求有售后入口', 'warning')
    return
  }
  afterSalesTarget.value = item
  afterSalesVisible.value = true
}

function closeAfterSalesModal() {
  afterSalesVisible.value = false
  afterSalesTarget.value = null
}

/** 担保模式接单后未缴定金：解绑入口一律关闭、终止合作又要求有一张已完成的定金支付单，出口只剩缴款期限到期后由系统自动终止合作。 */
function awaitingDepositDeadline(item: RequirementItem) {
  return item.status === 'pending_deposit' && item.payment_mode !== 'self_managed'
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
    showToast(error instanceof Error ? error.message : '加载违约案件失败', 'error')
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
    showToast('终止合作申请已撤回，如仍有争议可重新发起', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '撤回终止合作申请失败', 'error')
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
 * 撤回后再次申请沿用同一条案件（后端复用该行、案件编号不变），只有驳回 / 结案才会新建案件。
 * 标题与提交按钮都按这个口径措辞，避免出现「标题写新一轮、提示写沿用同一条」的自相矛盾。
 */
function breachDialogTitle() {
  if (!breachNewRound.value && breachCase.value) {
    return '终止合作进展'
  }
  if (breachCase.value?.status === 'withdrawn') {
    return breachWithdrawnByMe.value ? '重新发起终止合作' : '终止合作'
  }
  return breachNewRound.value ? '发起新的终止合作' : '终止合作'
}

function breachSubmitLabel() {
  if (breachCase.value?.status === 'withdrawn') {
    return breachWithdrawnByMe.value ? '重新发起' : '提交终止合作申请'
  }
  return breachNewRound.value ? '发起新一轮终止合作' : '提交终止合作申请'
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
  return `上一轮案件已${item.status === 'succeeded' ? '结案' : '驳回'}，结论不能翻案；本次提交会新建一条案件，只针对结案之后新发生的事实。`
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
  breachDecisionLoading.value = true
  try {
    breachCase.value = await submitAdapayBreachDecision(
      auth.token,
      current.id,
      decision,
      decision === 'rejected' ? breachDecisionNote.value.trim() : '',
    )
    breachRejectPanel.value = false
    breachDecisionNote.value = ''
    showToast(
      decision === 'accepted' ? '已接受 AI 判定，等待对方表态' : '已提交不接受，案件转客服人工判定',
      'success',
    )
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交违约案件表态失败', 'error')
  } finally {
    breachDecisionLoading.value = false
  }
}

async function submitBreachReport() {
  const item = breachRequirement.value
  const reason = breachReason.value.trim()
  if (!item || !reason) {
    showToast('请填写终止合作的事实和相关依据', 'warning')
    return
  }
  breachLoading.value = true
  try {
    breachCase.value = await reportAdapayBreach(auth.token, item.requirement_id, reason)
    breachNewRound.value = false
    showToast('终止合作申请已提交，请先与对方协商', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交终止合作申请失败', 'error')
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
    showToast('合同已发起，请完成签署', 'success')
    const status = await fetchDevContractSigningStatus(auth.token, item.requirement_id)
    signingStatusMap.value = { ...signingStatusMap.value, [item.requirement_id]: status }
    openContractSign(item)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '发起合同失败', 'error')
  } finally {
    contractCreatingId.value = ''
  }
}

function canRequestUnbind(item: RequirementItem) {
  return (
    item.payment_mode === 'self_managed' &&
    (item.status === 'in_development' ||
      item.status === 'deposit_paid' ||
      item.status === 'pending_deposit') &&
    !item.pending_unbind_request
  )
}

function unbindRequestHint(item: RequirementItem) {
  const request = item.pending_unbind_request
  if (!request) {
    return ''
  }

  if (request.status === 'pending') {
    return request.initiator === 'creator'
      ? '需求方申请解除，等待你确认'
      : '已提交解除申请，等待需求方确认'
  }

  if (request.status === 'approved') {
    return '解除申请已通过，需求已重新挂回大厅'
  }

  return '解除申请已被拒绝'
}

function openUnbindRequest(item: RequirementItem) {
  if (!canRequestUnbind(item)) {
    return
  }
  unbindRequirement.value = item
  unbindReason.value = ''
  unbindVisible.value = true
}

function closeUnbindRequest() {
  if (unbindLoading.value) {
    return
  }
  unbindVisible.value = false
  unbindRequirement.value = null
  unbindReason.value = ''
}

async function submitUnbindRequest() {
  const item = unbindRequirement.value
  if (!item) {
    return
  }

  const reason = unbindReason.value.trim()
  if (!reason) {
    showToast('请填写解除绑定的原因', 'warning')
    return
  }

  unbindLoading.value = true
  try {
    await requestUnbindRequirement(auth.token, item.requirement_id, reason)
    showToast('解除申请已提交，等待需求方确认', 'success')
    unbindVisible.value = false
    unbindRequirement.value = null
    unbindReason.value = ''
    await loadMyRequirements()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交解除申请失败', 'error')
  } finally {
    unbindLoading.value = false
  }
}

function hasPendingCreatorUnbindRequest(item: RequirementItem) {
  return item.pending_unbind_request?.status === 'pending' &&
    item.pending_unbind_request.initiator === 'creator'
}

function openUnbindRespond(item: RequirementItem) {
  if (!hasPendingCreatorUnbindRequest(item)) {
    return
  }
  unbindRespondRequirement.value = item
  unbindRespondVisible.value = true
}

function closeUnbindRespond() {
  if (unbindRespondLoading.value) {
    return
  }
  unbindRespondVisible.value = false
  unbindRespondRequirement.value = null
}

async function submitUnbindRespond(action: 'approve' | 'reject') {
  const item = unbindRespondRequirement.value
  if (!item) {
    return
  }

  unbindRespondLoading.value = true
  try {
    await respondUnbindRequirement(auth.token, item.requirement_id, action)
    showToast(action === 'approve' ? '已同意解除，需求已重新挂回大厅' : '已拒绝解除申请', 'success')
    unbindRespondVisible.value = false
    unbindRespondRequirement.value = null
    await loadMyRequirements()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '处理解除申请失败', 'error')
  } finally {
    unbindRespondLoading.value = false
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
        <el-button class="dev-toolbar__icon-btn" aria-label="刷新接单列表" @click="loadMyRequirements">
          <el-icon>
            <Refresh />
          </el-icon>
        </el-button>
      </div>
    </div>

    <el-card shadow="never" class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">接单与交付</h3>
          <p class="dev-section-desc">
            一行一个需求单：卡内除了签署与操作，还带着交付物与到账金额。未绑定需求的交付、以及需求已解绑的到账单独成行，搜索与状态筛选即时生效。
          </p>
        </div>
      </div>

      <div class="dev-toolbar">
        <el-select v-model="filters.status" clearable placeholder="需求状态" class="dev-toolbar__field"
          aria-label="按需求状态筛选">
          <el-option label="待签合同" value="contract_pending" />
          <el-option label="待缴定金" value="pending_deposit" />
          <el-option label="开发中" value="in_development" />
          <el-option label="待付尾款" value="pending_final" />
          <el-option label="待分账" value="pending_settlement" />
          <el-option label="已完成" value="completed" />
          <el-option label="已取消" value="cancelled" />
          <el-option label="未关联需求" value="unlinked" />
        </el-select>

        <el-input v-model="filters.keyword" clearable placeholder="搜索需求编号、标题、资源、版本或流水号"
          class="dev-toolbar__search">
          <template #prefix>
            <el-icon>
              <Search />
            </el-icon>
          </template>
        </el-input>

        <div class="dev-toolbar__actions">
          <span v-if="hasActiveFilters" class="dev-toolbar__hint">
            筛选出 {{ filteredRows.length }} / {{ mergedRows.length }} 条
          </span>
          <el-button class="dev-toolbar__ghost" @click="resetFilters">
            <el-icon>
              <RefreshLeft />
            </el-icon>
            <span>重置</span>
          </el-button>
        </div>
      </div>

      <!-- 列表容器走统一层的 .dev-stack-list：它给的就是「卡片式列表」的 14px 行距，
           与资源项目、我的团队的卡片列表差同一档。
           一行一个需求单：交付物与到账长在同一张卡上（原「交付记录」页的两列），
           没被任何需求单绑定的交付、以及需求已解绑的到账，同样成行但不出签署与操作栏。 -->
      <div class="dev-stack-list" v-loading="loading">
        <div v-if="filteredRows.length === 0" class="dev-empty-state">{{ emptyText }}</div>
        <article v-for="row in pagedRows" :key="row.key" class="dev-requirement-card">
          <header class="dev-requirement-card__head">
            <div class="dev-requirement-card__title-block">
              <span class="dev-requirement-hall__requirement-id">{{ row.requirementId ?? '未关联需求' }}</span>
              <h3 class="dev-requirement-hall__title">{{ rowTitle(row) }}</h3>
              <article v-if="row.item" class="dev-requirement-hall__desc dev-requirement-card__description"
                :class="{ 'is-collapsed': !isDescriptionExpanded(row.item) }"
                :ref="(el) => setDescriptionRef(el as HTMLElement | null, row.item!)"
                v-html="requirementFieldHtml(row.item.description)"></article>
              <p v-else class="dev-requirement-card__description">
                {{
                  row.delivery
                    ? '这份交付还没有绑定需求单，交付物与版本在「资源项目 → 版本管理」里维护。'
                    : '这条到账所属的需求已解除绑定，需求单列表里已经查不到它。'
                }}
              </p>
              <button v-if="row.item && (isDescriptionExpanded(row.item) || descriptionOverflow(row.item))"
                type="button" class="dev-requirement-card__description-toggle"
                @click="toggleDescription(row.item)">
                <el-icon>
                  <ArrowUp v-if="isDescriptionExpanded(row.item)" />
                  <ArrowDown v-else />
                </el-icon>
                <span>{{ isDescriptionExpanded(row.item) ? '收起' : '展开' }}</span>
              </button>
            </div>
            <div class="dev-requirement-card__tags">
              <el-tag :type="rowStatusType(row)" effect="plain">{{ rowStatusLabel(row) }}</el-tag>
              <el-tag v-if="row.item" :type="row.item.payment_mode === 'self_managed' ? 'info' : 'warning'"
                effect="plain">
                {{ paymentModeLabel(row.item) }}
              </el-tag>
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
              <strong>{{ conversationLoading ? '加载中' : conversationStatusLabel(row.item) }}</strong>
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
              <button v-if="row.receipts.length > 0" type="button"
                class="dev-requirement-card__receipt-toggle" @click="openReceiptDialog(row)">
                <el-icon><View /></el-icon>
                <span>查看回款详情</span>
              </button>
            </div>
          </div>

          <div v-if="row.item" class="dev-requirement-card__progress">
            <RequirementProgressGuide :requirement="row.item" :payment-mode="row.item.payment_mode" view="dev"
              :contract-status="signingStatusMap[row.item.requirement_id]" />
          </div>

          <div v-if="row.item && settlementHint(row.item)" class="signing-start-hint">{{ settlementHint(row.item) }}
          </div>

          <div v-if="row.item && row.item.payment_mode !== 'self_managed'" class="dev-requirement-card__signing">
            <div class="signing-status-bar">
              <span class="signing-step"
                :class="signingStatusMap[row.item.requirement_id]?.has_contract ? 'done' : 'pending'">
                协议已创建
              </span>
              <span class="signing-arrow">›</span>
              <span class="signing-step"
                :class="signingStatusMap[row.item.requirement_id]?.party_b_signed ? 'done' : 'pending'">
                乙方已签
              </span>
              <span class="signing-arrow">›</span>
              <span class="signing-step"
                :class="signingStatusMap[row.item.requirement_id]?.party_a_signed ? 'done' : 'pending'">
                甲方已签
              </span>
            </div>
            <div v-if="contractStartHint(row.item)" class="signing-start-hint">{{ contractStartHint(row.item) }}</div>
          </div>

          <!-- 签署与操作栏只给需求单行：补充行（未关联需求的交付／到账）没有可执行的接单动作。
               行内事件处理器拿不到 v-if 的类型收窄，所以这一段的处理函数参数带 `!`。 -->
          <footer v-if="row.item" class="dev-requirement-card__actions">
            <div class="dev-requirement-card__unbind">
              <span v-if="row.item.pending_unbind_request?.status === 'pending'"
                class="dev-requirement-card__unbind-hint">
                {{ unbindRequestHint(row.item) }}
              </span>
            </div>
            <!-- 行内操作按钮走统一层的 .dev-list-actions（32px 高 / 10px 圆角），
                 与资源列表、我的团队的行内按钮同一规格。
                 这里原先是本页自写的 .dev-requirement-card__buttons + 逐个 size="small"
                 （Element 的 24px 小号），同一张卡里按钮比顶部工具栏矮一档。 -->
            <div class="dev-list-actions">
              <!-- 行内按钮的上色走统一层的 .dev-action--soft / .dev-action--soft-danger：
                   原来挂的是裸 `type="primary" plain` / `type="danger" plain`，
                   Element 的 plain 变体给的是浅蓝底（#e8edfa）与粉底三件套，
                   与表格行里的白底 + 主色描边不是一套，禁用态的「终止合作」更是一片粉。 -->
              <el-button v-if="canSubmitDeliveryVersion(row.item)" type="primary" plain class="dev-action--soft"
                title="交付物以绑定资源项目的新版本提交" @click="openDeliveryDialog(row.item!)">
                提交交付版本
              </el-button>
              <el-button v-if="canOpenAfterSales(row.item)" type="primary" plain class="dev-action--soft"
                @click="openAfterSalesModal(row.item!)">
                售后
              </el-button>
              <el-button v-if="canReportBreach(row.item)" type="danger" plain class="dev-action--soft-danger"
                @click="openBreachReport(row.item!)">
                终止合作
              </el-button>
              <el-button v-else-if="awaitingDepositDeadline(row.item)" type="danger" plain
                class="dev-action--soft-danger" disabled
                title="定金未缴，暂不能发起终止合作；逾期未缴定金将由系统自动终止合作并释放接单保证金">
                终止合作
              </el-button>
              <el-button v-if="canCreateRequirementContract(row.item)" type="primary"
                :loading="contractCreatingId === row.item.requirement_id"
                @click="createRequirementContractAction(row.item!)">
                发起合同
              </el-button>
              <el-button v-if="canOpenContractSign(row.item)" @click="handleContractButtonClick(row.item!)">
                {{ contractButtonLabel(row.item) }}
              </el-button>
              <el-button type="primary" plain class="dev-action--soft dev-requirement-card__conversation"
                @click="openConversation(row.item!)">
                <el-icon><ChatDotRound /></el-icon>
                <span>会话</span>
              </el-button>
              <el-button v-if="hasPendingCreatorUnbindRequest(row.item)" type="warning"
                @click="openUnbindRespond(row.item!)">处理解除申请</el-button>
              <el-button v-else-if="canRequestUnbind(row.item)" type="danger" plain class="dev-action--soft-danger"
                @click="openUnbindRequest(row.item!)">申请解除</el-button>
            </div>
          </footer>
        </article>
      </div>

      <div class="dev-pager">
        <div class="dev-pager__count">
          <span>共 {{ filteredTotal }} 条</span>
          <el-select v-model="pageSize" aria-label="每页条数" class="dev-pager__size">
            <el-option v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
          </el-select>
        </div>
        <el-pagination v-model:current-page="page" :page-size="pageSize" :total="filteredTotal"
          :pager-count="5" layout="prev, pager, next" background aria-label="接单与交付列表分页" />
      </div>
    </el-card>

    <!-- 回款详情弹窗：卡上只放合计与笔数，逐笔到这里摊开。
         金额、时间、流水号都来自同一份钱包回执（与「收益钱包 → 收入记录」同一个接口），
         不在这里另算，避免两处对不上。 -->
    <el-dialog v-model="receiptDialogVisible" :title="receiptDialogTitle" width="560px" align-center
      class="dev-dialog">
      <div v-if="activeReceiptRow" class="dev-receipt-detail">
        <div class="dev-receipt-detail__head">
          <div class="dev-receipt-detail__title">{{ rowTitle(activeReceiptRow) }}</div>
          <div class="dev-receipt-detail__meta">
            <span>{{ activeReceiptRow.requirementId ?? '未关联需求' }}</span>
            <span>委托方 {{ rowCustomer(activeReceiptRow) || '—' }}</span>
            <el-tag :type="rowStatusType(activeReceiptRow)" effect="plain">
              {{ rowStatusLabel(activeReceiptRow) }}
            </el-tag>
          </div>
        </div>

        <div class="dev-receipt-detail__total">
          <span class="dev-receipt-detail__total-label">
            累计到账 · 共 {{ activeReceipts.length }} 笔
          </span>
          <span class="dev-figure dev-figure--sm">{{ receiptMoney(activeReceiptTotal) }}</span>
        </div>

        <ul class="dev-receipt-detail__list">
          <li v-for="(receipt, index) in activeReceipts" :key="receipt.paymentId" class="dev-receipt-detail__item">
            <div class="dev-receipt-detail__item-head">
              <span class="dev-receipt-detail__item-index">第 {{ index + 1 }} 笔</span>
              <span class="dev-receipt-detail__item-amount">{{ receiptMoney(receipt.amount) }}</span>
            </div>
            <div class="dev-receipt-detail__facts">
              <div class="dev-receipt-detail__fact">
                <span class="dev-receipt-detail__fact-label">到账时间</span>
                <span class="dev-receipt-detail__fact-value">{{ formatCnDateTime(receipt.paidAt) }}</span>
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
        <el-button class="dev-toolbar__ghost" @click="receiptDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="unbindVisible" title="申请解除需求绑定" width="480px" align-center class="dev-dialog"
      :close-on-click-modal="false" :close-on-press-escape="false" @close="closeUnbindRequest">
      <div class="unbind-dialog-body">
        <p class="unbind-dialog-tip">
          解除后需求将重新挂回大厅，等待其他开发者承接。此操作需要需求方确认，请填写真实原因。
        </p>
        <el-input v-model="unbindReason" type="textarea" :rows="4" maxlength="1000" show-word-limit
          placeholder="请说明无法继续完成的原因，例如：与需求方沟通后确认技术方案无法实现" />
      </div>
      <template #footer>
        <el-button :disabled="unbindLoading" @click="closeUnbindRequest">取消</el-button>
        <el-button type="danger" :loading="unbindLoading" @click="submitUnbindRequest">提交申请</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="unbindRespondVisible" title="需求方申请解除绑定" width="480px" align-center class="dev-dialog"
      :close-on-click-modal="false" :close-on-press-escape="false" @close="closeUnbindRespond">
      <div class="unbind-dialog-body">
        <p class="unbind-dialog-tip">需求方申请解除绑定，请确认是否同意。</p>
        <p class="unbind-dialog-line">
          <strong>需求编号：</strong>{{ unbindRespondRequirement?.requirement_id }}
        </p>
        <p class="unbind-dialog-line">
          <strong>申请原因：</strong>{{ unbindRespondRequirement?.pending_unbind_request?.reason }}
        </p>
      </div>
      <template #footer>
        <el-button :disabled="unbindRespondLoading" @click="closeUnbindRespond">取消</el-button>
        <el-button type="danger" :disabled="unbindRespondLoading"
          @click="submitUnbindRespond('reject')">拒绝解除</el-button>
        <el-button type="primary" :loading="unbindRespondLoading"
          @click="submitUnbindRespond('approve')">同意解除</el-button>
      </template>
    </el-dialog>

    <DeliverySubmitDialog v-model:visible="deliveryDialogVisible" :token="auth.token"
      :bound-resource-id="deliveryRequirement?.bound_resource_id ?? null" @submitted="handleDeliverySubmitted" />

    <el-dialog v-model="breachVisible" :title="breachDialogTitle()" width="520px" align-center class="dev-dialog"
      :close-on-click-modal="false" :close-on-press-escape="false" @close="closeBreachReport">
      <div class="delivery-dialog-body">
        <p class="unbind-dialog-tip">
          提交后案件进入「协商中」：双方先在案件内协商定金与尾款的退还额度，谈成即直接退款结案。
          协商不成再由任一方申请平台介入，平台核对合同、支付、交付与沟通记录，由审核智能体判定责任方，客服人工复核。
        </p>
        <p v-if="breachCaseLoading" class="unbind-dialog-tip">正在加载终止合作案件…</p>
        <template v-else-if="breachCase && !breachNewRound">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="案件编号">{{ breachCase.caseNo }}</el-descriptions-item>
            <el-descriptions-item label="当前状态">
              {{ breachStatusLabel(breachCase.status) }}
            </el-descriptions-item>
            <el-descriptions-item v-if="breachCase.status === 'withdrawn'" label="申请人">
              {{ breachWithdrawnByMe ? '我方' : '对方' }}
            </el-descriptions-item>
            <el-descriptions-item v-if="breachCase.status === 'withdrawn' && breachCase.resolvedAt" label="撤回时间">
              {{ formatCnDateTime(breachCase.resolvedAt) }}
            </el-descriptions-item>
            <el-descriptions-item v-if="breachCase.liableParty" label="责任认定">
              {{ breachLiablePartyLabel(breachCase.liableParty) }}
            </el-descriptions-item>
            <el-descriptions-item label="申请理由">{{ breachCase.reason }}</el-descriptions-item>
            <el-descriptions-item v-if="breachCase.aiJudgedAt || breachCase.aiReasoning" label="AI 判定">
              {{ breachCase.aiLiableParty ? breachLiablePartyLabel(breachCase.aiLiableParty) : '无法判定，已转客服人工判定' }}
            </el-descriptions-item>
            <el-descriptions-item v-if="breachCase.aiJudgedAt" label="判定时间">
              {{ formatCnDateTime(breachCase.aiJudgedAt) }}
            </el-descriptions-item>
            <el-descriptions-item v-if="breachCase.aiReasoning" label="判定理由">
              {{ breachCase.aiReasoning }}
            </el-descriptions-item>
            <el-descriptions-item v-if="breachCase.decisionDeadlineAt" label="表态截止">
              {{ formatCnDateTime(breachCase.decisionDeadlineAt) }}
            </el-descriptions-item>
            <el-descriptions-item v-if="showBreachDecisions(breachCase)" label="我方表态">
              {{ breachDecisionText(breachCase.developerDecision) }}
            </el-descriptions-item>
            <el-descriptions-item v-if="showBreachDecisions(breachCase)" label="对方表态">
              {{ breachDecisionText(breachCase.customerDecision) }}
            </el-descriptions-item>
            <el-descriptions-item label="资金处理">
              定金 ¥{{ breachCase.depositAmountCny }} · 已退尾款 ¥{{ breachCase.refundAmountCny }} · 赔付 ¥{{ breachCase.compensationAmountCny }}<template v-if="breachCase.extraCompensationFen > 0"> · 额外赔偿 ¥{{ breachCase.extraCompensationCny }}</template>
            </el-descriptions-item>
            <el-descriptions-item v-if="breachCase.verdictSource" label="判定来源">
              {{ breachVerdictSourceText(breachCase.verdictSource) }}
            </el-descriptions-item>
            <el-descriptions-item v-if="breachCase.resolutionNote" label="处理说明">
              {{ breachCase.resolutionNote }}
            </el-descriptions-item>
          </el-descriptions>

          <div v-if="canDecideBreachCase(breachCase)" class="breach-decision">
            <p class="unbind-dialog-line">
              请选择是否接受 AI 判定：双方都接受后平台才会执行退款／赔付；任一方不接受或逾期未全部表态，案件转客服人工判定。
            </p>
            <el-input v-if="breachRejectPanel" v-model="breachDecisionNote" type="textarea" :rows="3" maxlength="1000"
              show-word-limit placeholder="可选：说明不接受该判定的理由，便于客服人工复核" />
            <div class="breach-decision__actions">
              <template v-if="breachRejectPanel">
                <el-button :disabled="breachDecisionLoading" @click="cancelBreachRejectPanel">取消</el-button>
                <el-button type="danger" :loading="breachDecisionLoading"
                  @click="submitBreachDecision('rejected')">确认不接受</el-button>
              </template>
              <template v-else>
                <el-button type="danger" plain :disabled="breachDecisionLoading"
                  @click="openBreachRejectPanel">不接受</el-button>
                <el-button type="primary" :loading="breachDecisionLoading"
                  @click="submitBreachDecision('accepted')">接受判定</el-button>
              </template>
            </div>
          </div>
          <p v-else-if="breachCase.status === 'submitted' || breachCase.status === 'ai_reviewing'"
            class="unbind-dialog-tip">
            双方先自行协商：谈成即按协商额度退款结案；协商不成由任一方申请平台介入，平台按 AI 判定 + 客服人工审核认定责任方，判定完成后由双方各自选择是否接受。
          </p>

          <div v-if="breachWithdrawConfirm" class="breach-decision">
            <p class="unbind-dialog-line">
              确认撤回本次终止合作申请？撤回后本次申请结束，如仍有争议可在同一需求上重新发起；撤回不会触发任何退款或赔付。
            </p>
            <div class="breach-decision__actions">
              <el-button :disabled="breachWithdrawLoading" @click="cancelBreachWithdrawConfirm">再想想</el-button>
              <el-button type="danger" :loading="breachWithdrawLoading" @click="submitBreachWithdraw">确认撤回申请</el-button>
            </div>
          </div>
        </template>
        <el-form v-else label-position="top">
          <p v-if="breachNewRound" class="unbind-dialog-tip">{{ breachRoundHint() }}</p>
          <el-form-item label="事实与依据" required>
            <el-input v-model="breachReason" type="textarea" :rows="6" maxlength="2000" show-word-limit
              placeholder="请填写时间、已交付内容、沟通记录和希望平台核查的事实" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button :disabled="platformReviewLoading || breachLoading || breachDecisionLoading || breachWithdrawLoading"
          @click="closeBreachReport">
          {{ breachCase && !breachNewRound ? '关闭' : '取消' }}
        </el-button>
        <el-button v-if="canWithdrawBreachCase(breachCase) && !breachWithdrawConfirm" type="danger" plain
          :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
          @click="openBreachWithdrawConfirm">撤回申请</el-button>
        <el-button v-else-if="breachCase?.status === 'withdrawn' && !breachNewRound" type="primary"
          :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
          @click="reopenBreachReport">{{ breachWithdrawnByMe ? '重新发起' : '提交终止合作申请' }}</el-button>
        <el-button
          v-else-if="(breachCase?.status === 'rejected' || breachCase?.status === 'succeeded') && !breachNewRound"
          type="primary" :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
          @click="reopenBreachReport">发起新的终止合作</el-button>
        <el-button v-if="canRequestPlatformReview(breachCase)" type="primary" plain
          :loading="platformReviewLoading" @click="submitPlatformReview">申请平台介入</el-button>
        <el-button v-else-if="!breachCase || breachNewRound" type="primary" :loading="breachLoading"
          @click="submitBreachReport">
          {{ breachSubmitLabel() }}
        </el-button>
      </template>
    </el-dialog>

    <AfterSalesModal
      :visible="afterSalesVisible"
      :token="auth.token"
      :current-username="auth.username"
      :requirement-id="afterSalesTarget?.requirement_id ?? ''"
      :requirement-title="afterSalesTarget?.title ?? ''"
      :can-open-case="false"
      @close="closeAfterSalesModal"
    />

    <RequirementConversationModal :visible="conversationVisible" api-mode="dev" :token="auth.token"
      :current-username="auth.username" :requirement-id="conversationRequirement?.requirement_id ?? ''"
      :title="conversationRequirement?.title" @updated="applyConversationDetail" @close="closeConversation" />
  </div>
</template>

<style scoped>
.dev-requirement-card {
  display: grid;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid var(--dev-line);
  border-radius: var(--dev-radius-inner);
  background: var(--dev-surface-strong);
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
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

/* 卡片里的描述是正文，取 13px（与 .dev-stack-item__meta 同档）；
   表格单元格里的描述用 .dev-requirement-hall__desc 的 12px 弱字 */
.dev-requirement-card__description {
  margin: 0;
  font-size: 13px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.dev-requirement-card__description :deep(p) {
  margin: 0 0 8px;
}

.dev-requirement-card__description :deep(p:last-child) {
  margin-bottom: 0;
}

.dev-requirement-card__description :deep(ul),
.dev-requirement-card__description :deep(ol) {
  margin: 0 0 8px;
  padding-left: 22px;
}

.dev-requirement-card__description :deep(blockquote) {
  margin: 8px 0;
  padding-left: 12px;
  border-left: 3px solid var(--wb-accent-line);
  color: var(--dev-ink);
}

.dev-requirement-card__description :deep(hr) {
  margin: 12px 0;
  border: 0;
  border-top: 1px solid var(--dev-line);
}

.dev-requirement-card__description :deep(pre) {
  overflow-x: auto;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--dev-bg);
  white-space: pre;
}

.dev-requirement-card__description.is-collapsed {
  max-height: 84px;
  overflow: hidden;
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
   这里不再把它单独扭成胶囊——同一排的「签署合同 / 终止合作 / 申请解除」都是方角，
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

.dev-requirement-card__unbind-hint {
  font-size: 12px;
  font-weight: 700;
  color: var(--dev-gold);
}

/* 行内操作按钮的容器与规格都走统一层的 .dev-list-actions（见 dev-base.css），
   本页不再自己写一份 flex 布局，否则按钮高度会退回 Element 的默认档。 */

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

/* 违约案件：双方表态（接受 / 不接受）区块 */
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
   弹窗由 Element teleport 到 body，配色令牌靠 .dev-dialog（见 dev-base.css），
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

  .breach-decision__actions :deep(.el-button) {
    flex: 1 1 140px;
    min-height: 44px;
    margin-left: 0;
  }
}
</style>
