<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRoute, useRouter } from 'vue-router'
import DeliverySubmitDialog from '@/components/DeliverySubmitDialog.vue'
import DevMyRequirementCard from '@/components/dev/DevMyRequirementCard.vue'
import DevRequirementRowDialogs from '@/components/dev/DevRequirementRowDialogs.vue'
import RequirementBreachDialog from '@/components/dev/RequirementBreachDialog.vue'
import RequirementReceiptDialog from '@/components/dev/RequirementReceiptDialog.vue'
import { useBreachCase } from '@/composables/useBreachCase'
import { useDevRequirementRowDialogs } from '@/composables/useDevRequirementRowDialogs'
import { useDevRequirementFilters } from '@/composables/useDevRequirementFilters'
import { useInvoiceUpload } from '@/composables/useInvoiceUpload'
import { afterSalesBadgeText, isAwaitingViewerAction } from '@/shared/afterSalesStatus'
import { listMyAfterSalesCases } from '@/api/afterSales'
import { listMyRequirements, type RequirementItem } from '@/api/devRequirements'
import {
  listMcResources,
  listMcResourceVersions,
  type McResourcePayload,
  type McResourceVersionPayload,
} from '@/api/mcResources'
import { getDevWalletOverview, type DevWalletIncomeItem } from '@/api/devWallet'
import {
  buildDevOrderRows,
  receiptMoney,
  receiptTotal,
  rowCustomer,
  rowTitle,
  timeValue,
  type DevMyOrderRow,
} from '@/shared/devDelivery'
import {
  createRequirementContract,
  fetchAsignRequirementPreviewUrl,
  fetchDevContractSigningStatus,
  type ContractSigningStatus,
} from '@/api/contracts'
import {
  canComment,
  canOpenAfterSales,
  canReportBreach,
  contractButtonLabel,
  displayStatusLabel,
  displayStatusType,
  isWaitingContractSign,
} from '@/shared/devMyRequirementCard'
import { listMyInvoices, type InvoiceRecord } from '@/api/invoices'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import {
  TButton,
  TCard,
  TIcon,
  TInput,
  TLoading,
  TMessage,
  TOption,
  TPagination,
  TSelect,
  Refresh,
  Search,
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
/* 签约状态：本页**单实例**。卡片、进度条与解除合作弹窗读的是同一份，
   卡片侧只拿「算好再传」的那一份（`:contract-status`），不各自再查。 */
const signingStatusMap = ref<Record<string, ContractSigningStatus | null>>({})
const contractCreatingId = ref('')

/* 卡上的「上传发票」：票从哪来（列表加载时一并取回）、哪张能传、选完即传都在这个 composable 里。
   登录身份注入进去，composable 不再去 store 里取第二遍。 */
const {
  hiddenInvoiceFileInput,
  uploadingInvoiceId,
  applyInvoices,
  uploadableInvoicesFor,
  pickInvoiceFile,
  selectInvoiceFile,
} = useInvoiceUpload({
  token: () => auth.token,
  username: () => auth.username,
})

/* 行上那三个按行打开的弹窗（解除合作售后 / 会话 / 评价）的编排收在 composable：
   卡片只判「能不能出这个入口」（见 `shared/devMyRequirementCard`），点开之后的状态、
   会话摘要与请求都在里面，模板上只剩 `DevRequirementRowDialogs` 一个挂点。 */
const {
  afterSalesVisible,
  afterSalesTarget,
  openAfterSales,
  closeAfterSales,
  conversationVisible,
  conversationTarget,
  conversationLoading,
  openConversation,
  closeConversation,
  applyConversationDetail,
  conversationStatusLabel,
  loadConversations,
  commentVisible,
  commentTarget,
  openComment,
  closeComment,
} = useDevRequirementRowDialogs({ token: () => auth.token })

/**
 * 列表里的一行：交付与到账先按需求归并（见 `shared/devDelivery.ts`），再把需求单本身贴回来。
 * 行类型与卡片共用一份（`DevMyOrderRow`），页面只是它的**单实例持有者**——
 * `rows` / `mergedRows` 不下沉，卡片只吃传下去的那一行。
 */
type MyOrderRow = DevMyOrderRow

const requirementById = computed(
  () => new Map(rows.value.map((item) => [item.requirement_id, item])),
)
const resourceById = computed(() => new Map(resources.value.map((item) => [item.id, item])))

const mergedRows = computed<MyOrderRow[]>(() =>
  buildDevOrderRows(rows.value, resources.value, versionsByResource.value, income.value).map(
    (row) => ({
      ...row,
      item: row.requirementId ? (requirementById.value.get(row.requirementId) ?? null) : null,
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

/** 某张需求的签约状态：本页那一份，缺了按「没查过」处理（无担保需求不查）。 */
function contractOf(item: RequirementItem): ContractSigningStatus | null {
  return signingStatusMap.value[item.requirement_id] ?? null
}

/**
 * 行的状态档位：「待签合同」是签约状态推出来的中间态，不是 `RequirementItem.status` 的取值，
 * 单独给它一个 key，否则筛不到；补充行（未关联需求）另占 `unlinked` 一档。
 */
function statusKeyOf(row: MyOrderRow): string {
  if (!row.item) {
    return 'unlinked'
  }

  return isWaitingContractSign(row.item, contractOf(row.item))
    ? 'contract_pending'
    : row.item.status
}

/* 搜索、状态筛选、客户端分页与「路由需求号灌词」都在 `useDevRequirementFilters` 里；
   行的来源仍是本页的单实例（`mergedRows`），composable 只吃一个 getter。 */
const { filters, hasActiveFilters, filteredRows, page, pageSize, filteredTotal, pagedRows } =
  useDevRequirementFilters({
    rows: () => mergedRows.value,
    statusKeyOf,
    requirementIdQuery: () =>
      typeof route.query.requirement_id === 'string' ? route.query.requirement_id.trim() : '',
  })

const boundCount = computed(
  () => rows.value.filter((item) => item.bound_resource_id != null).length,
)
const activeCount = computed(
  () => rows.value.filter((item) => item.status === 'in_development').length,
)
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
    applyInvoices(invoiceResult.value)

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
          fetchDevContractSigningStatus(token, item.requirement_id).then((s) => ({
            id: item.requirement_id,
            s,
          })),
        ),
      ),
      loadConversations(),
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

/**
 * 绑定资源的兜底标题：交付物那一格在需求还没有版本时回落到绑定的资源，
 * 资源已经不在资源清单里时写明原因，别把一格留空。查表留在页面（资源清单是页面的数据），
 * 卡片只吃算好的这一个字符串。
 */
function boundResourceTitleFor(row: MyOrderRow): string | null {
  const resourceId = row.item?.bound_resource_id
  if (resourceId == null) {
    return null
  }

  return resourceById.value.get(resourceId)?.title ?? '资源已不在列表'
}

/* === 合并后的行：回款弹窗与卡片共用的两条口径 ===
   交付物与到账原先是「交付记录」页的两列，现在长在需求单卡片上，
   行上的取数、文案与占位口径只留一处（见 `shared/devDelivery.ts` 与卡片里的读数条）。 */

function rowStatusLabel(row: MyOrderRow): string {
  if (row.item) {
    return displayStatusLabel(row.item, contractOf(row.item))
  }

  // 补充行只剩「需求已解绑」这一类：没绑定需求单的交付不成行（见 shared/devDelivery.ts）。
  return '需求已解绑'
}

function rowStatusType(row: MyOrderRow): 'info' | 'success' | 'warning' | 'danger' {
  return row.item ? displayStatusType(row.item, contractOf(row.item)) : 'info'
}

/** 会话摘要：卡上的「会话」格子读的就是它（与弹窗里发出的「已创建会话」是同一份记录）。 */
function conversationLabelFor(row: MyOrderRow): string {
  return row.item ? conversationStatusLabel(row.item) : ''
}

/** 打开回款详情：只记行标识，弹窗里从最新的数据里重新取这一行，不存快照。 */
function openReceiptDialog(row: MyOrderRow) {
  activeReceiptKey.value = row.key
  receiptDialogVisible.value = true
}

/**
 * 回款详情弹窗的那一组事实：抬头、委托方、状态徽标、逐笔回执与合计都在这里算好，
 * 弹窗只照着渲染。「待签合同」那一档要读本页一次取回的 `signingStatusMap`，
 * 在弹窗里再判一次就是第二份口径。
 */
const receiptDialogDetail = computed(() => {
  const row = activeReceiptRow.value
  if (!row) {
    return null
  }

  /* 逐笔按到账时间正序排：托管模式下定金先分账、尾款后分账，
     顺着时间读下来才是「第 1 笔 / 第 2 笔」应有的顺序（与列表里最近一笔在最上面相反）。 */
  const receipts = [...row.receipts].sort(
    (left, right) => timeValue(left.paidAt) - timeValue(right.paidAt),
  )

  return {
    dialogTitle: row.requirementId ? `回款详情 · ${row.requirementId}` : '回款详情',
    title: rowTitle(row),
    requirementId: row.requirementId ?? '',
    customer: rowCustomer(row) || '—',
    statusLabel: rowStatusLabel(row),
    statusTone: rowStatusType(row),
    receipts,
    totalText: receiptMoney(receiptTotal(receipts)),
  }
})

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

/**
 * 行内三个「按行打开」的入口：能不能出由卡片按 `shared/devMyRequirementCard` 判定，
 * 页面这一层再兜一次同样的口径（按钮消失与判定改动可能不同步，兜住就不会开出空弹窗）。
 */
function openAfterSalesModal(item: RequirementItem) {
  if (!canOpenAfterSales(item)) {
    TMessage.warning('只有已结单的需求有解除合作入口')
    return
  }
  openAfterSales(item)
}

function openCommentModal(item: RequirementItem) {
  if (!canComment(item)) {
    return
  }
  openComment(item)
}

async function handleCommentSubmitted() {
  await loadMyRequirements()
}

/**
 * 解除合作入口：能不能申报由本页判定（要读一次取回的 `signingStatusMap`），
 * 打开之后的案件加载、协商、表态与撤回都在 `useBreachCase` 里。
 */
function openBreachReport(item: RequirementItem) {
  if (!canReportBreach(item, contractOf(item))) {
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
  if (contractButtonLabel(contractOf(item)) === '查看合同') {
    void viewContractPreview(item)
    return
  }
  openContractSign(item)
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
          <TButton
            icon-only
            :loading="loading"
            aria-label="刷新接单列表"
            @click="loadMyRequirements"
          >
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
        <!-- 一张卡就是一行：抬头、读数（含交付与到账）、进度条、评价、签约状态与操作栏都在
             `DevMyRequirementCard` 里。行是页面的单实例（`rows` / `mergedRows` 不下沉），
             卡片只吃这一行；判定与文案的口径在 `shared/devMyRequirementCard`，
             页面只把**签约状态**（本页那份 `signingStatusMap`）与售后角标算好传下去。 -->
        <DevMyRequirementCard
          v-for="row in pagedRows"
          :key="row.key"
          :row="row"
          :contract-status="signingStatusMap[row.requirementId] ?? null"
          :after-sales-badge="afterSalesBadgeFor(row.requirementId)"
          :after-sales-pending-count="afterSalesPendingCount(row.requirementId)"
          :bound-resource-title="boundResourceTitleFor(row)"
          :conversation-label="conversationLabelFor(row)"
          :conversation-loading="conversationLoading"
          :contract-creating="contractCreatingId === row.requirementId"
          :uploadable-invoices="uploadableInvoicesFor(row.requirementId)"
          :uploading-invoice-id="uploadingInvoiceId"
          @submit-delivery="openDeliveryDialog(row.item!)"
          @open-after-sales="openAfterSalesModal(row.item!)"
          @report-breach="openBreachReport(row.item!)"
          @create-contract="createRequirementContractAction(row.item!)"
          @contract-action="handleContractButtonClick(row.item!)"
          @pick-invoice="pickInvoiceFile"
          @open-conversation="openConversation(row.item!)"
          @open-comment="openCommentModal(row.item!)"
          @open-receipt="openReceiptDialog(row)"
        />
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
         弹窗只照着渲染，不在这里另算，避免两处对不上。 -->
    <RequirementReceiptDialog v-model:open="receiptDialogVisible" :detail="receiptDialogDetail" />

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

    <!-- 售后（解除合作）/ 会话 / 评价三个按行打开的弹窗收在一处挂点，
         状态与请求在 `useDevRequirementRowDialogs`，组件只把状态铺成 props、把事件接回来。 -->
    <DevRequirementRowDialogs
      :token="auth.token"
      :username="auth.username"
      :after-sales-visible="afterSalesVisible"
      :after-sales-target="afterSalesTarget"
      :conversation-visible="conversationVisible"
      :conversation-target="conversationTarget"
      :comment-visible="commentVisible"
      :comment-target="commentTarget"
      @close-after-sales="closeAfterSales"
      @close-conversation="closeConversation"
      @conversation-updated="applyConversationDetail"
      @close-comment="closeComment"
      @comment-submitted="handleCommentSubmitted"
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
/* 本页色板：卡片上破坏性状态那支红（`signing-status-badge--danger`）原先写的是
   `var(--dev-danger, #dc2626)`——而 `--dev-danger` 从来没定义过，真正生效的一直是兜底值。
   拆卡片时把这一支红提到页面根上（取值一字未改），新组件只写 `var(--dmr-danger)`，
   新文件因此零裸色值。（记账：本页裸色值 2 处 → 1 处，见 frontend-baseline.json 的 raw-color 条目。） */
.dev-page--my-requirements {
  --dmr-danger: #dc2626;
}

/* 发票上传的原生 file input：行上「上传发票」共用这一个（`useInvoiceUpload` 的 ref 挂在本页），
   节点没跟着卡片下沉，所以这一条样式也留在本页。 */
.dev-requirement-card__invoice-file {
  display: none;
}
</style>
