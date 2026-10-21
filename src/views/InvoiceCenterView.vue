<script setup lang="ts">
/**
 * 我的发票（客户工作台 `/workbench/invoices` 与开发者工作台带 `devArea` 的同名页共用）。
 *
 * 这一页只负责排版与组合：
 * - 取数、分页、筛选、上传/下载、重新申请弹窗 → `useInvoiceCenter`；
 * - 顶部读数条 → `InvoiceSummaryStrip`；
 * - 一个需求一张卡（卡头 + 逐票成行）→ `InvoiceGroupCard`；
 * - 状态文案、徽标、金额格式 → `@/shared/invoiceDisplay`。
 */
import { computed } from 'vue'

import InvoiceApplyDialog from '@/components/InvoiceApplyDialog.vue'
import InvoiceGroupCard from '@/components/invoice/InvoiceGroupCard.vue'
import InvoiceSummaryStrip from '@/components/invoice/InvoiceSummaryStrip.vue'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import { useInvoiceCenter } from '@/composables/useInvoiceCenter'
import { INVOICE_STATUS_FILTERS } from '@/shared/invoiceDisplay'
import {
  RefreshLeft,
  Search,
  TButton,
  TIcon,
  TInput,
  TOption,
  TPagination,
  TSelect,
} from 'ui_73info'

const {
  auth,
  perspective,
  loading,
  groups,
  filteredGroups,
  filteredTotal,
  pagedGroups,
  stats,
  keyword,
  statusFilter,
  hasActiveFilters,
  resetFilters,
  page,
  pageSize,
  selectedFileByInvoice,
  uploadingInvoiceId,
  downloadingInvoiceId,
  hiddenFileInput,
  pickInvoiceFile,
  selectInvoiceFile,
  uploadDocument,
  openDocument,
  saveDocument,
  applyVisible,
  applyRequirementId,
  applyRole,
  openReapply,
  loadData,
} = useInvoiceCenter()

/** 已经选好文件、等待上传的发票 id（卡片据此把按钮切成「确认替换 / 上传发票」）。 */
const selectedIds = computed(() =>
  Object.entries(selectedFileByInvoice)
    .filter(([, file]) => Boolean(file))
    .map(([id]) => Number(id)),
)
</script>

<template>
  <main class="page-shell custom-page-shell profile-page invoice-center-page" :aria-busy="loading">
    <InvoiceSummaryStrip :loading="loading" :stats="stats" @refresh="loadData" />

    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">我的发票</h3>
        </div>
      </div>

      <!-- 工具栏常驻：没有记录时也给出状态与搜索，与其余菜单页同一套结构。
           本页工具栏不放「重置」——清空筛选的入口留在下方空态的「清除筛选」里。 -->
      <div class="wb-toolbar">
        <TSelect
          v-model="statusFilter"
          class="wb-toolbar__field"
          placeholder="发票状态"
          aria-label="按状态筛选"
        >
          <TOption
            v-for="option in INVOICE_STATUS_FILTERS"
            :key="option.key"
            :label="option.label"
            :value="option.key"
          />
        </TSelect>
        <TInput
          v-model="keyword"
          class="wb-toolbar__search"
          clearable
          placeholder="搜索发票号、需求编号或发票标题"
          aria-label="搜索发票"
        >
          <template #prefix
            ><TIcon><Search /></TIcon
          ></template>
        </TInput>
        <div v-if="hasActiveFilters" class="wb-toolbar__actions">
          <span class="wb-toolbar__hint">
            筛选出 {{ filteredTotal }} / {{ groups.length }} 条
          </span>
        </div>
      </div>

      <p v-if="loading && !groups.length" class="wb-empty" role="status">正在加载发票记录…</p>
      <div v-else-if="!filteredGroups.length" class="wb-empty">
        <span class="wb-empty__title">{{
          groups.length ? '没有符合条件的发票' : '还没有发票记录'
        }}</span>
        <template v-if="groups.length">
          <div class="wb-empty__actions">
            <TButton variant="outline" @click="resetFilters">
              <TIcon><RefreshLeft /></TIcon><span>清除筛选</span>
            </TButton>
          </div>
        </template>
        <template v-else>获取发票的入口在对应需求的操作栏里，提交后会在这里出现。</template>
      </div>
      <template v-else>
        <input
          ref="hiddenFileInput"
          class="invoice-center__file"
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          aria-hidden="true"
          tabindex="-1"
          @change="selectInvoiceFile"
        />
        <ul class="wb-list" aria-label="我的发票记录">
          <InvoiceGroupCard
            v-for="group in pagedGroups"
            :key="group.requirementId"
            :group="group"
            :username="auth.username"
            :perspective="perspective"
            :uploading-id="uploadingInvoiceId"
            :downloading-id="downloadingInvoiceId"
            :selected-ids="selectedIds"
            @reapply="openReapply(group)"
            @open-document="openDocument"
            @save-document="saveDocument"
            @upload-document="uploadDocument"
            @pick-file="pickInvoiceFile"
          />
        </ul>
      </template>

      <div v-if="!(loading && !groups.length)" class="wb-pager">
        <div class="wb-pager__count">
          <TSelect v-model="pageSize" class="wb-pager__size" aria-label="每页记录数">
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
          aria-label="发票记录分页"
        />
      </div>
    </section>

    <!-- 原票被红冲后从这里重新申请：复用需求页那支开票弹窗，它按需求算出这次能重开哪几张票。 -->
    <InvoiceApplyDialog
      v-model:visible="applyVisible"
      :token="auth.token"
      :requirement-id="applyRequirementId"
      :role="applyRole"
      @submitted="loadData"
    />
  </main>
</template>

<style scoped>
/* 版式全部走统一层（.wb-strip / .wb-card-head / .wb-toolbar / .wb-list / .wb-pager / .wb-empty /
   .wb-badge）；卡内的排版随 `InvoiceGroupCard` 一起搬走，本页只留文件输入框的隐藏规则。 */
.invoice-center__file {
  display: none;
}
</style>
