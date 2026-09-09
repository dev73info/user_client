<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Document, EditPen, Refresh, Search, View } from '@element-plus/icons-vue'
import { listMyContracts, type MyContractSummary } from '@/api/contracts'
import { useAuthStore } from '@/stores/auth'
import { getSignatureState, signatureStateLabels, type SignatureState } from '@/utils/contractSignatures'

const auth = useAuthStore()
const contracts = ref<MyContractSummary[]>([])
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const selectedState = ref<'all' | SignatureState>('all')
const page = ref(1)
const pageSize = 10
let requestId = 0

const states: { value: 'all' | SignatureState; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待我签署' },
  { value: 'waiting', label: '等待他方' },
  { value: 'signed', label: '已完成' },
  { value: 'void', label: '已作废' },
]
const summaries = computed(() => states.map((state) => ({
  ...state,
  count: state.value === 'all' ? contracts.value.length
    : contracts.value.filter((item) => getSignatureState(item, auth.username) === state.value).length,
})))
const filteredContracts = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase()
  return contracts.value.filter((item) => {
    const matchesState = selectedState.value === 'all' || getSignatureState(item, auth.username) === selectedState.value
    const matchesSearch = !search || [item.title, item.contract_no, item.requirement_id,
      item.party_a_name, item.party_b_name].some((value) => value?.toLocaleLowerCase().includes(search))
    return matchesState && matchesSearch
  })
})
const visibleContracts = computed(() => filteredContracts.value.slice((page.value - 1) * pageSize, page.value * pageSize))

watch([keyword, selectedState], () => { page.value = 1 })
watch(() => auth.token, () => { void loadContracts() }, { immediate: true })

async function loadContracts() {
  const currentRequest = ++requestId
  const token = auth.token
  contracts.value = []
  error.value = ''
  page.value = 1
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

function detailLocation(item: MyContractSummary) {
  return { name: 'workbench-signature-detail', params: { contractId: item.id } }
}
</script>

<template>
  <main class="signatures" :aria-busy="loading">
    <div class="signatures__toolbar">
      <label class="signatures__search">
        <el-icon><Search /></el-icon>
        <input v-model="keyword" type="search" aria-label="搜索合同" placeholder="搜索合同名称、编号或签约方" />
      </label>
      <button class="signatures__refresh" type="button" :disabled="loading" @click="loadContracts">
        <el-icon :class="{ 'is-loading': loading }"><Refresh /></el-icon>
        {{ loading ? '刷新中' : '刷新' }}
      </button>
    </div>

    <div class="signatures__filters" role="group" aria-label="签署状态">
      <button v-for="state in summaries" :key="state.value" type="button"
        :class="{ active: selectedState === state.value }" :aria-pressed="selectedState === state.value"
        @click="selectedState = state.value">
        {{ state.label }}<span>{{ loading || error ? '-' : state.count }}</span>
      </button>
    </div>

    <div v-if="loading" class="signatures__empty" role="status">正在加载签署记录...</div>
    <div v-else-if="error" class="signatures__empty signatures__empty--error" role="alert">
      <p>{{ error }}</p>
      <button type="button" class="signatures__refresh" @click="loadContracts"><el-icon><Refresh /></el-icon>重新加载</button>
    </div>
    <div v-else-if="!filteredContracts.length" class="signatures__empty" role="status">
      <el-icon class="signatures__empty-icon"><Document /></el-icon>
      <p>{{ contracts.length ? '没有符合条件的签署记录' : '暂无签署记录' }}</p>
      <button v-if="keyword || selectedState !== 'all'" type="button" class="signatures__clear"
        @click="keyword = ''; selectedState = 'all'">清除筛选</button>
    </div>
    <template v-else>
      <div class="signatures__table" role="table" aria-label="我的签署合同">
        <div class="signatures__table-head" role="row">
          <span role="columnheader">合同信息</span><span role="columnheader">签约方</span>
          <span role="columnheader">签署状态</span><span role="columnheader">操作</span>
        </div>
        <article v-for="item in visibleContracts" :key="item.id" class="signatures__row" role="row">
          <div class="signatures__contract" role="cell">
            <RouterLink class="signatures__title" :to="detailLocation(item)">{{ item.title }}</RouterLink>
            <span class="signatures__number">{{ item.contract_no }}</span>
            <span class="signatures__date">{{ item.created_at }} 创建</span>
          </div>
          <div class="signatures__parties" role="cell">
            <span>甲方 · {{ item.party_a_name || item.party_a_username || '未指定' }}</span>
            <span>乙方 · {{ item.party_b_name || item.party_b_username || '未指定' }}</span>
            <small>我的身份：{{ roleLabel(item) }}</small>
          </div>
          <div class="signatures__status" role="cell">
            <span class="signatures__badge" :class="`signatures__badge--${getSignatureState(item, auth.username)}`">
              {{ signatureStateLabels[getSignatureState(item, auth.username)] }}
            </span>
          </div>
          <div class="signatures__action" role="cell">
            <RouterLink :to="detailLocation(item)" :class="{ 'signatures__sign': getSignatureState(item, auth.username) === 'pending' }">
              <el-icon><EditPen v-if="getSignatureState(item, auth.username) === 'pending'" /><View v-else /></el-icon>
              {{ getSignatureState(item, auth.username) === 'pending' ? '去签署' : '查看详情' }}
            </RouterLink>
          </div>
        </article>
      </div>
      <footer class="signatures__footer">
        <span>共 {{ filteredContracts.length }} 份合同</span>
        <el-pagination v-if="filteredContracts.length > pageSize" v-model:current-page="page"
          :page-size="pageSize" :total="filteredContracts.length" :pager-count="5" layout="prev, pager, next" small />
      </footer>
    </template>
  </main>
</template>

<style scoped>
.signatures {
  --signature-accent: #247f7d;
  --signature-text: #172033;
  --signature-muted: #667085;
  --signature-border: #e5e9ef;
  max-width: 1180px;
  margin: 0 auto;
  padding: 20px 20px 40px;
  color: var(--signature-text);
  letter-spacing: 0;
}
.signatures__toolbar { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.signatures__search { display: flex; align-items: center; gap: 10px; width: 380px; min-width: 0; padding: 0 12px; border: 1px solid var(--signature-border); border-radius: 6px; background: #fff; color: var(--signature-muted); }
.signatures__search:focus-within { border-color: var(--signature-accent); }
.signatures__search input { width: 100%; min-width: 0; height: 38px; border: 0; outline: 0; background: transparent; font: inherit; font-size: 13px; }
.signatures__refresh { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 16px; border: 0; border-radius: 6px; background: var(--signature-accent); color: white; font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap; }
.signatures__refresh:disabled { cursor: wait; opacity: .6; }
.signatures__filters { display: flex; flex-wrap: wrap; gap: 4px 20px; border-bottom: 1px solid var(--signature-border); }
.signatures__filters button { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 8px 0; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--signature-muted); font: inherit; font-size: 13px; cursor: pointer; }
.signatures__filters button.active { color: var(--signature-accent); border-bottom-color: var(--signature-accent); font-weight: 700; }
.signatures__filters button span { min-width: 24px; padding: 2px 5px; border-radius: 4px; background: #f0f3f5; font-size: 11px; font-variant-numeric: tabular-nums; }
.signatures__table-head, .signatures__row { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1.2fr) 100px 96px; gap: 20px; align-items: center; }
.signatures__table-head { padding: 14px 16px; color: var(--signature-muted); font-size: 12px; background: #f7f9fa; }
.signatures__row { padding: 22px 16px; border-bottom: 1px solid var(--signature-border); background: #fff; }
.signatures__contract, .signatures__parties { display: grid; gap: 7px; min-width: 0; overflow-wrap: anywhere; }
.signatures__title { color: var(--signature-text); font-size: 14px; font-weight: 700; line-height: 1.6; text-decoration: none; }
.signatures__title:hover { color: var(--signature-accent); }
.signatures__number, .signatures__date, .signatures__parties small { font-size: 12px; color: var(--signature-muted); }
.signatures__parties { font-size: 13px; line-height: 1.5; }
.signatures__badge { display: inline-flex; padding: 5px 9px; border-radius: 4px; font-size: 12px; color: #667085; background: #f0f3f5; }
.signatures__badge--pending { color: #946719; background: #fff4d6; }
.signatures__badge--waiting { color: #247f7d; background: #e6f4f4; }
.signatures__badge--signed { color: #23824a; background: #e5f7ec; }
.signatures__badge--void { color: #a34b4b; background: #fdecec; }
.signatures__action a { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 34px; color: var(--signature-accent); text-decoration: none; font-size: 13px; white-space: nowrap; }
.signatures__action a.signatures__sign { padding: 0 10px; background: #e6f4f4; border-radius: 5px; font-weight: 600; }
.signatures__empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 280px; padding: 32px; color: var(--signature-muted); font-size: 14px; text-align: center; overflow-wrap: anywhere; }
.signatures__empty p { margin: 0; }
.signatures__empty--error { color: #b54747; }
.signatures__empty-icon { font-size: 40px; color: #9aafb6; }
.signatures__clear { background: none; border: 0; color: var(--signature-accent); cursor: pointer; font: inherit; }
.signatures__footer { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding-top: 20px; font-size: 12px; color: var(--signature-muted); }
.signatures :deep(.el-pagination) { --el-color-primary: var(--signature-accent); }
.signatures button:focus-visible, .signatures a:focus-visible { outline: 2px solid var(--signature-accent); outline-offset: 3px; }
@media (max-width: 700px) {
  .signatures { padding: 16px 12px 28px; }
  .signatures__toolbar { gap: 10px; margin-bottom: 12px; }
  .signatures__search { flex: 1; }
  .signatures__filters { gap: 0 16px; }
  .signatures__table-head { display: none; }
  .signatures__row { grid-template-columns: minmax(0, 1fr) auto; gap: 16px; padding: 20px 0; background: transparent; }
  .signatures__contract, .signatures__parties { grid-column: 1 / -1; }
  .signatures__action { justify-self: end; }
}
</style>
