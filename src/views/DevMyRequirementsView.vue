<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import DeliverySubmitDialog from '@/components/DeliverySubmitDialog.vue'
import DevMyRequirementCard from '@/components/dev/DevMyRequirementCard.vue'
import DevMyRequirementsMetaStrip from '@/components/dev/DevMyRequirementsMetaStrip.vue'
import DevRequirementRowDialogs from '@/components/dev/DevRequirementRowDialogs.vue'
import RequirementBreachDialog from '@/components/dev/RequirementBreachDialog.vue'
import RequirementReceiptDialog from '@/components/dev/RequirementReceiptDialog.vue'
import { useBreachCase } from '@/composables/useBreachCase'
import { useDevContractActions } from '@/composables/useDevContractActions'
import { useDevMyRequirementsLoad } from '@/composables/useDevMyRequirementsLoad'
import { useDevRequirementFilters } from '@/composables/useDevRequirementFilters'
import { useDevRequirementReceipt } from '@/composables/useDevRequirementReceipt'
import { useDevRequirementRowDialogs } from '@/composables/useDevRequirementRowDialogs'
import { useInvoiceUpload } from '@/composables/useInvoiceUpload'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import { buildDevOrderRows, receiptTotal, type DevMyOrderRow } from '@/shared/devDelivery'
import {
  canComment,
  canOpenAfterSales,
  canReportBreach,
  isWaitingContractSign,
} from '@/shared/devMyRequirementCard'
import { useAuthStore } from '@/stores/auth'
import type { RequirementItem } from '@/api/devRequirements'

import {
  TCard,
  TIcon,
  TInput,
  TLoading,
  TMessage,
  TOption,
  TPagination,
  TSelect,
  Search,
} from 'ui_73info'

const auth = useAuthStore()
const route = useRoute()

/* 卡上的「上传发票」：票从哪来（列表加载时一并取回）、哪张能传、选完即传都在这个 composable 里。
   登录身份注入进去，composable 不再去 store 里取第二遍。 */
const {
  hiddenInvoiceFileInput,
  uploadingInvoiceId,
  applyInvoices,
  uploadableInvoicesFor,
  pickInvoiceFile,
  selectInvoiceFile,
} = useInvoiceUpload({ token: () => auth.token, username: () => auth.username })

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

/* 取数编排整个交出去：四份数据并发、资源版本、签约状态回填、`onMounted` 时序与
   「角标不 await」都在那边写死。`rows` / `mergedRows` 仍是本页的单实例，composable 只是持有者。 */
const {
  loading,
  rows,
  resources,
  versionsByResource,
  income,
  signingStatusMap,
  loadMyRequirements,
  afterSalesPendingCount,
  afterSalesBadgeFor,
  contractStatusOf,
  applySigningStatus,
} = useDevMyRequirementsLoad({
  onInvoicesLoaded: (invoices) => applyInvoices(invoices),
  loadConversations,
})

/* 三件合同动作（发起合同 / 签署跳转 / 爱签预览回退）：都要读本页那一份签约状态，
   也都要往 `contract-sign` 跳，收在 composable 里，本页只接事件。 */
const { contractCreatingId, handleContractButtonClick, createRequirementContractAction } =
  useDevContractActions({ token: () => auth.token, contractStatusOf, applySigningStatus })

/* 列表里的一行：交付与到账先按需求归并（见 `shared/devDelivery.ts`），再把需求单本身贴回来。
   行类型与卡片共用一份（`DevMyOrderRow`），页面只是它的**单实例持有者**。 */
const requirementById = computed(
  () => new Map(rows.value.map((item) => [item.requirement_id, item])),
)
const resourceById = computed(() => new Map(resources.value.map((item) => [item.id, item])))

const mergedRows = computed<DevMyOrderRow[]>(() =>
  buildDevOrderRows(rows.value, resources.value, versionsByResource.value, income.value).map(
    (row) => ({
      ...row,
      item: row.requirementId ? (requirementById.value.get(row.requirementId) ?? null) : null,
    }),
  ),
)

/**
 * 行的状态档位：「待签合同」是签约状态推出来的中间态，不是 `RequirementItem.status` 的取值，
 * 单独给它一个 key，否则筛不到；补充行（未关联需求）另占 `unlinked` 一档。
 */
function statusKeyOf(row: DevMyOrderRow): string {
  if (!row.item) {
    return 'unlinked'
  }

  return isWaitingContractSign(row.item, contractStatusOf(row.item))
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

const emptyText = computed(() => {
  if (loading.value) {
    return '接单、交付与到账加载中'
  }

  return hasActiveFilters.value ? '没有符合筛选条件的记录' : '当前账号还没有已关联需求'
})

/** 累计到账：所有行上到账合计的和，与「收益钱包」的入账口径同源，不另算一份。 */
const incomeTotal = computed(() =>
  mergedRows.value.reduce((total, row) => total + receiptTotal(row.receipts), 0),
)

/* 回款详情弹窗：行上只留合计与笔数，点开才把逐笔摊开。打开状态、当前行与弹窗那一组事实
   都在 composable 里（存行标识、不存快照），本页只把行交给它。 */
const {
  visible: receiptDialogVisible,
  open: openReceiptDialog,
  detail: receiptDialogDetail,
} = useDevRequirementReceipt({ rows: () => mergedRows.value, contractStatusOf })

/**
 * 绑定资源的兜底标题：交付物那一格在需求还没有版本时回落到绑定的资源，
 * 资源已经不在资源清单里时写明原因，别把一格留空。查表留在页面（资源清单是页面的数据），
 * 卡片只吃算好的这一个字符串。
 */
function boundResourceTitleFor(row: DevMyOrderRow): string | null {
  const resourceId = row.item?.bound_resource_id
  if (resourceId == null) {
    return null
  }

  return resourceById.value.get(resourceId)?.title ?? '资源已不在列表'
}

/** 会话摘要：卡上的「会话」格子读的就是它（与弹窗里发出的「已创建会话」是同一份记录）。 */
function conversationLabelFor(row: DevMyOrderRow): string {
  return row.item ? conversationStatusLabel(row.item) : ''
}

const deliveryDialogVisible = ref(false)
const deliveryRequirement = ref<RequirementItem | null>(null)

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
 * 解除合作案件的编排层：案件加载、协商、AI 判定表态、撤回与重新申报。
 *
 * 签约状态**注入**进去（`contractStatusOf` 读本页一次取回的那份），弹窗与卡片因此共用
 * 同一份「有没有生效合同」的事实——在别处再查一次就是第二套口径。
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
  contractOf: contractStatusOf,
})

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

/** 解除合作入口：能不能申报由本页判定（要读一次取回的签约状态），案件编排在 `useBreachCase`。 */
function openBreachReport(item: RequirementItem) {
  if (!canReportBreach(item, contractStatusOf(item))) {
    return
  }
  void openBreachReportDialog(item)
}
</script>

<template>
  <div class="dev-page dev-page--my-requirements">
    <DevMyRequirementsMetaStrip
      :rows="rows"
      :income-total="incomeTotal"
      :loading="loading"
      @refresh="loadMyRequirements"
    />

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
             页面只把**签约状态**（本页那份）与售后角标算好传下去。 -->
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
