<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh, RefreshLeft, View } from '@element-plus/icons-vue'

import {
  listMcResources,
  listMcResourceVersions,
  type McResourcePayload,
  type McResourceVersionPayload,
} from '@dev/api/mcResources'
import { listMyRequirements, type RequirementItem } from '@dev/api/requirements'
import {
  getDevWalletOverview,
  type DevWalletIncomeItem,
  type DevWalletOverview,
} from '@dev/api/wallet'
import { useToast } from '@dev/composables/useToast'
import { useAuthStore } from '@dev/stores/auth'

type ReleaseRecord = {
  resourceId: number
  resourceTitle: string
  platform: McResourcePayload['platform']
  resourceVisibility: McResourcePayload['visibility']
  versionId: number
  version: string
  versionNote: string | null
  createdAt: string
  requirementId: string | null
  requirementTitle: string | null
  requirementStatus: RequirementItem['status'] | null
  settlementText: string
}

const auth = useAuthStore()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)
const resources = ref<McResourcePayload[]>([])
const releaseRows = ref<ReleaseRecord[]>([])
const walletOverview = ref<DevWalletOverview | null>(null)

const filters = reactive({
  keyword: '',
  visibility: '',
  settlement: '',
})

const recentIncome = computed<DevWalletIncomeItem[]>(
  () => walletOverview.value?.recent_income ?? [],
)
const latestRelease = computed(() => releaseRows.value[0] ?? null)
const publishedResourceCount = computed(
  () => resources.value.filter((item) => item.visibility === 'published').length,
)
const totalVersionCount = computed(() => releaseRows.value.length)
const linkedRequirementCount = computed(
  () => releaseRows.value.filter((item) => item.requirementId).length,
)

const filteredRows = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()

  return releaseRows.value.filter((item) => {
    if (filters.visibility && item.resourceVisibility !== filters.visibility) {
      return false
    }

    if (filters.settlement && item.settlementText !== filters.settlement) {
      return false
    }

    if (!keyword) {
      return true
    }

    return [
      item.resourceTitle,
      item.version,
      item.requirementId || '',
      item.requirementTitle || '',
      item.versionNote || '',
    ].some((value) => value.toLowerCase().includes(keyword))
  })
})

const releaseStats = computed(() => [
  {
    label: '最近交付',
    value: latestRelease.value?.version ?? '-',
    meta: latestRelease.value
      ? `${latestRelease.value.resourceTitle} · ${formatTime(latestRelease.value.createdAt)}`
      : '当前还没有版本交付记录',
  },
  {
    label: '版本总数',
    value: String(totalVersionCount.value).padStart(2, '0'),
    meta: `已公开资源 ${publishedResourceCount.value} 个`,
  },
  {
    label: '关联需求',
    value: String(linkedRequirementCount.value).padStart(2, '0'),
    meta: `最近尾款 ${money(walletOverview.value?.today_income_cny)}`,
  },
])

onMounted(async () => {
  auth.hydrate()
  await loadPage()
})

function money(value?: number | null) {
  if (value == null) {
    return '¥0.00'
  }

  return `¥${value.toFixed(2)}`
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function platformText(value: McResourcePayload['platform']) {
  return value || '未知平台'
}

function visibilityText(value: McResourcePayload['visibility']) {
  if (value === 'published') {
    return '已公开'
  }
  if (value === 'review') {
    return '审核中'
  }
  return '私有'
}

function visibilityTagType(value: McResourcePayload['visibility']): 'success' | 'warning' | 'info' {
  if (value === 'published') {
    return 'success'
  }
  if (value === 'review') {
    return 'warning'
  }
  return 'info'
}

function requirementStatusText(value: RequirementItem['status'] | null) {
  const map: Record<string, string> = {
    in_development: '开发中',
    pending_final: '待付尾款',
    final_paid: '已付尾款',
    completed: '已完成',
    deposit_paid: '待开发',
  }
  return value ? map[value] || value : '未关联需求'
}

function settlementText(status: RequirementItem['status'] | null) {
  if (status === 'final_paid' || status === 'completed') {
    return '已回款'
  }
  if (status === 'pending_final') {
    return '待付尾款'
  }
  if (status === 'in_development') {
    return '开发中'
  }
  if (status === 'deposit_paid') {
    return '仅定金'
  }
  return '未关联'
}

async function loadPage() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  loading.value = true
  try {
    const [resourceList, myRequirements, wallet] = await Promise.all([
      listMcResources(auth.token),
      listMyRequirements(auth.token),
      getDevWalletOverview(auth.token),
    ])

    resources.value = resourceList
    walletOverview.value = wallet

    const requirementMap = new Map<number, RequirementItem>()
    for (const item of myRequirements) {
      if (item.bound_resource_id) {
        requirementMap.set(item.bound_resource_id, item)
      }
    }

    const versionGroups = await Promise.all(
      resourceList.map(async (resource) => ({
        resource,
        versions: await listMcResourceVersions(auth.token!, resource.id),
      })),
    )

    const rows: ReleaseRecord[] = []
    for (const group of versionGroups) {
      const linkedRequirement = requirementMap.get(group.resource.id) ?? null
      for (const version of group.versions) {
        rows.push(mapReleaseRecord(group.resource, version, linkedRequirement))
      }
    }

    releaseRows.value = rows.sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载交付记录失败'
    showToast(message, 'error')
    releaseRows.value = []
  } finally {
    loading.value = false
  }
}

function mapReleaseRecord(
  resource: McResourcePayload,
  version: McResourceVersionPayload,
  requirement: RequirementItem | null,
): ReleaseRecord {
  return {
    resourceId: resource.id,
    resourceTitle: resource.title,
    platform: resource.platform,
    resourceVisibility: resource.visibility,
    versionId: version.id,
    version: version.version,
    versionNote: version.note,
    createdAt: version.created_at,
    requirementId: requirement?.requirement_id ?? null,
    requirementTitle: requirement?.title ?? null,
    requirementStatus: requirement?.status ?? null,
    settlementText: settlementText(requirement?.status ?? null),
  }
}

function resetFilters() {
  filters.keyword = ''
  filters.visibility = ''
  filters.settlement = ''
}

function openVersionsPage(row: ReleaseRecord) {
  router.push({ name: 'dev-resource-versions', params: { resourceId: row.resourceId } })
}
</script>

<template>
  <div class="dev-page dev-release-page">
    <div class="dev-meta-strip">
      <template v-for="(item, index) in releaseStats" :key="item.label">
        <div v-if="index > 0" class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">{{ item.label }}</span>
          <span class="dev-meta-strip__value">{{ item.value }}</span>
        </div>
      </template>
    </div>

    <el-card shadow="never" class="dev-surface-card">
      <h3 class="dev-section-title">最近尾款回执</h3>
      <p class="dev-section-desc">只统计收入，便于确认哪些交付已经真正回款。</p>

      <div v-if="recentIncome.length === 0" class="dev-release-empty">
        <el-empty description="当前没有尾款回执" :image-size="72" />
      </div>

      <div v-else class="dev-release-income-list">
        <article v-for="item in recentIncome" :key="item.payment_id" class="dev-release-income-card">
          <div class="dev-release-income-card__top">
            <div>
              <div class="dev-release-income-card__title">{{ item.title }}</div>
              <div class="dev-release-income-card__meta">
                {{ item.requirement_id }} · {{ item.customer }}
              </div>
            </div>
            <strong class="dev-release-income-card__amount">{{ money(item.amount_cny) }}</strong>
          </div>
          <div class="dev-release-income-card__footer">
            <el-tag type="success" size="small" effect="plain">{{
              requirementStatusText(item.requirement_status as RequirementItem['status'])
              }}</el-tag>
            <span>{{ formatTime(item.paid_at) }}</span>
          </div>
        </article>
      </div>
    </el-card>

    <el-card shadow="never" class="dev-surface-card">
      <div class="dev-release-toolbar">
        <el-select v-model="filters.visibility" clearable placeholder="资源状态" class="dev-release-toolbar__field">
          <el-option label="已公开" value="published" />
          <el-option label="审核中" value="review" />
          <el-option label="私有" value="draft" />
        </el-select>
        <el-select v-model="filters.settlement" clearable placeholder="回款状态" class="dev-release-toolbar__field">
          <el-option label="已回款" value="已回款" />
          <el-option label="待付尾款" value="待付尾款" />
          <el-option label="开发中" value="开发中" />
          <el-option label="仅定金" value="仅定金" />
          <el-option label="未关联" value="未关联" />
        </el-select>
        <el-input v-model="filters.keyword" clearable placeholder="搜索资源标题、版本号、需求编号或备注"
          class="dev-release-toolbar__search" />
        <div class="dev-release-toolbar__actions">
          <el-button class="dev-release-toolbar__button dev-release-toolbar__button--ghost" @click="resetFilters">
            <el-icon>
              <RefreshLeft />
            </el-icon>
            <span>重置</span>
          </el-button>
          <el-button class="dev-release-toolbar__button dev-release-toolbar__button--ghost" type="primary"
            :loading="loading" @click="loadPage">
            <el-icon v-if="!loading">
              <Refresh />
            </el-icon>
            <span>刷新</span>
          </el-button>
        </div>
      </div>

      <el-table :data="filteredRows" stripe class="dev-release-table" v-loading="loading"
        :empty-text="loading ? '交付记录加载中' : '当前没有匹配的交付记录'">
        <el-table-column label="版本交付" min-width="280">
          <template #default="scope">
            <div class="dev-release-record__title">{{ scope.row.resourceTitle }}</div>
            <div class="dev-release-record__meta">
              {{ platformText(scope.row.platform) }} · {{ scope.row.version }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="关联需求" min-width="240">
          <template #default="scope">
            <div class="dev-release-record__requirement">
              {{ scope.row.requirementId || '未关联需求' }}
            </div>
            <div class="dev-release-record__meta">
              {{ scope.row.requirementTitle || '当前版本暂未绑定需求场景' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="资源状态" width="120">
          <template #default="scope">
            <el-tag :type="visibilityTagType(scope.row.resourceVisibility)" effect="plain">{{
              visibilityText(scope.row.resourceVisibility)
              }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="回款进度" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.settlementText === '已回款'
                ? 'success'
                : scope.row.settlementText === '待付尾款'
                  ? 'warning'
                  : 'info'
              " effect="plain">
              {{ scope.row.settlementText }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发布时间" min-width="180">
          <template #default="scope">
            {{ formatTime(scope.row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="100" show-overflow-tooltip>
          <template #default="scope">
            <div class="dev-release-record__note">
              {{ scope.row.versionNote || '暂无版本备注' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="scope">
            <div class="dev-release-record__actions">
              <el-button class="dev-release-record__action-button" size="small" type="primary" plain
                @click="openVersionsPage(scope.row)">
                <el-icon>
                  <View />
                </el-icon>
                <span>查看版本</span>
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.dev-release-page {
  gap: 24px;
}

.dev-release-toolbar {
  display: grid;
  grid-template-columns: minmax(120px, 150px) minmax(120px, 150px) minmax(220px, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.dev-release-toolbar__search {
  width: 100%;
}

.dev-release-toolbar__field {
  width: 100%;
}

.dev-release-toolbar__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dev-release-toolbar__button.el-button,
.dev-release-record__action-button.el-button {
  border-radius: 10px;
  font-weight: 800;
  line-height: 1;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.dev-release-toolbar__button.el-button {
  min-width: 76px;
  min-height: 38px;
  height: 38px;
  padding: 0 12px;
}

.dev-release-toolbar__button.el-button :deep(span),
.dev-release-record__action-button.el-button :deep(span) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dev-release-toolbar__button.el-button .el-icon,
.dev-release-record__action-button.el-button .el-icon {
  font-size: 16px;
}

.dev-release-toolbar__button--ghost.el-button,
.dev-release-record__action-button.el-button {
  border-color: rgba(148, 163, 184, 0.3);
  background: rgba(255, 255, 255, 0.88);
  color: #475569;
  box-shadow: 0 8px 18px rgba(17, 24, 39, 0.04);
}

.dev-release-toolbar__button--ghost.el-button:hover,
.dev-release-toolbar__button--ghost.el-button:focus-visible,
.dev-release-record__action-button.el-button:hover,
.dev-release-record__action-button.el-button:focus-visible {
  border-color: rgba(42, 166, 164, 0.28);
  background: rgba(42, 166, 164, 0.08);
  color: #247f7d;
  box-shadow: 0 10px 20px rgba(42, 166, 164, 0.08);
  transform: translateY(-1px);
}

.dev-release-toolbar__button.el-button.is-loading {
  transform: none;
}

.dev-release-record__action-button.el-button {
  min-height: 34px;
  height: 34px;
  padding: 0 12px;
}

.dev-release-record__title,
.dev-release-income-card__title {
  font-weight: 700;
  color: var(--dev-ink);
}

.dev-release-record__requirement,
.dev-release-income-card__amount {
  font-weight: 700;
}

.dev-release-record__meta,
.dev-release-income-card__meta,
.dev-release-income-card__footer {
  margin-top: 6px;
  font-size: 13px;
  color: var(--dev-muted);
}

.dev-release-record__note {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 8px;
}

.dev-release-record__actions {
  display: flex;
  justify-content: center;
  white-space: nowrap;
}

.dev-release-income-list,
.dev-release-note-list {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

.dev-release-income-card,
.dev-release-note-item {
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.58);
  border: 1px solid rgba(17, 24, 39, 0.08);
}

.dev-release-income-card__top,
.dev-release-income-card__footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.dev-release-income-card__amount {
  color: var(--dev-gold);
}

.dev-release-empty {
  padding: 18px 0 8px;
}

@media (max-width: 900px) {
  .dev-release-toolbar {
    grid-template-columns: 1fr 1fr;
  }

  .dev-release-toolbar__actions {
    justify-content: flex-start;
  }
}
</style>
