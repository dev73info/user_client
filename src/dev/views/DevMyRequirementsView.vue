<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { listMyRequirements, type RequirementItem } from '@dev/api/requirements'
import { fetchContractSigningStatus, type ContractSigningStatus } from '@dev/api/contracts'
import { useToast } from '@dev/composables/useToast'
import { useAuthStore } from '@dev/stores/auth'

const auth = useAuthStore()
const { showToast } = useToast()

const loading = ref(false)
const rows = ref<RequirementItem[]>([])
const signingStatusMap = ref<Record<string, ContractSigningStatus | null>>({})

const emptyText = computed(() => (loading.value ? '我的需求单加载中' : '当前账号还没有已关联需求'))
const boundCount = computed(() => rows.value.filter((item) => item.bound_resource_id != null).length)
const activeCount = computed(() => rows.value.filter((item) => item.status === 'in_development').length)

onMounted(async () => {
  auth.hydrate()
  await loadMyRequirements()
})

async function loadMyRequirements() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  loading.value = true
  try {
    rows.value = await listMyRequirements(auth.token)
    // 并发获取所有需求的签署状态
    const statusEntries = await Promise.allSettled(
      rows.value.map((item) =>
        fetchContractSigningStatus(auth.token!, item.requirement_id).then((s) => ({ id: item.requirement_id, s })),
      ),
    )
    const map: Record<string, ContractSigningStatus | null> = {}
    for (const entry of statusEntries) {
      if (entry.status === 'fulfilled') {
        map[entry.value.id] = entry.value.s
      }
    }
    signingStatusMap.value = map
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载已关联需求失败'
    showToast(message, 'error')
    rows.value = []
  } finally {
    loading.value = false
  }
}

function formatMoney(value?: number | null): string {
  if (value == null) {
    return '待议价'
  }

  return `¥${value}`
}

function statusLabel(status: RequirementItem['status']): string {
  switch (status) {
    case 'pending_review':
      return '待审核'
    case 'rejected':
      return '已驳回'
    case 'pending_deposit':
      return '待付定金'
    case 'deposit_paid':
      return '待开发'
    case 'in_development':
      return '开发中'
    case 'pending_final':
      return '待付尾款'
    case 'final_paid':
      return '已付尾款'
    case 'completed':
      return '已完成'
    default:
      return status
  }
}

function statusType(status: RequirementItem['status']): 'info' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'completed':
    case 'final_paid':
    case 'deposit_paid':
      return 'success'
    case 'in_development':
    case 'pending_final':
      return 'warning'
    case 'rejected':
      return 'danger'
    default:
      return 'info'
  }
}

function resourceVisibilityLabel(item: RequirementItem): string {
  if (item.bound_resource_id == null) {
    return '未关联资源'
  }

  return item.resource_visibility === 'public' ? '资源已公开' : '资源私有中'
}
</script>

<template>
  <div class="dev-page dev-page--my-requirements">
    <section class="dev-panel-banner dev-panel-banner--light">
      <div>
        <div class="dev-panel-banner__eyebrow">My Requirement Orders</div>
        <h2 class="dev-panel-banner__title">集中查看当前账号已经关联的需求单</h2>
        <p class="dev-panel-banner__desc">
          这里展示当前开发者账号已经接单并完成资源关联的需求，和“需求大厅”里尚未被领取的需求分开展示。
        </p>
      </div>
      <div class="dev-panel-banner__meta">
        <el-button text :loading="loading" @click="loadMyRequirements">刷新列表</el-button>
      </div>
    </section>

    <div class="dev-grid dev-grid--three">
      <el-card shadow="never" class="dev-surface-card dev-surface-card--soft">
        <div class="dev-stat dev-stat--compact">
          <span class="dev-stat__label">总需求单</span>
          <span class="dev-stat__value">{{ rows.length }}</span>
          <span class="dev-stat__hint">当前账号已经关联的全部需求数</span>
        </div>
      </el-card>
      <el-card shadow="never" class="dev-surface-card dev-surface-card--soft">
        <div class="dev-stat dev-stat--compact">
          <span class="dev-stat__label">已关联资源</span>
          <span class="dev-stat__value">{{ boundCount }}</span>
          <span class="dev-stat__hint">已经和当前开发者资源项目建立关联的需求数</span>
        </div>
      </el-card>
      <el-card shadow="never" class="dev-surface-card dev-surface-card--soft">
        <div class="dev-stat dev-stat--compact">
          <span class="dev-stat__label">开发中</span>
          <span class="dev-stat__value">{{ activeCount }}</span>
          <span class="dev-stat__hint">当前已经推进到开发中的需求数</span>
        </div>
      </el-card>
    </div>

    <el-card shadow="never" class="dev-surface-card">
      <el-table :data="rows" stripe v-loading="loading" class="dev-release-table" :empty-text="emptyText">
        <el-table-column label="需求" min-width="320">
          <template #default="scope">
            <div class="dev-requirement-hall__title-cell">
              <div class="dev-requirement-hall__requirement-id">{{ scope.row.requirement_id }}</div>
              <div class="dev-requirement-hall__title">{{ scope.row.title }}</div>
              <div class="dev-requirement-hall__desc">{{ scope.row.description || '暂无补充描述' }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="预算" min-width="120">
          <template #default="scope">
            <span>{{ formatMoney(scope.row.budget) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="140">
          <template #default="scope">
            <el-tag :type="statusType(scope.row.status)" effect="plain">{{ statusLabel(scope.row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="资源关联" min-width="160">
          <template #default="scope">
            <span>{{ resourceVisibilityLabel(scope.row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="签署状态" min-width="200">
          <template #default="scope">
            <div class="signing-status-bar">
              <span
                class="signing-step"
                :class="signingStatusMap[scope.row.requirement_id]?.has_contract ? 'done' : 'pending'">
                协议已创建
              </span>
              <span class="signing-arrow">›</span>
              <span
                class="signing-step"
                :class="signingStatusMap[scope.row.requirement_id]?.party_b_signed ? 'done' : 'pending'">
                乙方已签
              </span>
              <span class="signing-arrow">›</span>
              <span
                class="signing-step"
                :class="signingStatusMap[scope.row.requirement_id]?.party_a_signed ? 'done' : 'pending'">
                甲方已签
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="updated_at" label="最近更新" min-width="180" />
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.signing-status-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}

.signing-step {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  white-space: nowrap;
}

.signing-step.done {
  background: rgba(76, 175, 129, 0.15);
  color: #4caf81;
  font-weight: 600;
}

.signing-step.pending {
  background: rgba(0, 0, 0, 0.06);
  color: #909399;
}

.signing-arrow {
  color: #c0c4cc;
  font-size: 12px;
}
</style>