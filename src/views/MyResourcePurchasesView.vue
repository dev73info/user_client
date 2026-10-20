<script setup lang="ts">
/**
 * 「我的已购资源」：搜索 + 状态筛选 + 列表 + 分页。
 *
 * 筛选与分页全部走服务端（`/api/resources/purchases/mine` 的 `status` / `keyword` /
 * `limit` / `offset`，总数在响应头 `X-Total-Count`），前端只负责控件与展示——
 * 订单多起来之后不再一次性把全部订单平铺出来。
 * 页面形态对齐「我的需求」（`MyRequirementsView.vue`）的工具栏 + 列表 + 分页器。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRouter } from 'vue-router'

import {
  countMyResourcePurchases,
  listMyResourcePurchasesPage,
  type ResourcePurchaseOrder,
} from '@/api/resourcePurchase'
import { initiatePurchaseTransfer } from '@/api/resourcePurchaseTransfers'
import { getResourceDetailSlug } from '@/api/resourceTags'
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import {
  fenToYuanText,
  formatPurchaseAmountLabel,
  isApiResourcePurchaseOrder,
  resourcePurchaseStatusLabel,
} from '@/shared/resourceSale'

import {
  Refresh,
  RefreshLeft,
  Search,
  TButton,
  TDialog,
  TIcon,
  TInput,
  TMessage,
  TOption,
  TPagination,
  TSelect,
} from 'ui_73info'

const router = useRouter()
const auth = useAuthStore()

/** 状态筛选项：取值与文案一律沿用既有状态口径（`resourcePurchaseStatusLabel`），不自创状态名。 */
const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: resourcePurchaseStatusLabel('pending') },
  { value: 'paid', label: resourcePurchaseStatusLabel('paid') },
  { value: 'refunding', label: resourcePurchaseStatusLabel('refunding') },
  { value: 'refunded', label: resourcePurchaseStatusLabel('refunded') },
  { value: 'closed', label: resourcePurchaseStatusLabel('closed') },
  { value: 'failed', label: resourcePurchaseStatusLabel('failed') },
]

/** 搜索输入防抖时长：够短不至于觉得迟钝，够长不至于每敲一个字打一次接口。 */
const SEARCH_DEBOUNCE_MS = 300

const loading = ref(false)
const statsLoading = ref(false)
const orders = ref<ResourcePurchaseOrder[]>([])
/** 当前筛选条件下的订单总数（来自响应头 X-Total-Count），分页器据此渲染页码 */
const total = ref(0)
const page = ref(1)
const pageSize = ref(DEFAULT_LIST_PAGE_SIZE)
const statusFilter = ref('all')
const keyword = ref('')

/** 页头读数条：分状态总数（同样取服务端 X-Total-Count，不受当前筛选影响） */
const stats = ref({ all: 0, paid: 0, refunding: 0, refunded: 0 })

const hasActiveFilters = computed(
  () => keyword.value.trim() !== '' || statusFilter.value !== 'all',
)

function stripValue(count: number) {
  return statsLoading.value ? '—' : String(count)
}

async function loadOrders() {
  auth.hydrate()
  if (!auth.token.trim()) {
    return
  }
  const seq = ++loadSeq
  loading.value = true
  try {
    const result = await listMyResourcePurchasesPage(auth.token, {
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      keyword: keyword.value.trim() || undefined,
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value,
    })
    if (seq !== loadSeq) {
      // 期间又发了新请求，这次的结果已经过期
      return
    }
    orders.value = result.items
    total.value = result.total
  } catch (error) {
    if (seq !== loadSeq) {
      return
    }
    TMessage.error(error instanceof Error ? error.message : '加载已购资源失败')
  } finally {
    if (seq === loadSeq) {
      loading.value = false
    }
  }
}

/** 读数条的分状态统计：每个状态取一次总数（`limit=1`，只要响应头里的 total）。 */
async function loadStats() {
  auth.hydrate()
  if (!auth.token.trim()) {
    return
  }
  statsLoading.value = true
  try {
    const [all, paid, refunding, refunded] = await Promise.all([
      countMyResourcePurchases(auth.token),
      countMyResourcePurchases(auth.token, { status: 'paid' }),
      countMyResourcePurchases(auth.token, { status: 'refunding' }),
      countMyResourcePurchases(auth.token, { status: 'refunded' }),
    ])
    stats.value = { all, paid, refunding, refunded }
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '加载已购资源统计失败')
  } finally {
    statsLoading.value = false
  }
}

function reload() {
  void Promise.all([loadOrders(), loadStats()])
}

/* R042 使用权转移：只有接口资源且已支付的订单可以发起。 */
const transferOpen = ref(false)
const transferOrder = ref<ResourcePurchaseOrder | null>(null)
const transferUsername = ref('')
const transferMessage = ref('')
const transferSaving = ref(false)

function canTransfer(order: ResourcePurchaseOrder): boolean {
  return isApiResourcePurchaseOrder(order) && order.status === 'paid'
}

function openTransfer(order: ResourcePurchaseOrder) {
  transferOrder.value = order
  transferUsername.value = ''
  transferMessage.value = ''
  transferOpen.value = true
}

async function submitTransfer() {
  const order = transferOrder.value
  if (!order || transferSaving.value) {
    return
  }
  const toUsername = transferUsername.value.trim()
  if (!toUsername) {
    TMessage.warning('请填写接收方用户名')
    return
  }
  transferSaving.value = true
  try {
    await initiatePurchaseTransfer(auth.token, order.order_no, {
      to_username: toUsername,
      message: transferMessage.value.trim() || undefined,
    })
    transferOpen.value = false
    TMessage.success('转移申请已发送，等待对方确认')
    router.push({ name: 'workbench-purchase-transfers' })
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '发起使用权转移失败')
  } finally {
    transferSaving.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
/** 同一次交互里可能同时触发多个 watcher；用 nextTick 合并成一次请求。 */
let loadQueued = false
/** 请求序号：响应回来时若已不是最新一次，就丢弃，避免慢响应覆盖新结果。 */
let loadSeq = 0

function queueLoad() {
  if (loadQueued) {
    return
  }
  loadQueued = true
  void nextTick(() => {
    loadQueued = false
    void loadOrders()
  })
}

/* 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。 */
watch(statusFilter, () => {
  page.value = 1
  queueLoad()
})

watch(pageSize, () => {
  page.value = 1
  queueLoad()
})

watch(page, queueLoad)

/* 关键词防抖：输入停止后再请求，避免逐字打接口。 */
watch(keyword, () => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(() => {
    searchTimer = null
    page.value = 1
    queueLoad()
  }, SEARCH_DEBOUNCE_MS)
})

function resetFilters() {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  keyword.value = ''
  statusFilter.value = 'all'
  page.value = 1
  queueLoad()
}

function openResource(order: ResourcePurchaseOrder) {
  void router.push({
    name: 'resource-detail-direct',
    params: {
      resourceSlug: getResourceDetailSlug(order.resource_id, order.seller || 'resource'),
    },
  })
}

onMounted(() => {
  reload()
})

onBeforeUnmount(() => {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
})
</script>

<template>
  <main class="page-shell custom-page-shell profile-page" :aria-busy="loading">
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="已购资源概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">订单数</span>
          <span class="wb-strip__value">{{ stripValue(stats.all) }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">有效已购</span>
          <span class="wb-strip__value">{{ stripValue(stats.paid) }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">退款中</span>
          <span class="wb-strip__value">{{ stripValue(stats.refunding) }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">已退款</span>
          <span class="wb-strip__value">{{ stripValue(stats.refunded) }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton icon-only :loading="loading || statsLoading" aria-label="刷新已购列表" @click="reload">
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">我的已购资源</h3>
        </div>
        <div class="wb-card-head__actions">
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
          <template #prefix><TIcon><Search /></TIcon></template>
        </TInput>
        <div class="wb-toolbar__actions">
          <span v-if="hasActiveFilters" class="wb-toolbar__hint">
            筛选出 {{ total }} / {{ stats.all }} 条
          </span>
          <TButton v-if="hasActiveFilters" variant="outline" @click="resetFilters">
            <TIcon><RefreshLeft /></TIcon><span>重置</span>
          </TButton>
        </div>
      </div>

      <p v-if="loading && !orders.length" class="wb-empty" role="status">正在加载已购资源…</p>
      <div v-else-if="!orders.length" class="wb-empty" role="status">
        <span class="wb-empty__title">
          {{ hasActiveFilters ? '没有符合条件的订单' : '还没有购买记录' }}
        </span>
        <template v-if="hasActiveFilters">
          <div class="wb-empty__actions">
            <TButton variant="outline" @click="resetFilters">
              <TIcon><RefreshLeft /></TIcon><span>清除筛选</span>
            </TButton>
          </div>
        </template>
        <template v-else>
          在资源详情页购买付费资源后，订单会出现在这里。退款由卖家或平台发起，如需退款请联系卖家或客服。
        </template>
      </div>
      <template v-else>
        <ul class="wb-list" aria-label="已购资源订单">
          <li v-for="order in orders" :key="order.order_no" class="wb-item">
            <div class="wb-item__main">
              <div class="wb-item__title-row">
                <button type="button" class="wb-item__title purchases__title" @click="openResource(order)">
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
              <!-- R029 推广分成：只在真有分成时补一行金额；买家侧不显示推广者是谁、也不显示未归因原因 -->
              <span v-if="order.promoter_fee_fen > 0" class="wb-item__meta">
                含推广分成 ¥{{ fenToYuanText(order.promoter_fee_fen) }}
              </span>
            </div>
            <div class="wb-item__actions">
              <TButton variant="outline" @click="openResource(order)">查看资源</TButton>
              <TButton
                v-if="canTransfer(order)"
                variant="outline"
                @click="openTransfer(order)"
              >
                转移使用权
              </TButton>
            </div>
          </li>
        </ul>

        <div class="wb-pager">
          <div class="wb-pager__count">
            <TSelect v-model="pageSize" class="wb-pager__size" aria-label="每页订单数">
              <TOption v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
            </TSelect>
          </div>
          <TPagination
            v-model:current-page="page"
            :page-size="pageSize"
            :total="total"
            :pager-count="5"
            background
            aria-label="已购订单分页"
          />
        </div>
      </template>
    </section>

    <TDialog v-model:open="transferOpen" title="转移使用权" width="480px">
      <div class="purchases-transfer">
        <p class="purchases-transfer__lead">
          {{ transferOrder?.resource_title || `资源 #${transferOrder?.resource_id ?? ''}` }}
        </p>
        <label class="purchases-transfer__field">
          <span>接收方用户名</span>
          <TInput v-model="transferUsername" placeholder="对方平台用户名" />
        </label>
        <label class="purchases-transfer__field">
          <span>留言（可选）</span>
          <TInput v-model="transferMessage" placeholder="给对方说明转移原因" />
        </label>
        <p class="purchases-transfer__hint">
          对方确认后，这笔订单会记到对方账号下；历史支付与回调不受影响。
        </p>
        <div class="purchases-transfer__actions">
          <TButton variant="outline" :disabled="transferSaving" @click="transferOpen = false">
            取消
          </TButton>
          <TButton :loading="transferSaving" @click="submitTransfer">发送申请</TButton>
        </div>
      </div>
    </TDialog>
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

.wb-item__title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

/* R034 接口资源订单标签：与普通已购订单共用同一列表，只补一个来源标记。 */
.purchases__tag {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(147, 197, 253, 0.85);
  background: rgba(239, 246, 255, 0.92);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
}

.wb-item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

/* 状态名都不长，下拉收窄一点；宽度写成 flex 基宽而不是 width——TSelect 自带 width: 100%，
   flex-basis 会被 width 顶掉，细节见 portal-workbench.css 里 .wb-toolbar__field 的注释。 */
.wb-toolbar__field--purchases-status {
  flex: 0 0 140px;
}

.purchases-transfer {
  display: grid;
  gap: 14px;
}

.purchases-transfer__lead {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.purchases-transfer__field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: #475569;
}

.purchases-transfer__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
}

.purchases-transfer__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
