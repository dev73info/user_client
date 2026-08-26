<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { ArrowDown, ArrowUp, ChatDotRound } from '@element-plus/icons-vue'

import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import RequirementProgressGuide from '@/components/RequirementProgressGuide.vue'
import {
  listRequirementConversations,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@dev/api/conversations'
import {
  listMyRequirements,
  requestUnbindRequirement,
  respondUnbindRequirement,
  type RequirementItem,
} from '@dev/api/requirements'
import { fetchContractSigningStatus, type ContractSigningStatus } from '@dev/api/contracts'
import { useToast } from '@dev/composables/useToast'
import { useAuthStore } from '@dev/stores/auth'
import { sanitizeRequirementRichText } from '@/utils/requirementRichText'

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
const descriptionOverflowMap = ref<Record<string, boolean>>({})
const expandedRequirements = ref<Record<string, boolean>>({})
const descriptionEls = ref<Record<string, HTMLElement>>({})

const unbindVisible = ref(false)
const unbindRequirement = ref<RequirementItem | null>(null)
const unbindReason = ref('')
const unbindLoading = ref(false)
const unbindRespondVisible = ref(false)
const unbindRespondRequirement = ref<RequirementItem | null>(null)
const unbindRespondLoading = ref(false)

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
    // 无担保模式（self_managed）不需要合同，无需查询合同签署状态
    const guaranteedRows = rows.value.filter((item) => item.payment_mode !== 'self_managed')
    const [statusEntries] = await Promise.all([
      Promise.allSettled(
        guaranteedRows.map((item) =>
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
  // 无担保模式（self_managed）不需要合同签署
  if (item.payment_mode === 'self_managed') {
    return false
  }
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
  return item.payment_mode === 'self_managed' ? '无电签约定' : '电签担保'
}

function requirementFieldHtml(value?: string | null): string {
  return sanitizeRequirementRichText(value ?? '') || '当前需求暂未补充详细描述。'
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
  if (!canOpenConversation(item)) {
    return
  }
  conversationRequirement.value = item
  conversationVisible.value = true
}

function isRequirementCompleted(item: RequirementItem) {
  return item.status === 'completed' || item.status === 'final_paid'
}

function canOpenConversation(item: RequirementItem) {
  return !isRequirementCompleted(item)
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
  if (isRequirementCompleted(item)) {
    return '需求已完成，会话已停用'
  }
  const conversation = conversationForRequirement(item)
  if (!conversation) {
    return '打开后创建会话'
  }
  return conversation.last_message_at ? `最近：${conversation.last_message_at}` : '暂无消息'
}

function isDescriptionExpanded(item: RequirementItem) {
  return Boolean(expandedRequirements.value[item.requirement_id])
}

function descriptionOverflow(item: RequirementItem) {
  return Boolean(descriptionOverflowMap.value[item.requirement_id])
}

function toggleDescription(item: RequirementItem) {
  expandedRequirements.value = {
    ...expandedRequirements.value,
    [item.requirement_id]: !isDescriptionExpanded(item),
  }
}

function setDescriptionRef(el: HTMLElement | null, item: RequirementItem) {
  if (!el) {
    delete descriptionEls.value[item.requirement_id]
    return
  }

  descriptionEls.value[item.requirement_id] = el
  void nextTick(() => {
    const target = descriptionEls.value[item.requirement_id]
    if (!target) {
      return
    }

    const overflows = target.scrollHeight > target.clientHeight + 2
    if (overflows !== Boolean(descriptionOverflowMap.value[item.requirement_id])) {
      descriptionOverflowMap.value = {
        ...descriptionOverflowMap.value,
        [item.requirement_id]: overflows,
      }
    }
  })
}

function canOpenContractSign(item: RequirementItem) {
  // 无担保模式（self_managed）不提供合同签署/查看入口
  if (item.payment_mode === 'self_managed') {
    return false
  }
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
    return '请先签署合同，待甲方也签署后进入开发流程'
  }
  return '等待甲方签署，双方签署完成后进入开发流程'
}

function openContractSign(item: RequirementItem) {
  router.push({
    name: 'contract-sign',
    query: { requirement_id: item.requirement_id, from: 'dev' },
  })
}

function canRequestUnbind(item: RequirementItem) {
  return (
    (item.status === 'in_development' || item.status === 'deposit_paid') &&
    !item.pending_unbind_request
  )
}

function unbindRequestHint(item: RequirementItem) {
  const request = item.pending_unbind_request
  if (!request) {
    return ''
  }

  if (request.status === 'pending') {
    return request.initiator === 'creator'
      ? '需求方申请解除，等待你确认'
      : '已提交解除申请，等待需求方确认'
  }

  if (request.status === 'approved') {
    return '解除申请已通过，需求已重新挂回大厅'
  }

  return '解除申请已被拒绝'
}

function openUnbindRequest(item: RequirementItem) {
  if (!canRequestUnbind(item)) {
    return
  }
  unbindRequirement.value = item
  unbindReason.value = ''
  unbindVisible.value = true
}

function closeUnbindRequest() {
  if (unbindLoading.value) {
    return
  }
  unbindVisible.value = false
  unbindRequirement.value = null
  unbindReason.value = ''
}

async function submitUnbindRequest() {
  const item = unbindRequirement.value
  if (!item) {
    return
  }

  const reason = unbindReason.value.trim()
  if (!reason) {
    showToast('请填写解除绑定的原因', 'warning')
    return
  }

  unbindLoading.value = true
  try {
    await requestUnbindRequirement(auth.token, item.requirement_id, reason)
    showToast('解除申请已提交，等待需求方确认', 'success')
    unbindVisible.value = false
    unbindRequirement.value = null
    unbindReason.value = ''
    await loadMyRequirements()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交解除申请失败', 'error')
  } finally {
    unbindLoading.value = false
  }
}

function hasPendingCreatorUnbindRequest(item: RequirementItem) {
  return item.pending_unbind_request?.status === 'pending' &&
    item.pending_unbind_request.initiator === 'creator'
}

function openUnbindRespond(item: RequirementItem) {
  if (!hasPendingCreatorUnbindRequest(item)) {
    return
  }
  unbindRespondRequirement.value = item
  unbindRespondVisible.value = true
}

function closeUnbindRespond() {
  if (unbindRespondLoading.value) {
    return
  }
  unbindRespondVisible.value = false
  unbindRespondRequirement.value = null
}

async function submitUnbindRespond(action: 'approve' | 'reject') {
  const item = unbindRespondRequirement.value
  if (!item) {
    return
  }

  unbindRespondLoading.value = true
  try {
    await respondUnbindRequirement(auth.token, item.requirement_id, action)
    showToast(action === 'approve' ? '已同意解除，需求已重新挂回大厅' : '已拒绝解除申请', 'success')
    unbindRespondVisible.value = false
    unbindRespondRequirement.value = null
    await loadMyRequirements()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '处理解除申请失败', 'error')
  } finally {
    unbindRespondLoading.value = false
  }
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

    <div class="dev-meta-strip">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">总需求单</span>
        <span class="dev-meta-strip__value">{{ rows.length }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">已关联资源</span>
        <span class="dev-meta-strip__value">{{ boundCount }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">开发中</span>
        <span class="dev-meta-strip__value">{{ activeCount }}</span>
      </div>
    </div>

    <el-card shadow="never" class="dev-surface-card dev-my-requirements-card">
      <div class="dev-my-requirements-list" v-loading="loading">
        <div v-if="rows.length === 0" class="dev-my-requirements-empty">{{ emptyText }}</div>
        <article v-for="item in rows" :key="item.requirement_id" class="dev-requirement-card">
          <header class="dev-requirement-card__head">
            <div class="dev-requirement-card__title-block">
              <span class="dev-requirement-hall__requirement-id">{{ item.requirement_id }}</span>
              <h3 class="dev-requirement-hall__title">{{ item.title }}</h3>
              <article class="dev-requirement-hall__desc dev-requirement-card__description"
                :class="{ 'is-collapsed': !isDescriptionExpanded(item) }"
                :ref="(el) => setDescriptionRef(el as HTMLElement | null, item)"
                v-html="requirementFieldHtml(item.description)"></article>
              <button v-if="isDescriptionExpanded(item) || descriptionOverflow(item)" type="button"
                class="dev-requirement-card__description-toggle" @click="toggleDescription(item)">
                <el-icon>
                  <ArrowUp v-if="isDescriptionExpanded(item)" />
                  <ArrowDown v-else />
                </el-icon>
                <span>{{ isDescriptionExpanded(item) ? '收起' : '展开' }}</span>
              </button>
            </div>
            <div class="dev-requirement-card__tags">
              <el-tag :type="displayStatusType(item)" effect="plain">{{ displayStatusLabel(item) }}</el-tag>
              <el-tag :type="item.payment_mode === 'self_managed' ? 'info' : 'warning'" effect="plain">
                {{ paymentModeLabel(item) }}
              </el-tag>
            </div>
          </header>

          <div class="dev-requirement-card__meta">
            <span class="dev-requirement-card__meta-item">
              <label>预算</label>
              <strong>{{ formatMoney(item.budget) }}</strong>
            </span>
            <span class="dev-requirement-card__meta-item">
              <label>资源关联</label>
              <strong>{{ resourceVisibilityLabel(item) }}</strong>
            </span>
            <span class="dev-requirement-card__meta-item">
              <label>最近更新</label>
              <strong>{{ item.updated_at }}</strong>
            </span>
            <span class="dev-requirement-card__meta-item">
              <label>会话</label>
              <strong>{{ conversationLoading ? '加载中' : conversationStatusLabel(item) }}</strong>
            </span>
          </div>

          <div class="dev-requirement-card__progress">
            <RequirementProgressGuide :requirement="item" :payment-mode="item.payment_mode" view="dev" />
          </div>

          <div v-if="item.payment_mode !== 'self_managed'" class="dev-requirement-card__signing">
            <div class="signing-status-bar">
              <span class="signing-step"
                :class="signingStatusMap[item.requirement_id]?.has_contract ? 'done' : 'pending'">
                协议已创建
              </span>
              <span class="signing-arrow">›</span>
              <span class="signing-step"
                :class="signingStatusMap[item.requirement_id]?.party_b_signed ? 'done' : 'pending'">
                乙方已签
              </span>
              <span class="signing-arrow">›</span>
              <span class="signing-step"
                :class="signingStatusMap[item.requirement_id]?.party_a_signed ? 'done' : 'pending'">
                甲方已签
              </span>
            </div>
            <div v-if="contractStartHint(item)" class="signing-start-hint">{{ contractStartHint(item) }}</div>
          </div>

          <footer class="dev-requirement-card__actions">
            <div class="dev-requirement-card__unbind">
              <span v-if="item.pending_unbind_request?.status === 'pending'" class="dev-requirement-card__unbind-hint">
                {{ unbindRequestHint(item) }}
              </span>
            </div>
            <div class="dev-requirement-card__buttons">
              <el-button v-if="canOpenContractSign(item)" size="small" @click="openContractSign(item)">
                {{ contractButtonLabel(item) }}
              </el-button>
              <el-button type="primary" plain size="small" class="dev-requirement-card__conversation"
                :disabled="!canOpenConversation(item)" @click="openConversation(item)">
                <el-icon><ChatDotRound /></el-icon>
                <span>会话</span>
              </el-button>
              <el-button v-if="hasPendingCreatorUnbindRequest(item)" type="warning" size="small"
                @click="openUnbindRespond(item)">处理解除申请</el-button>
              <el-button v-else-if="canRequestUnbind(item)" type="danger" plain size="small"
                @click="openUnbindRequest(item)">申请解除</el-button>
            </div>
          </footer>
        </article>
      </div>
    </el-card>

    <el-dialog v-model="unbindVisible" title="申请解除需求绑定" width="480px"
      :close-on-click-modal="false" :close-on-press-escape="false" @close="closeUnbindRequest">
      <div class="unbind-dialog-body">
        <p class="unbind-dialog-tip">
          解除后需求将重新挂回大厅，等待其他开发者承接。此操作需要需求方确认，请填写真实原因。
        </p>
        <el-input v-model="unbindReason" type="textarea" :rows="4" maxlength="1000" show-word-limit
          placeholder="请说明无法继续完成的原因，例如：与需求方沟通后确认技术方案无法实现" />
      </div>
      <template #footer>
        <el-button :disabled="unbindLoading" @click="closeUnbindRequest">取消</el-button>
        <el-button type="danger" :loading="unbindLoading" @click="submitUnbindRequest">提交申请</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="unbindRespondVisible" title="需求方申请解除绑定" width="480px"
      :close-on-click-modal="false" :close-on-press-escape="false" @close="closeUnbindRespond">
      <div class="unbind-dialog-body">
        <p class="unbind-dialog-tip">需求方申请解除绑定，请确认是否同意。</p>
        <p class="unbind-dialog-line">
          <strong>需求编号：</strong>{{ unbindRespondRequirement?.requirement_id }}
        </p>
        <p class="unbind-dialog-line">
          <strong>申请原因：</strong>{{ unbindRespondRequirement?.pending_unbind_request?.reason }}
        </p>
      </div>
      <template #footer>
        <el-button :disabled="unbindRespondLoading" @click="closeUnbindRespond">取消</el-button>
        <el-button type="danger" :disabled="unbindRespondLoading"
          @click="submitUnbindRespond('reject')">拒绝解除</el-button>
        <el-button type="primary" :loading="unbindRespondLoading"
          @click="submitUnbindRespond('approve')">同意解除</el-button>
      </template>
    </el-dialog>

    <RequirementConversationModal :visible="conversationVisible" api-mode="dev" :token="auth.token"
      :current-username="auth.username" :requirement-id="conversationRequirement?.requirement_id ?? ''"
      :title="conversationRequirement?.title" @updated="applyConversationDetail" @close="closeConversation" />
  </div>
</template>

<style scoped>
.dev-my-requirements-card {
  overflow: hidden;
}

.dev-my-requirements-list {
  display: grid;
  gap: 16px;
}

.dev-my-requirements-empty {
  padding: 40px 16px;
  text-align: center;
  color: var(--dev-muted);
  font-size: 14px;
}

.dev-requirement-card {
  display: grid;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 18px;
  background: #ffffff;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.dev-requirement-card:hover {
  border-color: rgba(42, 166, 164, 0.28);
  box-shadow: 0 12px 26px rgba(17, 24, 39, 0.06);
}

.dev-requirement-card__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.dev-requirement-card__title-block {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.dev-requirement-card__title-block .dev-requirement-hall__title {
  font-size: 17px;
}

.dev-requirement-card__description {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.dev-requirement-card__description :deep(p) {
  margin: 0 0 8px;
}

.dev-requirement-card__description :deep(p:last-child) {
  margin-bottom: 0;
}

.dev-requirement-card__description :deep(ul),
.dev-requirement-card__description :deep(ol) {
  margin: 0 0 8px;
  padding-left: 22px;
}

.dev-requirement-card__description :deep(blockquote) {
  margin: 8px 0;
  padding-left: 12px;
  border-left: 3px solid rgba(42, 166, 164, 0.35);
  color: var(--dev-ink);
}

.dev-requirement-card__description :deep(hr) {
  margin: 12px 0;
  border: 0;
  border-top: 1px solid rgba(17, 24, 39, 0.12);
}

.dev-requirement-card__description :deep(pre) {
  overflow-x: auto;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(17, 24, 39, 0.06);
  white-space: pre;
}

.dev-requirement-card__description.is-collapsed {
  max-height: 84px;
  overflow: hidden;
}

.dev-requirement-card__description-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #247f7d;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.dev-requirement-card__description-toggle:hover {
  color: #1f6f6d;
}

.dev-requirement-card__conversation {
  border-radius: 999px;
  font-weight: 700;
}

.dev-requirement-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

.dev-requirement-card__meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 12px 0;
  border-top: 1px dashed rgba(17, 24, 39, 0.08);
  border-bottom: 1px dashed rgba(17, 24, 39, 0.08);
}

.dev-requirement-card__meta-item {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.dev-requirement-card__meta-item label {
  font-size: 11px;
  font-weight: 600;
  color: var(--dev-muted);
}

.dev-requirement-card__meta-item strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--dev-ink);
  overflow-wrap: anywhere;
}

.dev-requirement-card__signing {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dev-requirement-card__actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 0;
  padding: 12px 0 0;
  border-top: 1px dashed rgba(17, 24, 39, 0.08);
  background: transparent;
  text-align: left;
}

.dev-requirement-card__unbind-hint {
  font-size: 12px;
  font-weight: 700;
  color: #b45309;
}

.dev-requirement-card__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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

.signing-start-hint {
  margin-top: 4px;
  color: #b45309;
  font-size: 12px;
  line-height: 1.5;
}

.unbind-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.unbind-dialog-tip {
  margin: 0;
  color: #b45309;
  font-size: 13px;
  line-height: 1.6;
}

.unbind-dialog-line {
  margin: 0;
  color: #303133;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .dev-requirement-card__head {
    flex-direction: column;
  }

  .dev-requirement-card__meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
