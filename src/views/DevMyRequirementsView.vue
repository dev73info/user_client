<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { ArrowDown, ArrowUp, ChatDotRound, Refresh, RefreshLeft, Search } from '@element-plus/icons-vue'

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
import InvoiceApplyDialog from '@/components/InvoiceApplyDialog.vue'
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
const signingStatusMap = ref<Record<string, ContractSigningStatus | null>>({})
const contractCreatingId = ref('')
const conversationVisible = ref(false)
const conversationRequirement = ref<RequirementItem | null>(null)
const conversationLoading = ref(false)
/** 获取发票：乙方获取的是开发者发票，入口与需求方共用同一个弹窗（弹窗按身份决定开出哪些票）。 */
const invoiceDialogVisible = ref(false)
const invoiceRequirement = ref<RequirementItem | null>(null)
const requirementConversationMap = ref<Record<string, RequirementConversation>>({})
const descriptionOverflowMap = ref<Record<string, boolean>>({})
const expandedRequirements = ref<Record<string, boolean>>({})
const descriptionEls = ref<Record<string, HTMLElement>>({})

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
    return '我的需求单加载中'
  }

  return hasActiveFilters.value ? '没有符合筛选条件的需求单' : '当前账号还没有已关联需求'
})

// 搜索与状态筛选都在前端做：这一页的数据源本来就是把当前开发者的需求单一次取回。
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

const filteredRows = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()

  return rows.value.filter((item) => {
    if (filters.status && statusKey(item) !== filters.status) {
      return false
    }

    if (!keyword) {
      return true
    }

    return [item.requirement_id, item.title, item.description ?? ''].some((value) =>
      value.toLowerCase().includes(keyword),
    )
  })
})

function resetFilters() {
  filters.keyword = ''
  filters.status = ''
}

/* 分页与其余菜单页同构（资源项目、团队资源、交付记录、收益钱包、需求大厅都带表尾分页器）。
   需求单一次取回全部、筛选在前端做，所以这里是客户端切片，不走服务端页码。 */
const { page, pageSize, total: filteredTotal, paged: pagedRows } = useClientPagination(filteredRows)

/* 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。 */
watch([() => filters.keyword, () => filters.status], () => {
  page.value = 1
})
const boundCount = computed(() => rows.value.filter((item) => item.bound_resource_id != null).length)
const activeCount = computed(() => rows.value.filter((item) => item.status === 'in_development').length)

onMounted(async () => {
  auth.hydrate()
  await loadMyRequirements()
})

async function loadMyRequirements() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  loading.value = true
  try {
    rows.value = await listMyRequirements(auth.token)
    // 无担保模式（self_managed）不需要合同，无需查询合同签署状态
    const guaranteedRows = rows.value.filter((item) => item.payment_mode !== 'self_managed')
    const [statusEntries] = await Promise.all([
      Promise.allSettled(
        guaranteedRows.map((item) =>
          fetchDevContractSigningStatus(auth.token!, item.requirement_id).then((s) => ({ id: item.requirement_id, s })),
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

function formatMoney(value?: number | null): string {
  if (value == null) {
    return '待议价'
  }

  return `¥${value}`
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

function resourceVisibilityLabel(item: RequirementItem): string {
  if (item.bound_resource_id == null) {
    return '未关联资源'
  }

  if (item.resource_visibility === 'public') {
    return '资源已公开'
  }

  return item.resource_visibility === 'review' ? '资源审核中' : '资源私有中'
}

function openConversation(item: RequirementItem) {
  conversationRequirement.value = item
  conversationVisible.value = true
}

function openInvoiceDialog(item: RequirementItem) {
  invoiceRequirement.value = item
  invoiceDialogVisible.value = true
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

function resourceVersionCount(item: RequirementItem) {
  return item.bound_resource_version_count ?? 0
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
          <h3 class="dev-section-title">需求单列表</h3>
          <p class="dev-section-desc">已关联的需求单及其签署与交付进度，搜索与状态筛选即时生效。</p>
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
        </el-select>

        <el-input v-model="filters.keyword" clearable placeholder="搜索需求编号、标题或描述"
          class="dev-toolbar__search">
          <template #prefix>
            <el-icon>
              <Search />
            </el-icon>
          </template>
        </el-input>

        <div class="dev-toolbar__actions">
          <span v-if="hasActiveFilters" class="dev-toolbar__hint">
            筛选出 {{ filteredRows.length }} / {{ rows.length }} 条
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
           本页原来自己写 16px，与交付记录、我的团队的卡片列表差 2px，切页面时行距会跳一下。 -->
      <div class="dev-stack-list" v-loading="loading">
        <div v-if="filteredRows.length === 0" class="dev-empty-state">{{ emptyText }}</div>
        <article v-for="item in pagedRows" :key="item.requirement_id" class="dev-requirement-card">
          <header class="dev-requirement-card__head">
            <div class="dev-requirement-card__title-block">
              <span class="dev-requirement-hall__requirement-id">{{ item.requirement_id }}</span>
              <h3 class="dev-requirement-hall__title">{{ item.title }}</h3>
              <article class="dev-requirement-hall__desc dev-requirement-card__description"
                :class="{ 'is-collapsed': !isDescriptionExpanded(item) }"
                :ref="(el) => setDescriptionRef(el as HTMLElement | null, item)"
                v-html="requirementFieldHtml(item.description)"></article>
              <button v-if="isDescriptionExpanded(item) || descriptionOverflow(item)" type="button"
                class="dev-requirement-card__description-toggle" @click="toggleDescription(item)">
                <el-icon>
                  <ArrowUp v-if="isDescriptionExpanded(item)" />
                  <ArrowDown v-else />
                </el-icon>
                <span>{{ isDescriptionExpanded(item) ? '收起' : '展开' }}</span>
              </button>
            </div>
            <div class="dev-requirement-card__tags">
              <el-tag :type="displayStatusType(item)" effect="plain">{{ displayStatusLabel(item) }}</el-tag>
              <el-tag :type="item.payment_mode === 'self_managed' ? 'info' : 'warning'" effect="plain">
                {{ paymentModeLabel(item) }}
              </el-tag>
            </div>
          </header>

          <div class="dev-requirement-card__meta">
            <span class="dev-requirement-card__meta-item">
              <label>预算</label>
              <strong>{{ formatMoney(item.budget) }}</strong>
            </span>
            <span class="dev-requirement-card__meta-item">
              <label>资源关联</label>
              <strong>{{ resourceVisibilityLabel(item) }}</strong>
            </span>
            <span class="dev-requirement-card__meta-item">
              <label>最近更新</label>
              <strong>{{ item.updated_at }}</strong>
            </span>
            <span class="dev-requirement-card__meta-item">
              <label>会话</label>
              <strong>{{ conversationLoading ? '加载中' : conversationStatusLabel(item) }}</strong>
            </span>
            <span v-if="item.bound_resource_id != null" class="dev-requirement-card__meta-item">
              <label>资源版本</label>
              <strong>{{ resourceVersionCount(item) }} 版</strong>
            </span>
          </div>

          <div class="dev-requirement-card__progress">
            <RequirementProgressGuide :requirement="item" :payment-mode="item.payment_mode" view="dev"
              :contract-status="signingStatusMap[item.requirement_id]" />
          </div>

          <div v-if="settlementHint(item)" class="signing-start-hint">{{ settlementHint(item) }}</div>

          <div v-if="item.payment_mode !== 'self_managed'" class="dev-requirement-card__signing">
            <div class="signing-status-bar">
              <span class="signing-step"
                :class="signingStatusMap[item.requirement_id]?.has_contract ? 'done' : 'pending'">
                协议已创建
              </span>
              <span class="signing-arrow">›</span>
              <span class="signing-step"
                :class="signingStatusMap[item.requirement_id]?.party_b_signed ? 'done' : 'pending'">
                乙方已签
              </span>
              <span class="signing-arrow">›</span>
              <span class="signing-step"
                :class="signingStatusMap[item.requirement_id]?.party_a_signed ? 'done' : 'pending'">
                甲方已签
              </span>
            </div>
            <div v-if="contractStartHint(item)" class="signing-start-hint">{{ contractStartHint(item) }}</div>
          </div>

          <footer class="dev-requirement-card__actions">
            <div class="dev-requirement-card__unbind">
              <span v-if="item.pending_unbind_request?.status === 'pending'" class="dev-requirement-card__unbind-hint">
                {{ unbindRequestHint(item) }}
              </span>
            </div>
            <!-- 行内操作按钮走统一层的 .dev-list-actions（32px 高 / 10px 圆角），
                 与资源列表、交付记录、我的团队的行内按钮同一规格。
                 这里原先是本页自写的 .dev-requirement-card__buttons + 逐个 size="small"
                 （Element 的 24px 小号），同一张卡里按钮比顶部工具栏矮一档。 -->
            <div class="dev-list-actions">
              <!-- 行内按钮的上色走统一层的 .dev-action--soft / .dev-action--soft-danger：
                   原来挂的是裸 `type="primary" plain` / `type="danger" plain`，
                   Element 的 plain 变体给的是浅蓝底（#e8edfa）与粉底三件套，
                   与表格行里的白底 + 主色描边不是一套，禁用态的「终止合作」更是一片粉。 -->
              <el-button v-if="canSubmitDeliveryVersion(item)" type="primary" plain
                class="dev-action--soft"
                title="交付物以绑定资源项目的新版本提交" @click="openDeliveryDialog(item)">
                提交交付版本
              </el-button>
              <el-button v-if="canOpenAfterSales(item)" type="primary" plain class="dev-action--soft"
                @click="openAfterSalesModal(item)">
                售后
              </el-button>
              <el-button v-if="canReportBreach(item)" type="danger" plain class="dev-action--soft-danger"
                @click="openBreachReport(item)">
                终止合作
              </el-button>
              <el-button v-else-if="awaitingDepositDeadline(item)" type="danger" plain
                class="dev-action--soft-danger" disabled
                title="定金未缴，暂不能发起终止合作；逾期未缴定金将由系统自动终止合作并释放接单保证金">
                终止合作
              </el-button>
              <el-button v-if="canCreateRequirementContract(item)" type="primary"
                :loading="contractCreatingId === item.requirement_id"
                @click="createRequirementContractAction(item)">
                发起合同
              </el-button>
              <el-button v-if="canOpenContractSign(item)" @click="handleContractButtonClick(item)">
                {{ contractButtonLabel(item) }}
              </el-button>
              <el-button type="primary" plain class="dev-action--soft dev-requirement-card__conversation"
                @click="openConversation(item)">
                <el-icon><ChatDotRound /></el-icon>
                <span>会话</span>
              </el-button>
              <el-button @click="openInvoiceDialog(item)">
                获取发票
              </el-button>
              <el-button v-if="hasPendingCreatorUnbindRequest(item)" type="warning"
                @click="openUnbindRespond(item)">处理解除申请</el-button>
              <el-button v-else-if="canRequestUnbind(item)" type="danger" plain class="dev-action--soft-danger"
                @click="openUnbindRequest(item)">申请解除</el-button>
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
          :pager-count="5" layout="prev, pager, next" background aria-label="需求单列表分页" />
      </div>
    </el-card>

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

    <InvoiceApplyDialog v-model:visible="invoiceDialogVisible" :token="auth.token"
      :requirement-id="invoiceRequirement?.requirement_id ?? ''" role="developer" @submitted="loadMyRequirements" />
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
   这里不再把它单独扭成胶囊——同一排的「签署合同 / 终止合作 / 获取发票」都是方角，
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

@media (max-width: 720px) {
  .dev-requirement-card__head {
    flex-direction: column;
  }

  .dev-requirement-card__meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .breach-decision__actions :deep(.el-button) {
    flex: 1 1 140px;
    min-height: 44px;
    margin-left: 0;
  }
}
</style>
