<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import DevDeliverySubmitHost from '@/components/dev/DevDeliverySubmitHost.vue'
import DevMyRequirementsList from '@/components/dev/DevMyRequirementsList.vue'
import DevMyRequirementsMetaStrip from '@/components/dev/DevMyRequirementsMetaStrip.vue'
import DevMyRequirementsToolbar from '@/components/dev/DevMyRequirementsToolbar.vue'
import DevRequirementBreachHost from '@/components/dev/DevRequirementBreachHost.vue'
import DevRequirementRowDialogs from '@/components/dev/DevRequirementRowDialogs.vue'
import RequirementReceiptDialog from '@/components/dev/RequirementReceiptDialog.vue'
import { useDevContractActions } from '@/composables/useDevContractActions'
import { useDevMyRequirementsLoad } from '@/composables/useDevMyRequirementsLoad'
import { useDevMyRequirementsRows } from '@/composables/useDevMyRequirementsRows'
import { useDevRequirementFilters } from '@/composables/useDevRequirementFilters'
import { useDevRequirementReceipt } from '@/composables/useDevRequirementReceipt'
import { useDevRequirementRowDialogs } from '@/composables/useDevRequirementRowDialogs'
import { useInvoiceUpload } from '@/composables/useInvoiceUpload'
import { canComment, canOpenAfterSales } from '@/shared/devMyRequirementCard'
import { useAuthStore } from '@/stores/auth'
import type { RequirementItem } from '@/api/devRequirements'

import { TCard, TMessage } from 'ui_73info'

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

/* 行口径（归并、状态档位、到账合计、绑定资源标题、会话摘要）在 `useDevMyRequirementsRows`；
   行的来源仍是本页的单实例，那边只吃 getter。 */
const { mergedRows, statusKeyOf, incomeTotal, boundResourceTitleFor, conversationLabelFor } =
  useDevMyRequirementsRows({
    rows: () => rows.value,
    resources: () => resources.value,
    versionsByResource: () => versionsByResource.value,
    income: () => income.value,
    contractOf: contractStatusOf,
    conversationStatusLabel,
  })

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

/* 回款详情弹窗：行上只留合计与笔数，点开才把逐笔摊开。打开状态、当前行与弹窗那一组事实
   都在 composable 里（存行标识、不存快照），本页只把行交给它。 */
const {
  visible: receiptDialogVisible,
  open: openReceiptDialog,
  detail: receiptDialogDetail,
} = useDevRequirementReceipt({ rows: () => mergedRows.value, contractStatusOf })

/* 交付提交与解除合作两个挂点各自持有弹窗状态，本页只留拉起它们的 ref。 */
const deliveryHost = ref<InstanceType<typeof DevDeliverySubmitHost> | null>(null)
const breachHost = ref<InstanceType<typeof DevRequirementBreachHost> | null>(null)

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

/** 交付版本提交成功后刷新接单列表：需求的交付版本与进度会一起变化。 */
async function handleDeliverySubmitted() {
  await loadMyRequirements()
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

      <DevMyRequirementsToolbar
        v-model:status="filters.status"
        v-model:keyword="filters.keyword"
        :has-active-filters="hasActiveFilters"
        :filtered-count="filteredRows.length"
        :total-count="mergedRows.length"
      />

      <DevMyRequirementsList
        v-model:page="page"
        v-model:page-size="pageSize"
        :loading="loading"
        :empty-text="emptyText"
        :rows="pagedRows"
        :signing-status-map="signingStatusMap"
        :after-sales-badge-for="afterSalesBadgeFor"
        :after-sales-pending-count="afterSalesPendingCount"
        :bound-resource-title-for="boundResourceTitleFor"
        :conversation-label-for="conversationLabelFor"
        :conversation-loading="conversationLoading"
        :contract-creating-id="contractCreatingId"
        :uploadable-invoices-for="uploadableInvoicesFor"
        :uploading-invoice-id="uploadingInvoiceId"
        :filtered-total="filteredTotal"
        :filtered-count="filteredRows.length"
        @submit-delivery="deliveryHost?.open($event)"
        @open-after-sales="openAfterSalesModal"
        @report-breach="breachHost?.open($event)"
        @create-contract="createRequirementContractAction"
        @contract-action="handleContractButtonClick"
        @pick-invoice="pickInvoiceFile"
        @open-conversation="openConversation"
        @open-comment="openCommentModal"
        @open-receipt="openReceiptDialog"
      />
    </TCard>

    <!-- 回款详情弹窗：卡上只放合计与笔数，逐笔到这里摊开。
         金额、时间、流水号都来自同一份钱包回执（与「收益钱包 → 收入记录」同一个接口），
         弹窗只照着渲染，不在这里另算，避免两处对不上。 -->
    <RequirementReceiptDialog v-model:open="receiptDialogVisible" :detail="receiptDialogDetail" />

    <!-- 交付版本提交与解除合作案件两个挂点：弹窗状态与编排都在组件里，本页只按行拉起。 -->
    <DevDeliverySubmitHost
      ref="deliveryHost"
      :token="auth.token"
      @submitted="handleDeliverySubmitted"
    />
    <DevRequirementBreachHost
      ref="breachHost"
      :token="auth.token"
      :username="auth.username"
      :contract-of="contractStatusOf"
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
