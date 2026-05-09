<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import {
  listRequirementConversations,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@dev/api/conversations'
import { listMyRequirements, type RequirementItem } from '@dev/api/requirements'
import { fetchContractSigningStatus, type ContractSigningStatus } from '@dev/api/contracts'
import { useToast } from '@dev/composables/useToast'
import { useAuthStore } from '@dev/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)
const rows = ref<RequirementItem[]>([])
const signingStatusMap = ref<Record<string, ContractSigningStatus | null>>({})
const conversationVisible = ref(false)
const conversationRequirement = ref<RequirementItem | null>(null)
const conversationLoading = ref(false)
const requirementConversationMap = ref<Record<string, RequirementConversation>>({})

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
    const [statusEntries] = await Promise.all([
      Promise.allSettled(
        rows.value.map((item) =>
          fetchContractSigningStatus(auth.token!, item.requirement_id).then((s) => ({ id: item.requirement_id, s })),
        ),
      ),
      loadRequirementConversations(),
    ])
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

function isWaitingContractSign(item: RequirementItem): boolean {
  const status = signingStatusMap.value[item.requirement_id]
  return Boolean(
    item.status === 'deposit_paid' &&
    status?.has_contract &&
    (!status.party_a_signed || !status.party_b_signed),
  )
}

function displayStatusLabel(item: RequirementItem): string {
  return isWaitingContractSign(item) ? '待签合同' : statusLabel(item.status)
}

function paymentModeLabel(item: RequirementItem): string {
  return item.payment_mode === 'self_managed' ? '无平台担保' : '平台担保'
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

function displayStatusType(item: RequirementItem): 'info' | 'success' | 'warning' | 'danger' {
  return isWaitingContractSign(item) ? 'warning' : statusType(item.status)
}

function resourceVisibilityLabel(item: RequirementItem): string {
  if (item.bound_resource_id == null) {
    return '未关联资源'
  }

  return item.resource_visibility === 'public' ? '资源已公开' : '资源私有中'
}

function openConversation(item: RequirementItem) {
  conversationRequirement.value = item
  conversationVisible.value = true
}

function closeConversation() {
  conversationVisible.value = false
}

function applyConversationDetail(payload: RequirementConversationDetail) {
  requirementConversationMap.value = {
    ...requirementConversationMap.value,
    [payload.conversation.requirement_id]: payload.conversation,
  }
}

function conversationForRequirement(item: RequirementItem) {
  return requirementConversationMap.value[item.requirement_id] ?? null
}

function conversationStatusLabel(item: RequirementItem) {
  const conversation = conversationForRequirement(item)
  if (!conversation) {
    return '打开后创建会话'
  }
  return conversation.last_message_at ? `最近：${conversation.last_message_at}` : '暂无消息'
}

function conversationButtonLabel(item: RequirementItem) {
  return conversationForRequirement(item)?.last_message_at ? '查看' : '开始'
}

function canOpenContractSign(item: RequirementItem) {
  return Boolean(signingStatusMap.value[item.requirement_id]?.has_contract)
}

function contractButtonLabel(item: RequirementItem) {
  const status = signingStatusMap.value[item.requirement_id]
  return status?.party_b_signed ? '查看合同' : '签署合同'
}

function contractStartHint(item: RequirementItem): string {
  if (!isWaitingContractSign(item)) {
    return ''
  }

  const status = signingStatusMap.value[item.requirement_id]
  if (!status?.party_b_signed) {
    return '请先签署合同，甲方确认后自动开始开发'
  }
  return '等待甲方签署，双方签完后自动开始开发'
}

function openContractSign(item: RequirementItem) {
  router.push({
    name: 'contract-sign',
    query: { requirement_id: item.requirement_id, from: 'dev' },
  })
}

async function loadRequirementConversations() {
  if (!auth.token) {
    requirementConversationMap.value = {}
    return
  }

  conversationLoading.value = true
  try {
    const conversations = await listRequirementConversations(auth.token)
    requirementConversationMap.value = Object.fromEntries(
      conversations.map((item) => [item.requirement_id, item]),
    )
  } catch (error) {
    requirementConversationMap.value = {}
    showToast(error instanceof Error ? error.message : '加载沟通会话失败', 'error')
  } finally {
    conversationLoading.value = false
  }
}
</script>

<template>
  <div class="dev-page dev-page--my-requirements">

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

    <el-card shadow="never" class="dev-surface-card dev-my-requirements-card">
      <div class="dev-my-requirements-table-wrap">
        <el-table :data="rows" stripe v-loading="loading" class="dev-release-table dev-my-requirements-table"
          :empty-text="emptyText" scrollbar-always-on>
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
              <el-tag :type="displayStatusType(scope.row)" effect="plain">{{ displayStatusLabel(scope.row) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="发布方式" min-width="130">
            <template #default="scope">
              <el-tag :type="scope.row.payment_mode === 'self_managed' ? 'info' : 'warning'" effect="plain">
                {{ paymentModeLabel(scope.row) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="资源关联" min-width="160">
            <template #default="scope">
              <span>{{ resourceVisibilityLabel(scope.row) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="签署状态" min-width="240">
            <template #default="scope">
              <div class="signing-status-bar">
                <span class="signing-step"
                  :class="signingStatusMap[scope.row.requirement_id]?.has_contract ? 'done' : 'pending'">
                  协议已创建
                </span>
                <span class="signing-arrow">›</span>
                <span class="signing-step"
                  :class="signingStatusMap[scope.row.requirement_id]?.party_b_signed ? 'done' : 'pending'">
                  乙方已签
                </span>
                <span class="signing-arrow">›</span>
                <span class="signing-step"
                  :class="signingStatusMap[scope.row.requirement_id]?.party_a_signed ? 'done' : 'pending'">
                  甲方已签
                </span>
              </div>
              <el-button v-if="canOpenContractSign(scope.row)" class="signing-action" type="primary" link
                @click="openContractSign(scope.row)">{{ contractButtonLabel(scope.row) }}</el-button>
              <div v-if="contractStartHint(scope.row)" class="signing-start-hint">{{ contractStartHint(scope.row) }}
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="updated_at" label="最近更新" min-width="180" />
          <el-table-column label="会话状态" min-width="180">
            <template #default="scope">
              <span class="conversation-status-text">
                {{ conversationLoading ? '会话加载中' : conversationStatusLabel(scope.row) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="沟通" width="96">
            <template #default="scope">
              <el-button type="primary" link @click="openConversation(scope.row)">{{ conversationButtonLabel(scope.row)
              }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <RequirementConversationModal :visible="conversationVisible" api-mode="dev" :token="auth.token"
      :current-username="auth.username" :requirement-id="conversationRequirement?.requirement_id ?? ''"
      :title="conversationRequirement?.title" @updated="applyConversationDetail" @close="closeConversation" />
  </div>
</template>

<style scoped>
.dev-my-requirements-card {
  overflow: hidden;
}

.dev-my-requirements-table-wrap {
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.dev-my-requirements-table {
  width: 100%;
}

.dev-my-requirements-table :deep(.el-table__body-wrapper) {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.dev-my-requirements-table :deep(.el-table__cell) {
  vertical-align: top;
}

.dev-my-requirements-table :deep(.cell) {
  min-width: 0;
}

.dev-my-requirements-table :deep(.el-table__fixed-right),
.dev-my-requirements-table :deep(.el-table__fixed-right-patch) {
  display: none;
}

.dev-my-requirements-table .dev-requirement-hall__requirement-id,
.dev-my-requirements-table .dev-requirement-hall__title,
.dev-my-requirements-table .dev-requirement-hall__desc {
  overflow-wrap: anywhere;
}

.signing-status-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  max-width: 100%;
  row-gap: 6px;
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

.signing-action {
  margin-top: 6px;
  padding: 0;
}

.signing-start-hint {
  margin-top: 4px;
  color: #b45309;
  font-size: 12px;
  line-height: 1.5;
}

.conversation-status-text {
  display: inline-block;
  max-width: 100%;
  color: #606266;
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
