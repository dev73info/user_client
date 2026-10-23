<script setup lang="ts">
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import type { ContractSigningStatus } from '@/api/contracts'
import type { RequirementItem } from '@/api/devRequirements'
import type { InvoiceRecord } from '@/api/invoices'
import type { DevMyOrderRow } from '@/shared/devDelivery'

import { TPagination, TLoading, TOption, TSelect } from 'ui_73info'
import DevMyRequirementCard from '@/components/dev/DevMyRequirementCard.vue'

/**
 * 「接单与交付」的列表容器与表尾分页：一张卡就是一行（抬头、读数、进度条、评价、
 * 签约状态与操作栏都在 `DevMyRequirementCard` 里）。行是页面的单实例，这里只吃切好页的
 * `rows` 与页面算好的派生值，行上的动作原样往上传。
 */
defineProps<{
  loading: boolean
  emptyText: string
  rows: DevMyOrderRow[]
  signingStatusMap: Record<string, ContractSigningStatus | null>
  afterSalesBadgeFor: (requirementId: string) => string
  afterSalesPendingCount: (requirementId: string) => number
  boundResourceTitleFor: (row: DevMyOrderRow) => string | null
  conversationLabelFor: (row: DevMyOrderRow) => string
  conversationLoading: boolean
  contractCreatingId: string
  uploadableInvoicesFor: (requirementId: string) => InvoiceRecord[]
  uploadingInvoiceId: number | null
  filteredTotal: number
  /** 筛选后的条数：空态按它判（不是当前页的条数）。 */
  filteredCount: number
}>()

const page = defineModel<number>('page', { required: true })
const pageSize = defineModel<number>('pageSize', { required: true })

const emit = defineEmits<{
  submitDelivery: [item: RequirementItem]
  openAfterSales: [item: RequirementItem]
  reportBreach: [item: RequirementItem]
  createContract: [item: RequirementItem]
  contractAction: [item: RequirementItem]
  pickInvoice: [invoiceId: number]
  openConversation: [item: RequirementItem]
  openComment: [item: RequirementItem]
  openReceipt: [row: DevMyOrderRow]
}>()
</script>

<template>
  <!-- 列表容器走统一层的 .dev-stack-list：它给的就是「卡片式列表」的 14px 行距，
       与资源项目、我的团队的卡片列表差同一档。
       一行一个需求单：交付物与到账长在同一张卡上（原「交付记录」页的两列），
       没被任何需求单绑定的交付、以及需求已解绑的到账，同样成行但不出签署与操作栏。 -->
  <TLoading tag="div" class="dev-stack-list" :loading="loading">
    <div v-if="filteredCount === 0" class="dev-empty-state">{{ emptyText }}</div>
    <!-- 一张卡就是一行：抬头、读数（含交付与到账）、进度条、评价、签约状态与操作栏都在
         `DevMyRequirementCard` 里。行是页面的单实例（`rows` / `mergedRows` 不下沉），
         卡片只吃这一行；判定与文案的口径在 `shared/devMyRequirementCard`，
         页面只把**签约状态**（本页那份）与售后角标算好传下去。 -->
    <DevMyRequirementCard
      v-for="row in rows"
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
      @submit-delivery="emit('submitDelivery', row.item!)"
      @open-after-sales="emit('openAfterSales', row.item!)"
      @report-breach="emit('reportBreach', row.item!)"
      @create-contract="emit('createContract', row.item!)"
      @contract-action="emit('contractAction', row.item!)"
      @pick-invoice="emit('pickInvoice', $event)"
      @open-conversation="emit('openConversation', row.item!)"
      @open-comment="emit('openComment', row.item!)"
      @open-receipt="emit('openReceipt', row)"
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
</template>
