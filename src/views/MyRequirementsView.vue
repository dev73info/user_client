<script setup lang="ts">
/**
 * 「我的需求」：一张读数条 + 一张需求列表 + 十四个弹窗挂点。
 *
 * 这一页只负责排版。取数、筛选分页、行内动作分发与进页面收尾在 `useMyRequirementsPage`，
 * 动作域（支付 / 合同 / 取消完成验收售后评价 / 会话发票转换 / 解除合作 / 发布编辑）在
 * `useRequirementPageActions` 里总装。
 *
 * 弹窗组件的 props 与监听由各自的域拼成一份 `v-bind` 对象（`xxxModal`），这里只留挂点：
 * 弹窗组件仍是纯 emit，不认识 composable，也不碰 router / TMessage。
 */
import AcceptanceDialog from '@/components/AcceptanceDialog.vue'
import AfterSalesModal from '@/components/AfterSalesModal.vue'
import InvoiceApplyDialog from '@/components/InvoiceApplyDialog.vue'
import PublishModal from '@/components/PublishModal.vue'
import RequirementCommentDialog from '@/components/RequirementCommentDialog.vue'
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import RequirementBreachModal from '@/components/requirements/RequirementBreachModal.vue'
import RequirementClaimModal from '@/components/requirements/RequirementClaimModal.vue'
import RequirementConfirmModals from '@/components/requirements/RequirementConfirmModals.vue'
import RequirementDownloadPicker from '@/components/requirements/RequirementDownloadPicker.vue'
import RequirementPager from '@/components/requirements/RequirementPager.vue'
import RequirementPayModal from '@/components/requirements/RequirementPayModal.vue'
import RequirementRow from '@/components/requirements/RequirementRow.vue'
import RequirementStrip from '@/components/requirements/RequirementStrip.vue'
import RequirementToolbar from '@/components/requirements/RequirementToolbar.vue'
import RequirementVersionReviewCard from '@/components/requirements/RequirementVersionReviewCard.vue'
import { useMyRequirementsPage } from '@/composables/useMyRequirementsPage'
import { REQUIREMENT_FILTER_OPTIONS } from '@/shared/requirementStatus'

const {
  // 读数条与工具栏
  myRequirements,
  requirementLoading,
  conversationLoading,
  requirementStats,
  keyword,
  selectedState,
  filteredRequirements,
  filteredTotal,
  hasActiveFilters,
  pagedRequirements,
  page,
  pageSize,
  resetFilters,
  handleRefresh,
  openPublishModal,
  // 需求行
  rowFacts,
  isVersionDeleteReviewExpanded,
  isVersionReviewCardVisible,
  versionReviewCard,
  contractCreatingId,
  requirementSubscriptionLoadingId,
  resourceVisibilityLoadingId,
  resourceDownloadingId,
  afterSalesBadgeFor,
  afterSalesPendingCount,
  toggleRequirementSubscription,
  toggleRequirementResourceVisibility,
  toggleVersionDeleteReviewCard,
  runRowAction,
  openRequirementConversationPage,
  // 弹窗挂点
  publishModalRef,
  publishModal,
  editModalRef,
  editModal,
  conversationModal,
  invoiceDialog,
  payModal,
  updatePayChannel,
  submitRequirementPayment,
  downloadPicker,
  confirmModals,
  claimModal,
  breachModal,
  acceptanceModal,
  afterSalesModal,
  commentModal,
} = useMyRequirementsPage()
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

            <!-- 版本删除审核：展开态、拒绝原因草稿与进行中守卫都在行操作域。 -->
            <RequirementVersionReviewCard
              v-if="isVersionReviewCardVisible(item)"
              v-bind="versionReviewCard(item)"
            />
          </template>
        </ul>

        <RequirementPager v-model:page="page" v-model:page-size="pageSize" :total="filteredTotal" />
      </template>
    </section>

    <!-- 发布 / 编辑：同一个 `PublishModal` 组件、同一个 composable 工厂的两份实例。 -->
    <PublishModal ref="publishModalRef" v-bind="publishModal" />
    <PublishModal ref="editModalRef" v-bind="editModal" />

    <RequirementConversationModal v-bind="conversationModal" />
    <InvoiceApplyDialog v-bind="invoiceDialog" />

    <!-- 支付弹窗：金额、通道与订单状态来自 `useRequirementPayFlow`；`submit` 后的跳转在动作域执行。
         `@update:channel` 与组件 `defineEmits` 的键必须一致——拆出组件时这里曾对不上，
         表现是点「微信」不切通道、下单永远按支付宝走（`requirementPayModal.spec.ts` 钉住）。 -->
    <RequirementPayModal
      v-bind="payModal"
      @update:channel="updatePayChannel"
      @submit="submitRequirementPayment"
    />

    <RequirementDownloadPicker v-bind="downloadPicker" />

    <!-- 「确认完成」（只服务无担保需求）与「取消需求单」两个 `.pay-modal` 确认弹窗。 -->
    <RequirementConfirmModals v-bind="confirmModals" />

    <!-- 「转为我的资源」：确认 → 已转换两个 step 都在组件里；跳转由动作域执行。 -->
    <RequirementClaimModal v-bind="claimModal" />

    <!-- 解除合作：案件进展 / 协商表态 / 判定表态都在组件里，跳转（绑定银行卡）由绑定层回调。 -->
    <RequirementBreachModal v-bind="breachModal" />

    <AcceptanceDialog v-bind="acceptanceModal" />
    <AfterSalesModal v-bind="afterSalesModal" />
    <RequirementCommentDialog v-bind="commentModal" />
  </main>
</template>

<style scoped>
.my-requirements-page {
  gap: 16px;
}

/* 弹窗类样式都不在本块：`.download-picker*` 与 `.pay-modal .claim-notes*` 在 `styles/profile.css`——
   相应弹窗拆成组件后没有 scoped 块，留在视图 scoped 里会静默失配。 */

.requirement-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
