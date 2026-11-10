<script setup lang="ts">
/**
 * 「我的已购资源」：搜索 + 状态筛选 + 列表 + 分页。
 *
 * 筛选与分页全部走服务端（`/api/resources/purchases/mine` 的 `status` / `keyword` /
 * `limit` / `offset`，总数在响应头 `X-Total-Count`），前端只负责控件与展示。
 * 取数、统计、防抖与分页都在 `useMyResourcePurchases`。
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'
import { getResourceDetailSlug } from '@/api/resourceTags'
import PurchaseStatsStrip from '@/components/payment/PurchaseStatsStrip.vue'
import PurchaseTransferDialog from '@/components/payment/PurchaseTransferDialog.vue'
import WorkbenchPager from '@/components/workbench/WorkbenchPager.vue'
import { useMyResourcePurchases } from '@/composables/useMyResourcePurchases'
import {
  formatPurchaseAmountLabel,
  isApiResourcePurchaseOrder,
  resourcePurchaseStatusLabel,
} from '@/shared/resourceSale'
import { canTransferPurchase } from '@/shared/resourceTransfer'
import { useAuthStore } from '@/stores/auth'

import { RefreshLeft, Search, TButton, TIcon, TInput, TOption, TSelect } from 'ui_73info'

const router = useRouter()
const auth = useAuthStore()
const transferOpen = ref(false)
const transferTarget = ref<ResourcePurchaseOrder | null>(null)

/** 状态筛选项：取值与文案一律沿用既有状态口径（`resourcePurchaseStatusLabel`），不自创状态名。 */
const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: resourcePurchaseStatusLabel('pending') },
  { value: 'paid', label: resourcePurchaseStatusLabel('paid') },
  { value: 'refunding', label: resourcePurchaseStatusLabel('refunding') },
  { value: 'refunded', label: resourcePurchaseStatusLabel('refunded') },
  { value: 'closed', label: resourcePurchaseStatusLabel('closed') },
  { value: 'failed', label: resourcePurchaseStatusLabel('failed') },
]

const {
  loading,
  statsLoading,
  orders,
  total,
  page,
  pageSize,
  statusFilter,
  keyword,
  stats,
  hasActiveFilters,
  reload,
  resetFilters,
} = useMyResourcePurchases()

function openResource(order: ResourcePurchaseOrder) {
  void router.push({
    name: 'resource-detail-direct',
    params: {
      resourceSlug: getResourceDetailSlug(order.resource_id, order.seller || 'resource'),
    },
  })
}

function openTransfer(order: ResourcePurchaseOrder) {
  transferTarget.value = order
  transferOpen.value = true
}
</script>

<template>
  <main
    class="page-shell custom-page-shell profile-page my-purchases-page wb-sheet"
    :aria-busy="loading"
  >
    <PurchaseStatsStrip
      v-model:status="statusFilter"
      :stats="stats"
      :loading="loading"
      :stats-loading="statsLoading"
      @refresh="reload"
    />

    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">我的已购资源</h3>
        </div>
        <div class="wb-card-head__actions">
          <TButton variant="outline" @click="router.push({ name: 'workbench-purchase-transfers' })">
            过户与转移
          </TButton>
          <TButton variant="outline" @click="router.push({ name: 'resources' })">
            浏览资源
          </TButton>
        </div>
      </div>

      <div class="wb-toolbar">
        <TSelect
          v-model="statusFilter"
          class="wb-toolbar__field wb-toolbar__field--purchases-status"
          aria-label="订单状态"
        >
          <TOption
            v-for="item in STATUS_FILTERS"
            :key="item.value"
            :value="item.value"
            :label="item.label"
          />
        </TSelect>
        <TInput
          v-model="keyword"
          class="wb-toolbar__search"
          clearable
          placeholder="搜索订单号或资源标题"
          aria-label="搜索已购订单"
        >
          <template #prefix
            ><TIcon><Search /></TIcon
          ></template>
        </TInput>
        <div v-if="hasActiveFilters" class="wb-toolbar__actions">
          <span class="wb-toolbar__hint">筛选出 {{ total }} / {{ stats.all }} 条</span>
        </div>
      </div>

      <p v-if="loading && !orders.length" class="wb-empty" role="status">正在加载已购资源…</p>
      <div v-else-if="!orders.length" class="wb-empty" role="status">
        <span class="wb-empty__title">
          {{ hasActiveFilters ? '没有符合条件的订单' : '还没有购买记录' }}
        </span>
        <div v-if="hasActiveFilters" class="wb-empty__actions">
          <TButton variant="outline" @click="resetFilters">
            <TIcon><RefreshLeft /></TIcon><span>清除筛选</span>
          </TButton>
        </div>
      </div>
      <ul v-else class="wb-list" aria-label="已购资源订单">
        <li v-for="order in orders" :key="order.order_no" class="wb-item">
          <div class="wb-item__main">
            <div class="wb-item__title-row">
              <button
                type="button"
                class="wb-item__title purchases__title"
                @click="openResource(order)"
              >
                {{ order.resource_title || `资源 #${order.resource_id}` }}
              </button>
              <span v-if="isApiResourcePurchaseOrder(order)" class="purchases__tag">接口资源</span>
            </div>
            <span class="wb-item__meta">
              订单 {{ order.order_no }} · {{ resourcePurchaseStatusLabel(order.status) }} ·
              {{ formatPurchaseAmountLabel(order) }}
            </span>
            <span class="wb-item__meta">
              卖家 {{ order.seller }}
              <template v-if="order.first_downloaded_at"> · 已下载</template>
              <template v-else-if="order.status === 'paid'"> · 未下载</template>
              <template v-if="order.entitlement_revoked"> · 下载权已被退款收回</template>
            </span>
          </div>
          <div class="wb-item__side">
            <TButton
              v-if="canTransferPurchase(order)"
              variant="outline"
              @click="openTransfer(order)"
            >
              转移使用权
            </TButton>
            <TButton variant="outline" @click="openResource(order)">查看资源</TButton>
          </div>
        </li>
      </ul>

      <!-- 服务端分页：页码与每页条数直接写回 composable 持有的 ref，watcher 负责发请求。 -->
      <WorkbenchPager
        v-if="!(loading && !orders.length)"
        :page="page"
        :page-size="pageSize"
        :total="total"
        unit="条订单"
        page-size-aria-label="每页订单数"
        pagination-aria-label="已购订单分页"
        @update:page="page = $event"
        @update:page-size="pageSize = $event"
      />
    </section>
    <PurchaseTransferDialog
      v-model:open="transferOpen"
      :order="transferTarget"
      :token="auth.token"
      @submitted="reload"
    />
  </main>
</template>

<style scoped>
.purchases__title {
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

/* R034 接口资源订单标签：与普通已购订单共用同一列表，只补一个来源标记。 */
.purchases__tag {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--73-accent) 85%, transparent);
  background: color-mix(in srgb, var(--73-accent-soft) 92%, transparent);
  color: var(--73-accent);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
}

/* 与「我的发票」同一套单纸页版式：面板撑满内容区，分页器沉到纸底；
   内容超高时由工作台内容区滚动。 */
.my-purchases-page.page-shell {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--portal-header-footprint, 98px) - 24px);
}

.my-purchases-page .wallet-section {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}

.my-purchases-page .wallet-section :deep(.wb-pager) {
  margin-top: auto;
}

/* 状态名都不长，下拉收窄一点；宽度写成 flex 基宽而不是 width——TSelect 自带 width: 100%，
   flex-basis 会被 width 顶掉，细节见 portal-workbench.css 里 .wb-toolbar__field 的注释。 */
.wb-toolbar__field--purchases-status {
  flex: 0 0 140px;
}
</style>
