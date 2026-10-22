<script setup lang="ts">
/**
 * 开发者「售出订单」页。
 *
 * 与买家侧「我的已购资源」（MyResourcePurchasesView）是一件事的两面：
 * 那边是我买进来的，这边是我卖出去的。买家侧不能发起退款（需求 Q9），
 * 退款由卖家（资源所有者 / 团队管理员）或平台发起，落在这里。
 *
 * 关键口径（任务 R007 需求第六节）：
 * - 现金单、`paid`、支付后 365 天内、还有可退余额 → 可发起；
 *   **已下载也能退**（与买家自助退「已下载 409」不同）；
 * - 金额可全额可部分，单次 ≤ 可退余额；原因必填；
 * - 退款成功后立即收回买家下载权；退满转 `refunded`，部分退仍是 `paid` 但下载权已收回；
 * - **积分单不纳入**，列表里不给退款按钮。
 *
 * 取数与筛选在 `useDevSoldResourcePurchases`，表格在 `SoldPurchasesTable`，
 * 两步确认的退款弹窗在 `SoldPurchaseRefundDialog`（页面只按行拉起并把返回的行换掉）。
 */
import { ref } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRouter } from 'vue-router'

import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'
import { getResourceDetailSlug } from '@/api/resourceTags'
import SoldPurchasesTable from '@/components/dev/SoldPurchasesTable.vue'
import SoldPurchaseRefundDialog from '@/components/payment/SoldPurchaseRefundDialog.vue'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import { useDevSoldResourcePurchases } from '@/composables/useDevSoldResourcePurchases'
import { useAuthStore } from '@/stores/auth'

import {
  Refresh,
  Search,
  TButton,
  TCard,
  TIcon,
  TInput,
  TOption,
  TPagination,
  TSelect,
} from 'ui_73info'

const router = useRouter()
const auth = useAuthStore()

const STATUS_FILTER_OPTIONS: { label: string; value: string }[] = [
  { label: '已支付', value: 'paid' },
  { label: '退款中', value: 'refunding' },
  { label: '已退款', value: 'refunded' },
  { label: '待支付', value: 'pending' },
  { label: '失败', value: 'failed' },
  { label: '已关闭', value: 'closed' },
]

const {
  isLoading,
  filters,
  scopedOrders,
  paidCount,
  refundableCount,
  refundedCount,
  filteredOrders,
  hasActiveFilters,
  page,
  pageSize,
  filteredTotal,
  paged,
  emptyText,
  resetPage,
  loadOrders,
  applyUpdated,
} = useDevSoldResourcePurchases()

/** 退款弹窗挂点：打开前的目标行、关窗后的行替换都在组件里，页面只传行、收结果。 */
const refundDialog = ref<InstanceType<typeof SoldPurchaseRefundDialog> | null>(null)

function openRefundDialog(order: ResourcePurchaseOrder) {
  refundDialog.value?.open(order)
}

function openResource(order: ResourcePurchaseOrder) {
  void router.push({
    name: 'resource-detail-direct',
    params: {
      resourceSlug: getResourceDetailSlug(order.resource_id, order.seller || 'resource'),
    },
  })
}
</script>

<template>
  <div class="dev-page dev-page--sold-purchases">
    <WorkbenchBarSlot>
      <div class="dev-meta-strip">
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">售出订单</span>
          <span class="dev-meta-strip__value">{{ isLoading ? '—' : scopedOrders.length }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">已支付</span>
          <span class="dev-meta-strip__value">{{ isLoading ? '—' : paidCount }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">可退款</span>
          <span class="dev-meta-strip__value">{{ isLoading ? '—' : refundableCount }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">已退款</span>
          <span class="dev-meta-strip__value">{{ isLoading ? '—' : refundedCount }}</span>
        </div>
        <div class="dev-meta-strip__item dev-meta-strip__action">
          <TButton icon-only :loading="isLoading" aria-label="刷新售出订单" @click="loadOrders">
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
          <h3 class="dev-section-title">订单明细</h3>
        </div>
      </div>

      <div class="dev-toolbar">
        <TSelect
          v-model="filters.status"
          clearable
          placeholder="订单状态"
          class="dev-toolbar__field"
          aria-label="按订单状态筛选"
          @change="resetPage"
        >
          <TOption
            v-for="option in STATUS_FILTER_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </TSelect>

        <TInput
          v-model="filters.keyword"
          clearable
          placeholder="搜索订单号、买家或退款原因"
          class="dev-toolbar__search"
          @input="resetPage"
        >
          <template #prefix>
            <TIcon>
              <Search />
            </TIcon>
          </template>
        </TInput>

        <div class="dev-toolbar__actions">
          <span v-if="hasActiveFilters" class="dev-toolbar__hint">
            筛选出 {{ filteredOrders.length }} / {{ scopedOrders.length }} 笔
          </span>
          <TButton variant="outline" @click="router.push({ name: 'dev-resource-list' })">
            返回资源项目
          </TButton>
        </div>
      </div>

      <SoldPurchasesTable
        :rows="paged"
        :loading="isLoading"
        :empty-text="emptyText"
        @open="openResource"
        @refund="openRefundDialog"
      />

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
          aria-label="售出订单分页"
        />
      </div>
    </TCard>

    <!-- 主动退款弹窗：第一步填金额与原因，第二步确认（说明退款后买家失去下载权、资金原路退回） -->
    <SoldPurchaseRefundDialog ref="refundDialog" :token="auth.token" @updated="applyUpdated" />
  </div>
</template>
