<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRouter } from 'vue-router'
import { listMyContracts, type MyContractSummary } from '@/api/contracts'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import MySignatureRow from '@/components/contract/MySignatureRow.vue'
import { getSignatureState, type SignatureState } from '@/utils/contractSignatures'

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

/* 状态筛选走下拉（统一层 .wb-toolbar__field + TSelect），与需求列表同一套工具栏：
   筛的是**签名态**（我方要不要签），不是合同状态码：整数状态里没有对应语义，
   过期 / 拒签 / 撤销 这类合同只在「全部」里出现，列表徽标按合同状态显示。
   条数只在顶部读数条里报，选项文案不加括号数字。 */
type SignatureFilterKey = 'all' | SignatureState

const states: { value: SignatureFilterKey; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待我签署' },
  { value: 'waiting', label: '等待他方' },
  { value: 'signed', label: '已完成' },
  { value: 'void', label: '已作废' },
]

function countOf(state: SignatureState) {
  return contracts.value.filter((item) => getSignatureState(item, auth.username) === state).length
}

/* 读数在加载中与失败时不报数：contracts 在重新加载时会被清空，
   直接显示 0 会被读成「一份合同都没有」。 */
function stripValue(count: number) {
  return loading.value || error.value ? '—' : String(count)
}

const filteredContracts = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase()
  return contracts.value.filter((item) => {
    const matchesState =
      selectedState.value === 'all' ||
      getSignatureState(item, auth.username) === selectedState.value
    const matchesSearch =
      !search ||
      [
        item.title,
        item.contract_no,
        item.requirement_id,
        item.party_a_name,
        item.party_b_name,
      ].some((value) => value?.toLocaleLowerCase().includes(search))
    return matchesState && matchesSearch
  })
})

const hasActiveFilters = computed(
  () => keyword.value.trim() !== '' || selectedState.value !== 'all',
)

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
watch(
  () => auth.token,
  () => {
    void loadContracts()
  },
  { immediate: true },
)

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

function detailLocation(item: MyContractSummary) {
  return { name: 'workbench-signature-detail', params: { contractId: item.id } }
}

function openDetail(item: MyContractSummary) {
  void router.push(detailLocation(item))
}
</script>

<template>
  <main class="page-shell custom-page-shell profile-page signatures wb-sheet" :aria-busy="loading">
    <!-- 顶部读数条：读数在最左，页面级刷新固定在右上角 -->
    <WorkbenchBarSlot>
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
    </WorkbenchBarSlot>

    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">我的合同</h3>
        </div>
      </div>

      <div class="wb-toolbar">
        <TSelect v-model="selectedState" class="wb-toolbar__field" aria-label="签署状态">
          <TOption
            v-for="state in states"
            :key="state.value"
            :value="state.value"
            :label="state.label"
          />
        </TSelect>
        <TInput
          v-model="keyword"
          class="wb-toolbar__search"
          clearable
          placeholder="搜索合同名称、编号或签约方"
          aria-label="搜索合同"
        >
          <template #prefix
            ><TIcon><Search /></TIcon
          ></template>
        </TInput>
        <div v-if="hasActiveFilters" class="wb-toolbar__actions">
          <span class="wb-toolbar__hint"
            >筛选出 {{ filteredTotal }} / {{ contracts.length }} 份</span
          >
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
        <span class="wb-empty__title">{{
          contracts.length ? '没有符合条件的签署记录' : '暂无签署记录'
        }}</span>
        <div v-if="contracts.length" class="wb-empty__actions">
          <TButton variant="outline" @click="resetFilters">
            <TIcon><RefreshLeft /></TIcon><span>清除筛选</span>
          </TButton>
        </div>
      </div>
      <template v-else>
        <!-- 行式与需求协作同一口径：上半信息行（标题/编号 + 右侧状态与时间），下半操作条。 -->
        <ul class="wb-list signature-list" aria-label="我的合同列表">
          <MySignatureRow
            v-for="item in pagedContracts"
            :key="item.id"
            :item="item"
            :username="auth.username"
            @open="openDetail(item)"
          />
        </ul>
        <div class="wb-pager">
          <div class="wb-pager__count">
            <TSelect v-model="pageSize" class="wb-pager__size" aria-label="每页合同数">
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
            aria-label="签署记录分页"
          />
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
/* 版式走统一层 + profile.css 的需求行口径（.requirement-row / __card-body / __summary / __actions），
   本页不再自带一套卡片皮肤。 */
.signature-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
