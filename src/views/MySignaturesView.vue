<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { listMyContracts, type MyContractSummary } from '@/api/contracts'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import { CONTRACT_STATUS, contractStatusLabel } from '@/shared/contracts'
import { getSignatureState, signatureStateLabels, type SignatureState } from '@/utils/contractSignatures'


import {
  TButton,
  TIcon,
  TInput,
  TOption,
  TPagination,
  TSelect,
  Refresh,
  RefreshLeft,
  Search,
} from 'ui_73info'

const auth = useAuthStore()
const router = useRouter()
const contracts = ref<MyContractSummary[]>([])
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const selectedState = ref<'all' | SignatureState>('all')
let requestId = 0

/* 状态筛选用胶囊组（统一层 .wb-chip）：选项少、要能一眼看出当前选中项，选中项还要报出条数。
   筛的是**签名态**（我方要不要签），不是合同状态码：整数状态里没有对应语义，
   过期 / 拒签 / 撤销 这类合同只在「全部」里出现，列表徽标按合同状态显示。
   作废是终态，走中性档 wb-chip--muted，不跟其余状态抢强调色。 */
const states: { value: 'all' | SignatureState; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待我签署' },
  { value: 'waiting', label: '等待他方' },
  { value: 'signed', label: '已完成' },
  { value: 'void', label: '已作废' },
]

function countOf(state: SignatureState) {
  return contracts.value.filter((item) => getSignatureState(item, auth.username) === state).length
}

const summaries = computed(() => states.map((state) => ({
  ...state,
  count: state.value === 'all' ? contracts.value.length : countOf(state.value),
})))

/* 读数在加载中与失败时不报数：contracts 在重新加载时会被清空，
   直接显示 0 会被读成「一份合同都没有」。 */
function stripValue(count: number) {
  return loading.value || error.value ? '—' : String(count)
}

const filteredContracts = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase()
  return contracts.value.filter((item) => {
    const matchesState = selectedState.value === 'all' || getSignatureState(item, auth.username) === selectedState.value
    const matchesSearch = !search || [item.title, item.contract_no, item.requirement_id,
      item.party_a_name, item.party_b_name].some((value) => value?.toLocaleLowerCase().includes(search))
    return matchesState && matchesSearch
  })
})

const hasActiveFilters = computed(() => keyword.value.trim() !== '' || selectedState.value !== 'all')

/* 一次取回全部合同、筛选在前端做，所以这里用客户端分页（与其余菜单页同一套页码与每页条数口径）。 */
const {
  page,
  pageSize,
  total: filteredTotal,
  paged: pagedContracts,
  resetPage,
} = useClientPagination(filteredContracts)

/* 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。 */
watch([keyword, selectedState], resetPage)
watch(() => auth.token, () => { void loadContracts() }, { immediate: true })

function resetFilters() {
  keyword.value = ''
  selectedState.value = 'all'
}

async function loadContracts() {
  const currentRequest = ++requestId
  const token = auth.token
  contracts.value = []
  error.value = ''
  resetPage()
  loading.value = Boolean(token)
  if (!token) return
  try {
    const result = await listMyContracts(token)
    if (currentRequest === requestId && auth.token === token) contracts.value = result
  } catch (cause) {
    if (currentRequest === requestId && auth.token === token) {
      error.value = cause instanceof Error ? cause.message : '加载签署记录失败'
    }
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

function roleLabel(item: MyContractSummary) {
  return item.party_a_username === auth.username ? '甲方' : '乙方'
}

function stateOf(item: MyContractSummary) {
  return getSignatureState(item, auth.username)
}

/* 列表徽标：签名态认不出「过期 / 拒签 / 撤销」这几种新增状态（都会落到 unavailable），
   这时直接显示合同状态，免得一律写成「暂不可签署」。 */
function badgeLabel(item: MyContractSummary) {
  const state = stateOf(item)
  if (state === 'unavailable' && item.status !== CONTRACT_STATUS.awaiting) {
    return contractStatusLabel(item.status)
  }
  return signatureStateLabels[state]
}

/* 状态标签走统一层（.wb-badge）：浅底 + 深字，终止态用中性档。 */
function badgeClass(item: MyContractSummary) {
  const state = stateOf(item)
  if (state === 'pending') return 'wb-badge--warning'
  if (state === 'waiting') return 'wb-badge--accent'
  if (state === 'signed') return 'wb-badge--success'
  return ''
}

function detailLocation(item: MyContractSummary) {
  return { name: 'workbench-signature-detail', params: { contractId: item.id } }
}

function openDetail(item: MyContractSummary) {
  void router.push(detailLocation(item))
}
</script>

<template>
  <main class="page-shell custom-page-shell profile-page signatures" :aria-busy="loading">
    <!-- 顶部读数条：读数在最左，页面级刷新固定在右上角 -->
    <div class="wb-strip" aria-label="签署概览">
      <div class="wb-strip__item">
        <span class="wb-strip__label">合同总数</span>
        <span class="wb-strip__value">{{ stripValue(contracts.length) }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">待我签署</span>
        <span class="wb-strip__value">{{ stripValue(countOf('pending')) }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">等待他方</span>
        <span class="wb-strip__value">{{ stripValue(countOf('waiting')) }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">已完成</span>
        <span class="wb-strip__value">{{ stripValue(countOf('signed')) }}</span>
      </div>
      <div class="wb-strip__item wb-strip__action">
        <TButton icon-only :loading="loading" aria-label="刷新签署记录" @click="loadContracts">
          <TIcon><Refresh /></TIcon>
        </TButton>
      </div>
    </div>

    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">我的合同</h3>
        </div>
      </div>

      <div class="wb-toolbar">
        <div class="wb-chip-group" role="group" aria-label="签署状态">
          <button v-for="state in summaries" :key="state.value" type="button" class="wb-chip wb-chip--button"
            :class="{ 'is-active': selectedState === state.value, 'wb-chip--muted': state.value === 'void' }"
            :aria-pressed="selectedState === state.value" @click="selectedState = state.value">
            {{ state.label }}<span class="wb-chip__count">{{ loading || error ? '—' : state.count }}</span>
          </button>
        </div>
        <TInput v-model="keyword" class="wb-toolbar__search" clearable placeholder="搜索合同名称、编号或签约方"
          aria-label="搜索合同">
          <template #prefix><TIcon><Search /></TIcon></template>
        </TInput>
        <div class="wb-toolbar__actions">
          <span v-if="hasActiveFilters" class="wb-toolbar__hint">筛选出 {{ filteredTotal }} / {{ contracts.length }} 份</span>
          <TButton variant="outline" v-if="hasActiveFilters" @click="resetFilters">
            <TIcon><RefreshLeft /></TIcon><span>重置</span>
          </TButton>
        </div>
      </div>

      <p v-if="loading" class="wb-empty" role="status">正在加载签署记录…</p>
      <div v-else-if="error" class="wb-empty" role="alert">
        <span class="wb-empty__title">加载签署记录失败</span>{{ error }}
        <div class="wb-empty__actions">
          <TButton variant="outline" @click="loadContracts">
            <TIcon><Refresh /></TIcon><span>重新加载</span>
          </TButton>
        </div>
      </div>
      <div v-else-if="!filteredContracts.length" class="wb-empty" role="status">
        <span class="wb-empty__title">{{ contracts.length ? '没有符合条件的签署记录' : '暂无签署记录' }}</span>
        <template v-if="contracts.length">
          <div class="wb-empty__actions">
            <TButton variant="outline" @click="resetFilters">
              <TIcon><RefreshLeft /></TIcon><span>清除筛选</span>
            </TButton>
          </div>
        </template>
        <template v-else>需求进入签约环节后，这里会出现待你签署的合同。</template>
      </div>
      <template v-else>
        <ul class="wb-list" aria-label="我的合同列表">
          <li v-for="item in pagedContracts" :key="item.id" class="wb-item">
            <div class="wb-item__main">
              <RouterLink class="wb-item__title signatures__title" :to="detailLocation(item)">{{ item.title }}</RouterLink>
              <span class="wb-item__meta">{{ item.contract_no || '暂无合同编号' }} · {{ item.created_at }} 创建</span>
              <span class="wb-item__meta">
                甲方 · {{ item.party_a_name || item.party_a_username || '未指定' }}
                　乙方 · {{ item.party_b_name || item.party_b_username || '未指定' }}
                · 我的身份：{{ roleLabel(item) }}
              </span>
            </div>
            <div class="wb-item__side">
              <span class="wb-badge" :class="badgeClass(item)">{{ badgeLabel(item) }}</span>
              <TButton :class="stateOf(item) === 'pending' ? 'wb-toolbar__primary' : 'wb-toolbar__ghost'"
                @click="openDetail(item)">
                {{ stateOf(item) === 'pending' ? '去签署' : '查看详情' }}
              </TButton>
            </div>
          </li>
        </ul>
        <div class="wb-pager">
          <div class="wb-pager__count">
            <span>共 {{ filteredTotal }} 份合同</span>
            <TSelect v-model="pageSize" class="wb-pager__size" aria-label="每页合同数">
              <TOption v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
            </TSelect>
          </div>
          <TPagination v-model:current-page="page" :page-size="pageSize" :total="filteredTotal"
            :pager-count="5" background aria-label="签署记录分页" />
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
/* 版式全部走统一层（.wb-strip / .wb-card-head / .wb-toolbar / .wb-list / .wb-pager），
   本页只保留标题链接的悬停色，不再自带一套青色板与自绘控件。 */
.signatures__title:hover {
  color: var(--profile-accent);
}

@media (max-width: 640px) {
}
</style>
