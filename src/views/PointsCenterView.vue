<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRouter } from 'vue-router'
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
import { useAuthStore } from '@/stores/auth'


import {
  TButton,
  TDialog,
  TIcon,
  TInput,
  TInputNumber,
  TMessage,
  TOption,
  TPagination,
  TSelect,
  type SelectModelValue,
  Promotion,
  Refresh,
  RefreshLeft,
  Search,
} from 'ui_73info'

/* 「我的背包 → 积分中心」：余额读数、积分记录（打赏记录 / 积分明细两段切换）、积分打赏弹窗。
   权益（佩戴与用户名颜色）已拆到「权益中心」、券包已拆到「优惠券中心」、评论警告已移到「系统通知」，
   这一页不再一屏铺四件事。 */

const router = useRouter()
const auth = useAuthStore()

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
/** 打赏表单收在弹窗里：入口是「积分记录」卡头右侧那颗主按钮。 */
const transferDialogVisible = ref(false)

// 打赏记录的筛选：记录是一次全量取回（上限 50 条），所以筛选与分页都在前端做。
const transferKeyword = ref('')
const transferScope = ref<'all' | 'sent' | 'received'>('all')

/** 记录区两段：打赏记录与积分明细。与开发者钱包、需求大厅的筛选一样用统一层的胶囊按钮，不用 el-tabs。 */
const RECORD_TABS: ReadonlyArray<{ key: 'transfers' | 'logs'; label: string }> = [
  { key: 'transfers', label: '打赏记录' },
  { key: 'logs', label: '积分明细' },
]
const activeRecordTab = ref<'transfers' | 'logs'>('transfers')

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

/* `TSelect` 的 `change` 是宽联合（单选一个值、多选一个数组），这里只需单值，
   所以收紧一次再写回。下面几处 `@change` 同理。 */
function handleLogPageSizeChange(value: SelectModelValue) {
  const pageSize = Number(value)
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
    TMessage.error(err instanceof Error ? err.message : '加载打赏记录失败')
  } finally {
    transferLoading.value = false
  }
}

async function submitTransfer() {
  if (!auth.token || transferSaving.value) return
  const to = transferTo.value.trim()
  const amount = transferAmount.value
  if (!to) {
    TMessage.warning('请输入接收方用户名')
    return
  }
  if (!amount || amount <= 0) {
    TMessage.warning('请输入打赏金额')
    return
  }
  transferSaving.value = true
  try {
    await transferPoints(auth.token, {
      to_username: to,
      amount,
      note: transferNote.value.trim() || undefined,
    })
    TMessage.success('打赏成功')
    transferDialogVisible.value = false
    resetTransferForm()
    // 打完赏最想看到的是刚发生的那条，直接切到打赏记录那一段
    activeRecordTab.value = 'transfers'
    await Promise.all([loadPoints(), loadTransfers()])
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '打赏失败')
  } finally {
    transferSaving.value = false
  }
}

/** 关闭弹窗即清空：下次打开是一张干净的表单，不会带上一次没提交完的接收方与金额。 */
function resetTransferForm() {
  transferTo.value = ''
  transferAmount.value = null
  transferNote.value = ''
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
  <main class="page-shell custom-page-shell profile-page points-page" :aria-busy="loading">
      <!-- 顶部读数条：读数在最左，页面级刷新固定在右上角 -->
      <WorkbenchBarSlot>
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
            <TButton icon-only :loading="refreshing" aria-label="刷新积分数据"
              @click="refreshOverview">
              <TIcon><Refresh /></TIcon>
            </TButton>
          </div>
        </div>
      </WorkbenchBarSlot>

      <!-- 打赏表单不再常驻占一屏：入口在「积分记录」卡头右侧，表单收进弹窗（见文件末尾）。
           这一页因此只留读数条与记录卡片两块。 -->
      <section class="wallet-section">
        <div class="wb-card-head">
          <div class="wb-card-head__title-block">
            <h3 class="wb-card-head__title">积分记录</h3>
          </div>
          <div class="wb-card-head__actions">
            <TButton variant="solid" tone="accent" @click="transferDialogVisible = true">
              <TIcon><Promotion /></TIcon><span>积分打赏</span>
            </TButton>
          </div>
        </div>

        <!-- 打赏记录与积分明细是同一份数据的两个视角（一笔打赏两边各记一次），
             合成一张卡片用胶囊切换，省掉一个卡头与一层留白。
             两段各有自己的筛选与分页，切 tab 只切显示、不重新请求。 -->
        <div class="wb-toolbar">
          <div class="wb-chip-group" role="tablist" aria-label="积分记录切换">
            <button v-for="tab in RECORD_TABS" :id="`points-records-tab-${tab.key}`" :key="tab.key" type="button"
              class="wb-chip wb-chip--button" role="tab" :aria-selected="activeRecordTab === tab.key"
              :aria-controls="`points-records-panel-${tab.key}`" :class="{ 'is-active': activeRecordTab === tab.key }"
              @click="activeRecordTab = tab.key">
              {{ tab.label }}
            </button>
          </div>

          <!-- 打赏段的二级筛选：方向、搜索、重置。积分明细没有筛选项，切到它时这一组整块不渲染 -->
          <template v-if="activeRecordTab === 'transfers'">
            <div class="wb-chip-group points-records__scopes" role="group" aria-label="打赏方向">
              <button v-for="scope in transferScopes" :key="scope.value" type="button"
                class="wb-chip wb-chip--button" :class="{ 'is-active': transferScope === scope.value }"
                :aria-pressed="transferScope === scope.value" @click="transferScope = scope.value">
                {{ scope.label }}<span class="wb-chip__count">{{ scope.count }}</span>
              </button>
            </div>
            <TInput v-model="transferKeyword" class="wb-toolbar__search" clearable placeholder="搜索用户名或附言"
              aria-label="搜索打赏记录">
              <template #prefix><TIcon><Search /></TIcon></template>
            </TInput>
            <div class="wb-toolbar__actions">
              <span v-if="transferFiltersActive" class="wb-toolbar__hint">
                筛选出 {{ transferTotal }} / {{ transfers.length }} 条
              </span>
              <TButton variant="outline" v-if="transferFiltersActive" @click="resetTransferFilters">
                <TIcon><RefreshLeft /></TIcon><span>重置</span>
              </TButton>
            </div>
          </template>
        </div>

        <div :id="`points-records-panel-${activeRecordTab}`"
          class="points-records__panel" :class="`points-records__panel--${activeRecordTab}`" role="tabpanel"
          :aria-labelledby="`points-records-tab-${activeRecordTab}`">
          <template v-if="activeRecordTab === 'transfers'">
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
                  <TSelect v-model="transferPageSize" class="wb-pager__size" aria-label="每页打赏记录数">
                    <TOption v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
                  </TSelect>
                </div>
                <TPagination v-model:current-page="transferPage" :page-size="transferPageSize"
                  :total="transferTotal" :pager-count="5" background
                  aria-label="打赏记录分页" />
              </div>
            </template>
          </template>

          <template v-else>
            <p v-if="loading" class="wb-empty" role="status">正在加载积分明细…</p>
            <div v-else-if="error" class="wb-empty" role="alert">
              <span class="wb-empty__title">加载积分明细失败</span>{{ error }}
              <div class="wb-empty__actions">
                <TButton variant="outline" @click="loadPoints()">
                  <TIcon><Refresh /></TIcon><span>重新加载</span>
                </TButton>
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
                  <TSelect :model-value="logPageSize" class="wb-pager__size" aria-label="每页明细数"
                    @change="handleLogPageSizeChange">
                    <TOption v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
                  </TSelect>
                </div>
                <TPagination :current-page="logPage" :page-size="logPageSize" :total="logTotal"
                  :pager-count="5" background aria-label="积分明细分页"
                  @current-change="handleLogPageChange" />
              </div>
            </template>
          </template>
        </div>
      </section>

      <!-- 打赏弹窗会被 TDialog teleport 到 body，落在 .profile-page 之外，
           必须自己挂统一层的 wb-dialog，否则弹窗里的主色退回库的默认档。 -->
      <TDialog v-model:open="transferDialogVisible" title="积分打赏" width="520px"
        class="wb-dialog points-transfer-dialog" @closed="resetTransferForm">
        <div class="transfer-form">
          <TInput v-model="transferTo" placeholder="接收方用户名" clearable aria-label="接收方用户名" />
          <TInputNumber v-model="transferAmount" :min="1" :precision="0" placeholder="打赏金额"
            class="transfer-form__amount" aria-label="打赏金额" />
          <TInput v-model="transferNote" placeholder="附言（可选）" clearable aria-label="打赏附言" />
          <p v-if="transferAmount && transferAmount > 0" class="transfer-preview">
            接收方到账 <strong>{{ transferReceived }}</strong> 积分 · 手续费 <strong>{{ transferFee }}</strong> 积分
          </p>
        </div>

        <template #footer>
          <TButton variant="solid" tone="accent" :loading="transferSaving" @click="submitTransfer">打赏</TButton>
        </template>
      </TDialog>
    </main>
</template>

<style scoped>
/* 版式走统一层（.wb-strip / .wb-card-head / .wb-toolbar / .wb-chip / .wb-list / .wb-pager / .wb-empty / .wb-badge），
   本页只留「打赏弹窗里的表单」与「记录区两段筛选」这两块统一层没有提供的布局。
   原「我的背包」页把积分、权益、券包、评论警告四件事铺在一屏，拆页后各页只留自己那几块。
   页面根节点的纵向节奏与行内对齐由工作台外壳给（.user-workbench__content 的 .page-shell）。 */

/* 表单搬进 520px 宽的弹窗后，两列栅格按弹窗内的可用宽度写：
   第一行接收方占满，第二行金额与附言各半。 */
.transfer-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

.transfer-form > .transfer-preview {
  grid-column: 1 / -1;
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

/* 明细里「原因 + 时间」两行贴紧：统一层的 __meta 行距按普通行给，这里行数多、收紧一点。
   打赏段的行保持统一层默认间距，它只有两行且标题里带箭头，再压就看不清是两段了。 */
.points-records__panel--logs .wb-item__main {
  gap: 2px;
}

/* 二级筛选（打赏方向）与上方的 tab 胶囊用一条竖线分开：两组胶囊挨在一起时，
   容易误读成同一级的四个选项。窄屏两组各自折行，竖线就失去意义，直接去掉。 */
.points-records__scopes {
  padding-left: 12px;
  border-left: 1px solid var(--wb-line);
}

@media (max-width: 640px) {
  /* 弹窗在 640px 以下被 dev-responsive.css 收成 92vw，两列会挤成两个窄条，改单列 */
  .transfer-form {
    grid-template-columns: 1fr;
  }

  /* 卡头在窄屏改纵向，统一层的 __actions 给的是 space-between；
     这里只有一个入口按钮，会因此贴到左边，与「入口靠右」的定位不符 */
  .points-page .wb-card-head__actions {
    justify-content: flex-end;
  }

  .points-records__scopes {
    padding-left: 0;
    border-left: 0;
  }
}
</style>
