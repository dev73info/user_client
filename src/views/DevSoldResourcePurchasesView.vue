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
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRoute, useRouter } from 'vue-router'

import {
  listSellerResourcePurchases,
  sellerRefundResourcePurchase,
  type ResourcePurchaseOrder,
} from '@/api/resourcePurchase'
import { getResourceDetailSlug } from '@/api/resourceTags'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import {
  canSellerRefundPurchase,
  fenToYuanText,
  formatPurchaseAmountLabel,
  isPointsPurchaseOrder,
  parseYuanPriceInput,
  refundInitiatorLabel,
  resourcePurchaseStatusLabel,
} from '@/shared/resourceSale'

import {
  TButton,
  TCard,
  TDialog,
  TForm,
  TFormItem,
  TIcon,
  TInput,
  TInputNumber,
  TOption,
  TPagination,
  Refresh,
  Search,
  TSelect,
  TTable,
  TTableColumn,
  TTag,
} from 'ui_73info'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { showToast } = useToast()

/** 一次取回本页全部售出订单（后端单页上限 100 条），再按资源与筛选在前端收窄。 */
const SELLER_ORDER_FETCH_LIMIT = 100

const STATUS_FILTER_OPTIONS: { label: string; value: string }[] = [
  { label: '已支付', value: 'paid' },
  { label: '退款中', value: 'refunding' },
  { label: '已退款', value: 'refunded' },
  { label: '待支付', value: 'pending' },
  { label: '失败', value: 'failed' },
  { label: '已关闭', value: 'closed' },
]

const isLoading = ref(false)
const orders = ref<ResourcePurchaseOrder[]>([])

const filters = reactive({
  status: '',
  keyword: '',
})

/** 从资源「更多 → 售出订单」带入；无 resourceId 时回资源列表。 */
const resourceIdFilter = computed(() => {
  const raw = route.query.resourceId ?? route.query.resource_id
  const value = Array.isArray(raw) ? raw[0] : raw
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null
})

const scopedOrders = computed(() => {
  const resourceId = resourceIdFilter.value
  if (resourceId == null) {
    return []
  }
  return orders.value.filter((order) => order.resource_id === resourceId)
})

const paidCount = computed(() => scopedOrders.value.filter((item) => item.status === 'paid').length)
const refundableCount = computed(() =>
  scopedOrders.value.filter((item) => canSellerRefundPurchase(item)).length,
)
const refundedCount = computed(() =>
  scopedOrders.value.filter((item) => item.status === 'refunded').length,
)

const filteredOrders = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()
  return scopedOrders.value.filter((order) => {
    if (filters.status && order.status !== filters.status) {
      return false
    }
    if (!keyword) {
      return true
    }
    const haystack = [order.order_no, order.buyer, order.resource_title ?? '', order.refund_reason ?? '']
      .join(' ')
      .toLowerCase()
    return haystack.includes(keyword)
  })
})

const hasActiveFilters = computed(() => Boolean(filters.status || filters.keyword.trim()))

const { page, pageSize, total: filteredTotal, paged, resetPage } = useClientPagination(filteredOrders)

const emptyText = computed(() =>
  scopedOrders.value.length ? '没有符合筛选条件的售出订单' : '该资源还没有售出订单',
)

function ensureResourceScoped() {
  if (resourceIdFilter.value != null) {
    return true
  }
  void router.replace({ name: 'dev-resource-list' })
  return false
}

async function loadOrders() {
  if (!ensureResourceScoped()) {
    return
  }
  auth.hydrate()
  if (!auth.token.trim()) {
    return
  }
  isLoading.value = true
  try {
    orders.value = await listSellerResourcePurchases(auth.token, { limit: SELLER_ORDER_FETCH_LIMIT })
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载售出订单失败', 'error')
  } finally {
    isLoading.value = false
  }
}

/** 退款留痕里发起方为「卖家」或「平台」；只有已退过款的订单才有。 */
function refundTraceText(order: ResourcePurchaseOrder): string {
  if (order.refunded_amount_fen <= 0 && !order.last_refund_at) {
    return ''
  }
  const parts: string[] = []
  if (order.last_refund_at) {
    parts.push(`${order.last_refund_at} 由${refundInitiatorLabel(order.refund_initiator)}发起`)
  }
  if (order.refund_operator) {
    parts.push(`操作人 ${order.refund_operator}`)
  }
  if (order.refund_reason) {
    parts.push(`原因：${order.refund_reason}`)
  }
  return parts.join(' · ')
}

function openResource(order: ResourcePurchaseOrder) {
  void router.push({
    name: 'resource-detail-direct',
    params: {
      resourceSlug: getResourceDetailSlug(order.resource_id, order.seller || 'resource'),
    },
  })
}

// ---------------------------------------------------------------------------
// 退款弹窗
// ---------------------------------------------------------------------------

const refundTarget = ref<ResourcePurchaseOrder | null>(null)
const refundDialogVisible = ref(false)
const submittingRefund = ref(false)
const refundError = ref('')
/**
 * 弹窗内部的两步确认。
 *
 * 不用 `TMessageBox.confirm` 叠在 `TDialog` 上：两层浮层各自装聚焦陷阱，叠在一起会互相
 * 抢焦点、控制台刷 `RangeError: Maximum call stack size exceeded`（ui_73info 的已知问题）。
 * 改成本弹窗内的第二步，确认信息与风险提示都在同一层浮层里。
 */
const refundStep = ref<'form' | 'confirm'>('form')
const refundForm = reactive({
  /** 退款金额（元），缺省为可退全额 */
  amountYuan: 0,
  reason: '',
})

const refundAmountLimitYuan = computed(() =>
  refundTarget.value ? Number((refundTarget.value.refundable_amount_fen / 100).toFixed(2)) : 0,
)

/** 待提交的退款金额（分）；在进入确认步时定下来，确认页与提交用同一个数。 */
const pendingRefundAmountFen = ref(0)

const refundDialogTitle = computed(() =>
  refundStep.value === 'confirm' ? '确认发起退款' : '主动退款',
)

/** 待退金额是否等于剩余可退余额（全额）——决定确认步文案与成功提示。 */
const isFullRefundPending = computed(
  () => pendingRefundAmountFen.value >= (refundTarget.value?.refundable_amount_fen ?? 0),
)

function openRefundDialog(order: ResourcePurchaseOrder) {
  refundTarget.value = order
  refundForm.amountYuan = Number((order.refundable_amount_fen / 100).toFixed(2))
  refundForm.reason = ''
  refundError.value = ''
  refundStep.value = 'form'
  pendingRefundAmountFen.value = 0
  refundDialogVisible.value = true
}

function closeRefundDialog() {
  if (submittingRefund.value) {
    return
  }
  refundDialogVisible.value = false
  refundTarget.value = null
  refundStep.value = 'form'
}

/** 金额校验：> 0、不超过可退余额，最多两位小数。返回 null 表示不通过（已写 refundError）。 */
function resolveRefundAmountFen(): number | null {
  const parsed = parseYuanPriceInput(refundForm.amountYuan)
  if (!parsed.ok) {
    refundError.value = parsed.message
    return null
  }
  if (parsed.fen <= 0) {
    refundError.value = '退款金额必须大于 0'
    return null
  }
  if (parsed.fen > (refundTarget.value?.refundable_amount_fen ?? 0)) {
    refundError.value = `退款金额不能超过可退余额 ¥${fenToYuanText(refundTarget.value?.refundable_amount_fen ?? 0)}`
    return null
  }
  return parsed.fen
}

/** 第一步：校验金额与原因，通过后进入确认步（这一步还不调接口）。 */
function goToRefundConfirm() {
  if (!refundTarget.value) {
    return
  }
  refundError.value = ''

  const reason = refundForm.reason.trim()
  if (!reason) {
    refundError.value = '退款原因必填'
    return
  }
  if (reason.length > 200) {
    refundError.value = '退款原因不能超过 200 字'
    return
  }
  const amountFen = resolveRefundAmountFen()
  if (amountFen == null) {
    return
  }
  pendingRefundAmountFen.value = amountFen
  refundStep.value = 'confirm'
}

/** 第二步：确认后提交渠道。 */
async function submitRefund() {
  const order = refundTarget.value
  if (!order) {
    return
  }
  if (!auth.token.trim()) {
    return
  }
  refundError.value = ''

  const reason = refundForm.reason.trim()
  const amountFen = pendingRefundAmountFen.value
  if (!reason || amountFen <= 0) {
    refundStep.value = 'form'
    refundError.value = !reason ? '退款原因必填' : '退款金额必须大于 0'
    return
  }

  const isFullRefund = amountFen >= order.refundable_amount_fen

  submittingRefund.value = true
  try {
    const updated = await sellerRefundResourcePurchase(auth.token, order.order_no, {
      reason,
      amount_fen: amountFen,
    })
    orders.value = orders.value.map((item) => (item.order_no === updated.order_no ? updated : item))
    refundDialogVisible.value = false
    refundTarget.value = null
    refundStep.value = 'form'
    showToast(
      isFullRefund ? '已全额退款，买家下载权已收回' : '已完成部分退款，买家下载权已收回',
      'success',
    )
  } catch (error) {
    refundError.value = error instanceof Error ? error.message : '发起退款失败'
    refundStep.value = 'form'
    showToast(refundError.value, 'error')
  } finally {
    submittingRefund.value = false
  }
}

onMounted(() => {
  void loadOrders()
})

watch(resourceIdFilter, (next, prev) => {
  if (next === prev) {
    return
  }
  filters.status = ''
  filters.keyword = ''
  resetPage()
  void loadOrders()
})
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
          <TOption v-for="option in STATUS_FILTER_OPTIONS" :key="option.value" :label="option.label"
            :value="option.value" />
        </TSelect>

        <TInput v-model="filters.keyword" clearable placeholder="搜索订单号、买家或退款原因"
          class="dev-toolbar__search" @input="resetPage">
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

      <TTable :loading="isLoading" :data="paged" stripe class="dev-table sold-purchases__table"
        aria-label="售出订单列表">
        <template #empty>
          <p class="dev-empty-state">{{ emptyText }}</p>
        </template>
        <TTableColumn label="资源" min-width="200">
          <template #default="scope">
            <div class="sold-purchases__title-cell">
              <button type="button" class="sold-purchases__title-link" @click="openResource(scope.row)">
                {{ scope.row.resource_title || `资源 #${scope.row.resource_id}` }}
              </button>
              <div class="sold-purchases__meta">订单号 {{ scope.row.order_no }}</div>
            </div>
          </template>
        </TTableColumn>
        <TTableColumn label="买家" min-width="140">
          <template #default="scope">
            <span class="sold-purchases__buyer">{{ scope.row.buyer }}</span>
          </template>
        </TTableColumn>
        <TTableColumn label="金额" min-width="128">
          <template #default="scope">
            <div class="sold-purchases__amount-cell">
              <span class="sold-purchases__amount">{{ formatPurchaseAmountLabel(scope.row) }}</span>
              <span
                v-if="scope.row.refunded_amount_fen > 0"
                class="sold-purchases__refunded-chip"
              >
                已退 ¥{{ fenToYuanText(scope.row.refunded_amount_fen) }}
              </span>
            </div>
          </template>
        </TTableColumn>
        <TTableColumn label="状态" min-width="120">
          <template #default="scope">
            <TTag variant="outline" :tone="scope.row.status === 'refunded' ? 'warning' : 'accent'">
              {{ resourcePurchaseStatusLabel(scope.row.status) }}
            </TTag>
          </template>
        </TTableColumn>
        <TTableColumn label="可退余额" min-width="120">
          <template #default="scope">
            <span v-if="isPointsPurchaseOrder(scope.row)" class="sold-purchases__meta">积分单不支持退款</span>
            <span v-else class="sold-purchases__amount">
              ¥{{ fenToYuanText(scope.row.refundable_amount_fen) }}
            </span>
          </template>
        </TTableColumn>
        <TTableColumn label="支付时间" min-width="160">
          <template #default="scope">
            <span>{{ scope.row.paid_at || '—' }}</span>
            <div v-if="refundTraceText(scope.row)" class="sold-purchases__meta">
              {{ refundTraceText(scope.row) }}
            </div>
          </template>
        </TTableColumn>
        <TTableColumn label="操作" min-width="130" fixed="right">
          <template #default="scope">
            <TButton v-if="canSellerRefundPurchase(scope.row)" variant="outline" tone="accent"
              @click="openRefundDialog(scope.row)">
              主动退款
            </TButton>
            <span v-else class="sold-purchases__meta">
              {{ isPointsPurchaseOrder(scope.row) ? '不支持退款' : '不可退款' }}
            </span>
          </template>
        </TTableColumn>
      </TTable>

      <div class="dev-pager">
        <div class="dev-pager__count">
          <TSelect v-model="pageSize" aria-label="每页条数" class="dev-pager__size">
            <TOption v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
          </TSelect>
        </div>
        <TPagination v-model:current-page="page" :page-size="pageSize" :total="filteredTotal"
          :pager-count="5" background aria-label="售出订单分页" />
      </div>
    </TCard>

    <!-- 主动退款弹窗：第一步填金额与原因，第二步确认（说明退款后买家失去下载权、资金原路退回） -->
    <TDialog v-model:open="refundDialogVisible" :title="refundDialogTitle" width="560px" class="dev-dialog"
      @close="closeRefundDialog">
      <div v-if="refundTarget" class="sold-purchases__refund">
        <p class="sold-purchases__refund-summary">
          订单 {{ refundTarget.order_no }} · 买家 {{ refundTarget.buyer }} ·
          {{ formatPurchaseAmountLabel(refundTarget) }}
        </p>
        <p class="sold-purchases__refund-warning" role="note">
          退款后买家将失去该资源的下载权，资金按原支付通道原路退回，本操作不可撤销。
        </p>

        <TForm v-if="refundStep === 'form'" label-position="top">
          <TFormItem label="可退余额">
            <div class="sold-purchases__amount">
              ¥{{ fenToYuanText(refundTarget.refundable_amount_fen) }}
            </div>
          </TFormItem>
          <TFormItem label="退款金额（元）" required>
            <TInputNumber v-model="refundForm.amountYuan" :min="0.01" :max="refundAmountLimitYuan"
              :precision="2" :step="0.01" placeholder="退款金额" style="width: 100%" />
            <div class="sold-purchases__meta">
              默认全额 ¥{{ fenToYuanText(refundTarget.refundable_amount_fen) }}；改为更小的金额即部分退款，退款后订单仍为已支付但下载权已被收回。
            </div>
          </TFormItem>
          <TFormItem label="退款原因" required>
            <TInput v-model="refundForm.reason" type="textarea" :rows="3" :maxlength="200"
              placeholder="必填，例如：资源内容有误 / 买家协商一致 / 误标价" />
            <div class="sold-purchases__meta">{{ refundForm.reason.length }} / 200 字</div>
          </TFormItem>
        </TForm>

        <div v-else class="sold-purchases__confirm">
          <dl class="sold-purchases__confirm-list">
            <div>
              <dt>退款金额</dt>
              <dd class="sold-purchases__amount">¥{{ fenToYuanText(pendingRefundAmountFen) }}</dd>
            </div>
            <div>
              <dt>退款类型</dt>
              <dd>{{ isFullRefundPending ? '全额退款' : '部分退款' }}</dd>
            </div>
            <div>
              <dt>退款原因</dt>
              <dd>{{ refundForm.reason.trim() }}</dd>
            </div>
          </dl>
          <p class="sold-purchases__meta">
            {{
              isFullRefundPending
                ? '该笔退款后订单将变为「已退款」。'
                : `该笔退款后订单仍为「已支付」，剩余可退 ¥${fenToYuanText(
                    refundTarget.refundable_amount_fen - pendingRefundAmountFen,
                  )}，买家下载权即刻收回。`
            }}
          </p>
        </div>
      </div>

      <template #footer>
        <p v-if="refundError" class="sold-purchases__refund-error" role="alert">{{ refundError }}</p>
        <template v-if="refundStep === 'form'">
          <TButton :disabled="submittingRefund" @click="closeRefundDialog">取消</TButton>
          <TButton variant="solid" tone="accent" @click="goToRefundConfirm">确认退款</TButton>
        </template>
        <template v-else>
          <TButton :disabled="submittingRefund" @click="refundStep = 'form'">再想想</TButton>
          <TButton variant="solid" tone="accent" :loading="submittingRefund" @click="submitRefund">
            确认退款
          </TButton>
        </template>
      </template>
    </TDialog>
  </div>
</template>

<style scoped>
.sold-purchases__table {
  min-width: 0;
}

.sold-purchases__title-cell {
  min-width: 0;
}

.sold-purchases__title-link {
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.sold-purchases__title-link:hover {
  color: var(--73-accent, #1f4ad1);
}

.sold-purchases__meta {
  margin-top: 4px;
  color: var(--dev-ink-muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.sold-purchases__buyer,
.sold-purchases__amount {
  font-variant-numeric: tabular-nums;
}

.sold-purchases__amount-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}

.sold-purchases__amount {
  font-weight: 700;
  color: var(--dev-ink, #0f172a);
  line-height: 1.2;
}

.sold-purchases__refunded-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--73-warning-soft, rgba(217, 119, 6, 0.12));
  color: var(--73-warning, #b9812b);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  white-space: nowrap;
}

.sold-purchases__refund-summary {
  margin: 0 0 8px;
  font-weight: 600;
}

.sold-purchases__refund-warning {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--73-warning-soft, rgba(217, 119, 6, 0.12));
  color: var(--73-warning, #b9812b);
  font-size: 12px;
  line-height: 1.6;
}

.sold-purchases__refund-error {
  margin: 0 auto 0 0;
  color: var(--73-danger, #b42318);
  font-size: 12px;
  text-align: left;
}

.sold-purchases__confirm-list {
  margin: 0 0 12px;
}

.sold-purchases__confirm-list > div {
  display: flex;
  gap: 12px;
  padding: 6px 0;
}

.sold-purchases__confirm-list dt {
  flex: 0 0 72px;
  color: var(--dev-ink-muted, #64748b);
  font-size: 12px;
}

.sold-purchases__confirm-list dd {
  margin: 0;
  word-break: break-all;
}
</style>
