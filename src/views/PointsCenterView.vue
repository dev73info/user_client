<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import { Refresh, RefreshLeft, Search } from '@element-plus/icons-vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn.mjs'

import {
  getMyPoints,
  transferPoints,
  listMyTransfers,
  getTransferMeta,
  type UserPointsLog,
  type PointsTransfer,
  type PointsTransferMeta,
} from '@/api/points'
import { HttpError } from '@/api/http'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

/* 「我的背包 → 积分中心」：余额读数、积分打赏、打赏记录、积分明细。
   权益（佩戴与用户名颜色）已拆到「权益中心」、券包已拆到「优惠券中心」、评论警告已移到「系统通知」，
   这一页不再一屏铺四件事。 */

const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

const logs = ref<UserPointsLog[]>([])
const loading = ref(false)
const error = ref('')
/** 读数条用的余额：与日志分开存，日志只翻当前页、余额是全量口径。 */
const pointsBalance = ref(0)
const refreshing = ref(false)

// 打赏
const transferMeta = ref<PointsTransferMeta | null>(null)
const transferTo = ref('')
const transferAmount = ref<number | null>(null)
const transferNote = ref('')
const transferSaving = ref(false)
const transferLoading = ref(false)
const transfers = ref<PointsTransfer[]>([])

// 打赏记录的筛选：记录是一次全量取回（上限 50 条），所以筛选与分页都在前端做。
const transferKeyword = ref('')
const transferScope = ref<'all' | 'sent' | 'received'>('all')

const feeRate = computed(() => transferMeta.value?.fee_rate ?? 0)
const transferFee = computed(() => {
  const amount = transferAmount.value
  if (!amount || amount <= 0) return 0
  return Math.floor((amount * feeRate.value) / 100)
})
const transferReceived = computed(() => {
  const amount = transferAmount.value
  if (!amount || amount <= 0) return 0
  return amount - transferFee.value
})

const logPage = ref(1)
const logPageSize = ref(10)
const logTotal = ref(0)
const serverPagedLogs = ref(true)
const pagedLogs = computed(() => {
  if (serverPagedLogs.value) {
    return logs.value
  }

  const start = (logPage.value - 1) * logPageSize.value
  return logs.value.slice(start, start + logPageSize.value)
})

const transferScopes = computed(() => [
  { value: 'all' as const, label: '全部', count: transfers.value.length },
  {
    value: 'sent' as const,
    label: '我打赏的',
    count: transfers.value.filter((item) => item.from_username === auth.username).length,
  },
  {
    value: 'received' as const,
    label: '我收到的',
    count: transfers.value.filter((item) => item.to_username === auth.username).length,
  },
])

const filteredTransfers = computed(() => {
  const search = transferKeyword.value.trim().toLocaleLowerCase()
  return transfers.value.filter((item) => {
    const matchesScope =
      transferScope.value === 'all'
      || (transferScope.value === 'sent'
        ? item.from_username === auth.username
        : item.to_username === auth.username)
    const matchesSearch =
      !search
      || [item.from_username, item.to_username, item.note ?? ''].some((value) =>
        value.toLocaleLowerCase().includes(search),
      )
    return matchesScope && matchesSearch
  })
})

const transferFiltersActive = computed(
  () => transferKeyword.value.trim() !== '' || transferScope.value !== 'all',
)

const {
  page: transferPage,
  pageSize: transferPageSize,
  total: transferTotal,
  paged: pagedTransfers,
  resetPage: resetTransferPage,
} = useClientPagination(filteredTransfers)

// 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。
watch([transferKeyword, transferScope], resetTransferPage)

function resetTransferFilters() {
  transferKeyword.value = ''
  transferScope.value = 'all'
}

async function loadPoints(page = logPage.value, pageSize = logPageSize.value) {
  loading.value = true
  error.value = ''
  try {
    const data = await getMyPoints(auth.token, { page, page_size: pageSize })
    const responseHasPagination = data.logs_total != null
    const total = data.logs_total ?? data.logs.length
    const lastPage = Math.max(1, Math.ceil(total / pageSize))
    const normalizedPage = Math.min(Math.max(1, page), lastPage)

    if (normalizedPage !== page) {
      logPage.value = normalizedPage
      await loadPoints(normalizedPage, pageSize)
      return
    }

    logs.value = data.logs
    pointsBalance.value = data.points_balance
    logTotal.value = total
    logPage.value = data.logs_page ?? page
    logPageSize.value = data.logs_page_size ?? pageSize
    serverPagedLogs.value = responseHasPagination
  } catch (err) {
    error.value = err instanceof HttpError ? err.message : '加载积分失败'
  } finally {
    loading.value = false
  }
}

/** 读数条的刷新：余额与打赏记录各刷一次，日志有自己的分页与刷新口径。 */
async function refreshOverview() {
  refreshing.value = true
  try {
    await Promise.all([loadPoints(), loadTransfers()])
  } finally {
    refreshing.value = false
  }
}

function handleLogPageChange(page: number) {
  void loadPoints(page, logPageSize.value)
}

function handleLogPageSizeChange(pageSize: number) {
  logPage.value = 1
  logPageSize.value = pageSize
  void loadPoints(1, pageSize)
}

async function loadTransferMeta() {
  if (!auth.token) return
  try {
    transferMeta.value = await getTransferMeta(auth.token)
  } catch {
    // 忽略，使用默认展示
  }
}

async function loadTransfers() {
  if (!auth.token) return
  transferLoading.value = true
  try {
    transfers.value = await listMyTransfers(auth.token)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载打赏记录失败', 'error')
  } finally {
    transferLoading.value = false
  }
}

async function submitTransfer() {
  if (!auth.token || transferSaving.value) return
  const to = transferTo.value.trim()
  const amount = transferAmount.value
  if (!to) {
    showToast('请输入接收方用户名', 'warning')
    return
  }
  if (!amount || amount <= 0) {
    showToast('请输入打赏金额', 'warning')
    return
  }
  transferSaving.value = true
  try {
    await transferPoints(auth.token, {
      to_username: to,
      amount,
      note: transferNote.value.trim() || undefined,
    })
    showToast('打赏成功', 'success')
    transferTo.value = ''
    transferAmount.value = null
    transferNote.value = ''
    await Promise.all([loadPoints(), loadTransfers()])
  } catch (err) {
    showToast(err instanceof Error ? err.message : '打赏失败', 'error')
  } finally {
    transferSaving.value = false
  }
}

onMounted(async () => {
  auth.hydrate()
  if (!auth.isAuthed) {
    router.replace('/')
    return
  }
  await Promise.all([loadPoints(), loadTransferMeta(), loadTransfers()])
})
</script>

<template>
  <ElConfigProvider :locale="zhCn">
    <main class="page-shell custom-page-shell profile-page points-page" :aria-busy="loading">
      <!-- 顶部读数条：读数在最左，页面级刷新固定在右上角 -->
      <div class="wb-strip" aria-label="积分概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">积分余额</span>
          <span class="wb-strip__value">{{ loading ? '—' : pointsBalance }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">打赏记录</span>
          <span class="wb-strip__value">{{ transferLoading ? '—' : transfers.length }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">积分明细</span>
          <span class="wb-strip__value">{{ loading ? '—' : logTotal }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <el-button class="wb-toolbar__icon-btn" :loading="refreshing" aria-label="刷新积分数据"
            @click="refreshOverview">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>
      </div>

      <section class="wallet-section points-section points-section--transfer">
        <div class="wb-card-head">
          <div class="wb-card-head__title-block">
            <h3 class="wb-card-head__title">积分打赏</h3>
          </div>
        </div>
        <div class="transfer-form">
          <el-input v-model="transferTo" placeholder="接收方用户名" clearable aria-label="接收方用户名" />
          <el-input-number v-model="transferAmount" :min="1" :precision="0" placeholder="打赏金额"
            class="transfer-form__amount" />
          <el-input v-model="transferNote" placeholder="附言（可选）" clearable aria-label="打赏附言" />
          <p v-if="transferAmount && transferAmount > 0" class="transfer-preview">
            接收方到账 <strong>{{ transferReceived }}</strong> 积分 · 手续费 <strong>{{ transferFee }}</strong> 积分
          </p>
          <div class="transfer-form__submit">
            <el-button class="wb-toolbar__primary" :loading="transferSaving" @click="submitTransfer">打赏</el-button>
          </div>
        </div>
      </section>

      <section class="wallet-section points-section points-section--transfers">
        <div class="wb-card-head">
          <div class="wb-card-head__title-block">
            <h3 class="wb-card-head__title">打赏记录</h3>
          </div>
        </div>

        <div class="wb-toolbar">
          <div class="wb-chip-group" role="group" aria-label="打赏方向">
            <button v-for="scope in transferScopes" :key="scope.value" type="button"
              class="wb-chip wb-chip--button" :class="{ 'is-active': transferScope === scope.value }"
              :aria-pressed="transferScope === scope.value" @click="transferScope = scope.value">
              {{ scope.label }}<span class="wb-chip__count">{{ scope.count }}</span>
            </button>
          </div>
          <el-input v-model="transferKeyword" class="wb-toolbar__search" clearable placeholder="搜索用户名或附言"
            aria-label="搜索打赏记录">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <div class="wb-toolbar__actions">
            <span v-if="transferFiltersActive" class="wb-toolbar__hint">
              筛选出 {{ transferTotal }} / {{ transfers.length }} 条
            </span>
            <el-button v-if="transferFiltersActive" class="wb-toolbar__ghost" @click="resetTransferFilters">
              <el-icon><RefreshLeft /></el-icon><span>重置</span>
            </el-button>
          </div>
        </div>

        <p v-if="transferLoading" class="wb-empty" role="status">正在加载打赏记录…</p>
        <div v-else-if="!filteredTransfers.length" class="wb-empty" role="status">
          <span class="wb-empty__title">{{ transfers.length ? '没有符合条件的打赏记录' : '暂无打赏记录' }}</span>
        </div>
        <template v-else>
          <ul class="wb-list" aria-label="打赏记录">
            <li v-for="t in pagedTransfers" :key="t.id" class="wb-item">
              <div class="wb-item__main">
                <span class="wb-item__title">
                  {{ t.from_username === auth.username ? '我' : t.from_username }}
                  <span aria-hidden="true">→</span>
                  {{ t.to_username === auth.username ? '我' : t.to_username }}
                </span>
                <span class="wb-item__meta">
                  {{ t.created_at }}{{ t.fee > 0 ? ` · 手续费 ${t.fee}` : '' }}{{ t.note ? ` · ${t.note}` : '' }}
                </span>
              </div>
              <div class="wb-item__side">
                <span class="wb-badge" :class="{ 'wb-badge--success': t.to_username === auth.username }">
                  {{ t.to_username === auth.username ? '+' : '-' }}{{ t.to_username === auth.username ? t.received : t.amount }}
                </span>
              </div>
            </li>
          </ul>
          <div class="wb-pager">
            <div class="wb-pager__count">
              <span>共 {{ transferTotal }} 条记录</span>
              <el-select v-model="transferPageSize" class="wb-pager__size" aria-label="每页打赏记录数">
                <el-option v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
              </el-select>
            </div>
            <el-pagination v-model:current-page="transferPage" :page-size="transferPageSize"
              :total="transferTotal" :pager-count="5" layout="prev, pager, next" background
              aria-label="打赏记录分页" />
          </div>
        </template>
      </section>

      <section class="wallet-section points-section points-section--logs">
        <div class="wb-card-head">
          <div class="wb-card-head__title-block">
            <h3 class="wb-card-head__title">积分明细</h3>
          </div>
        </div>

        <p v-if="loading" class="wb-empty" role="status">正在加载积分明细…</p>
        <div v-else-if="error" class="wb-empty" role="alert">
          <span class="wb-empty__title">加载积分明细失败</span>{{ error }}
          <div class="wb-empty__actions">
            <el-button class="wb-toolbar__ghost" @click="loadPoints()">
              <el-icon><Refresh /></el-icon><span>重新加载</span>
            </el-button>
          </div>
        </div>
        <p v-else-if="!logs.length" class="wb-empty" role="status">
          <span class="wb-empty__title">暂无积分明细</span>
        </p>
        <template v-else>
          <ul class="wb-list" aria-label="积分明细">
            <li v-for="row in pagedLogs" :key="row.id" class="wb-item">
              <div class="wb-item__main">
                <span class="wb-item__title">{{ row.reason || '积分变动' }}</span>
                <span class="wb-item__meta">{{ row.created_at }} · 变动后余额 {{ row.balance_after }}</span>
              </div>
              <div class="wb-item__side">
                <span class="wb-badge" :class="row.delta > 0 ? 'wb-badge--success' : 'wb-badge--danger'">
                  {{ row.delta > 0 ? '+' : '' }}{{ row.delta }}
                </span>
              </div>
            </li>
          </ul>
          <div class="wb-pager">
            <div class="wb-pager__count">
              <span>共 {{ logTotal }} 条明细</span>
              <el-select :model-value="logPageSize" class="wb-pager__size" aria-label="每页明细数"
                @change="handleLogPageSizeChange">
                <el-option v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
              </el-select>
            </div>
            <el-pagination :current-page="logPage" :page-size="logPageSize" :total="logTotal"
              :pager-count="5" layout="prev, pager, next" background aria-label="积分明细分页"
              @current-change="handleLogPageChange" />
          </div>
        </template>
      </section>
    </main>
  </ElConfigProvider>
</template>

<style scoped>
/* 版式走统一层（.wb-strip / .wb-card-head / .wb-toolbar / .wb-list / .wb-pager / .wb-empty / .wb-badge），
   本页只留「打赏表单」这一块统一层没有提供的布局。
   原「我的背包」页把积分、权益、券包、评论警告四件事铺在一屏，拆页后各页只留自己那几块。 */

.points-page {
  align-content: start;
}

/* === 打赏表单 === */
.transfer-form {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(140px, 0.6fr);
  gap: 12px;
  align-items: start;
}

/* 表单项与工具栏控件同高同圆角：统一层的控件规格只作用于 .wb-toolbar 与 .wb-pager，
   这里的表单不在那些容器里，否则会出现「工具栏 36px 的输入框」与「表单 32px 的输入框」两种高度。 */
.transfer-form :deep(.el-input__wrapper),
.transfer-form :deep(.el-input-number),
.transfer-form :deep(.el-select__wrapper) {
  min-height: var(--wb-control-height);
  height: var(--wb-control-height);
  border-radius: var(--wb-radius-control);
}

.transfer-form__amount :deep(.el-input__wrapper) {
  width: 100%;
}

.transfer-form > .el-input:first-child,
.transfer-form > .transfer-preview,
.transfer-form > .transfer-form__submit {
  grid-column: 1 / -1;
}

.transfer-form > .transfer-form__submit {
  display: flex;
  justify-content: flex-end;
}

.transfer-preview {
  margin: 0;
  padding: 12px 14px;
  border: 1px dashed var(--wb-accent-line);
  border-radius: var(--wb-radius-item);
  background: var(--wb-accent-soft);
  color: var(--wb-ink-soft);
  font-size: 13px;
}

.transfer-preview strong {
  color: var(--wb-accent);
  font-variant-numeric: tabular-nums;
}

/* 明细里「原因 + 时间」两行贴紧：统一层的 __meta 行距按普通行给，这里行数多、收紧一点 */
.points-section--logs .wb-item__main {
  gap: 2px;
}

@media (max-width: 900px) {
  .transfer-form {
    grid-template-columns: 1fr;
  }

  .transfer-form > .el-input-number,
  .transfer-form > .el-input:nth-child(3) {
    grid-column: 1;
  }
}
</style>
