<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import {
  getProcessedTagTree,
  invalidateTagTreeCache,
  type McProcessedTagTree,
  type McPublishTagGroup,
  type McTagCatalogEntry,
  type McTagCatalogRoot,
} from '@dev/api/Tags'
import { getDevOrderDepositStatus, type DevOrderDepositStatus } from '@dev/api/devOrderDeposit'
import { getDevCreditSelf, type DevCreditSelf } from '@dev/api/devCredit'
import { createMcResource, listMcResources, type McResourcePayload } from '@dev/api/mcResources'
import { bindRequirementProject, listRequirementHall, type RequirementItem } from '@dev/api/requirements'
import { useToast } from '@dev/composables/useToast'
import { useAuthStore } from '@dev/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)
const depositLoading = ref(false)
const binding = ref(false)
const bindDialogVisible = ref(false)
const bindingMode = ref<'existing' | 'new'>('existing')
const rows = ref<RequirementItem[]>([])
const resources = ref<McResourcePayload[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const selectedRequirement = ref<RequirementItem | null>(null)
const reviewConfirmed = ref(false)
const finalConfirmed = ref(false)
const depositStatus = ref<DevOrderDepositStatus | null>(null)
const creditInfo = ref<DevCreditSelf | null>(null)
const processedTree = ref<McProcessedTagTree>({ roots: [] })
const initTagsLoading = ref(false)
const currentRootKey = ref('')
const currentEntryKey = ref('')

const filters = reactive({
  keyword: '',
  sortBy: 'updated_at' as 'created_time' | 'updated_at' | 'budget',
  sortOrder: 'desc' as 'asc' | 'desc',
})

const bindForm = reactive({
  resourceId: undefined as number | undefined,
})

const initForm = reactive({
  title: '',
  author: '',
})

const selectedTagIdsByGroup = reactive<Record<number, number[]>>({})

const sortOptions = [
  { value: 'updated_at', label: '最近更新' },
  { value: 'created_time', label: '创建时间' },
  { value: 'budget', label: '预算' },
]

const emptyText = computed(() => {
  if (loading.value) {
    return '资源关联加载中'
  }

  return '当前没有可接的待关联需求'
})
const currentPageCount = computed(() => rows.value.length)
const availableResourceOptions = computed(() =>
  resources.value.filter((item) => !item.requirement_id && item.visibility === 'draft'),
)
const hasPendingBindableResources = computed(() =>
  resources.value.some((item) => !item.requirement_id && item.visibility !== 'draft'),
)
const selectedResource = computed(() => availableResourceOptions.value.find((item) => item.id === bindForm.resourceId) ?? null)
const canTakeOrders = computed(() => depositStatus.value?.can_bind_requirement ?? false)
const availableDepositText = computed(() => `¥${(depositStatus.value?.available_cny ?? 0).toFixed(2)}`)
const frozenDepositText = computed(() => `¥${(depositStatus.value?.frozen_cny ?? 0).toFixed(2)}`)
const orderCreditCap = computed(() => {
  if (!creditInfo.value || !creditInfo.value.enforce_order_limit) return Number.POSITIVE_INFINITY
  return creditInfo.value.max_order_amount_cny
})
function isBudgetWithinCap(budget?: number | null) {
  return (budget ?? 0) <= orderCreditCap.value + 0.0001
}

function isSelfManagedRequirement(requirement: RequirementItem) {
  return requirement.payment_mode === 'self_managed'
}

function paymentModeLabel(requirement: RequirementItem) {
  return isSelfManagedRequirement(requirement) ? '无平台担保' : '平台担保'
}

function requiresDepositGate(requirement: RequirementItem) {
  return !isSelfManagedRequirement(requirement)
}

function bindButtonLabel(requirement: RequirementItem) {
  if (!requiresDepositGate(requirement)) {
    return '关联需求'
  }

  if (!canTakeOrders.value || (requirement.budget ?? 0) > (depositStatus.value?.available_cny ?? 0)) {
    return '保证金不足'
  }

  if (!isBudgetWithinCap(requirement.budget)) {
    return '信用不足'
  }

  return '关联需求'
}
const rootTabs = computed<McTagCatalogRoot[]>(() => processedTree.value.roots)
const currentRoot = computed<McTagCatalogRoot | null>(() =>
  rootTabs.value.find((item) => item.key === currentRootKey.value) ?? rootTabs.value[0] ?? null,
)
const entryTabs = computed<McTagCatalogEntry[]>(() => currentRoot.value?.entries ?? [])
const currentEntry = computed<McTagCatalogEntry | null>(() =>
  entryTabs.value.find((item) => item.key === currentEntryKey.value) ?? entryTabs.value[0] ?? null,
)
const currentPlatform = computed(() => currentEntry.value?.platform ?? '')
const currentEntryLabel = computed(() => currentEntry.value?.group_name ?? '当前分区')
const currentPlatformLabel = computed(() => currentPlatform.value || '当前平台')
const platformTagGroups = computed<McPublishTagGroup[]>(() => currentEntry.value?.publish_groups ?? [])
const selectedTagCount = computed(() => Object.values(selectedTagIdsByGroup).reduce((sum, ids) => sum + ids.length, 0))
const initSummary = computed(() => {
  if (!initForm.title.trim()) {
    return ''
  }

  return `${currentEntryLabel.value} · ${currentPlatformLabel.value} 资源项目，已选 ${selectedTagCount.value} 个标签。`
})
const createBlockReason = computed(() => {
  if (!initForm.title.trim()) {
    return '请填写资源标题'
  }

  if (!initForm.author.trim()) {
    return '请填写作者名称'
  }

  if (platformTagGroups.value.length === 0) {
    return '当前分类下暂无可用标签，请切换分类或刷新标签'
  }

  if (selectedTagCount.value === 0) {
    return '请至少选择一个标签'
  }

  return ''
})
const canCreateResource = computed(() => !createBlockReason.value)
const confirmResourceLabel = computed(() => {
  if (bindingMode.value === 'existing') {
    return selectedResource.value?.title ?? '未选择资源'
  }

  return initForm.title.trim() || '待初始化的新资源项目'
})

onMounted(async () => {
  auth.hydrate()
  if (!initForm.author.trim()) {
    initForm.author = auth.username || ''
  }
  await Promise.all([loadRequirements(), loadDepositStatus()])
})

watch(
  () => auth.username,
  (username) => {
    if (!initForm.author.trim() && username) {
      initForm.author = username
    }
  },
  { immediate: true },
)

watch(platformTagGroups, (groups) => {
  const validGroupIds = new Set(groups.map((group) => group.group_id))

  for (const key of Object.keys(selectedTagIdsByGroup)) {
    const groupId = Number(key)
    if (!validGroupIds.has(groupId)) {
      delete selectedTagIdsByGroup[groupId]
      continue
    }

    const group = groups.find((item) => item.group_id === groupId)
    if (!group) {
      continue
    }

    const validTagIds = new Set(group.items.map((item) => item.id))
    selectedTagIdsByGroup[groupId] = (selectedTagIdsByGroup[groupId] ?? []).filter((tagId) => validTagIds.has(tagId))
  }

  for (const group of groups) {
    if (!selectedTagIdsByGroup[group.group_id]) {
      selectedTagIdsByGroup[group.group_id] = []
    }
  }
}, { immediate: true })

function formatMoney(value?: number | null): string {
  if (value == null) {
    return '待议价'
  }

  return `¥${value}`
}

async function loadRequirements() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  loading.value = true
  try {
    const payload = await listRequirementHall(auth.token, {
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    })
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载资源关联列表失败'
    showToast(message, 'error')
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function loadDepositStatus() {
  if (!auth.token) {
    return
  }

  depositLoading.value = true
  try {
    const [status, credit] = await Promise.all([
      getDevOrderDepositStatus(auth.token),
      getDevCreditSelf(auth.token).catch(() => null),
    ])
    depositStatus.value = status
    creditInfo.value = credit
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载接单保证金状态失败'
    showToast(message, 'error')
    depositStatus.value = null
  } finally {
    depositLoading.value = false
  }
}

async function refreshHall() {
  await Promise.all([loadRequirements(), loadDepositStatus()])
}

async function applyFilters() {
  page.value = 1
  await loadRequirements()
}

async function resetFilters() {
  filters.keyword = ''
  filters.sortBy = 'updated_at'
  filters.sortOrder = 'desc'
  page.value = 1
  pageSize.value = 10
  await loadRequirements()
}

async function openBindDialog(requirement: RequirementItem) {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (requiresDepositGate(requirement) && !canTakeOrders.value) {
    showToast('当前可用保证金不足，请先补充保证金后再关联需求', 'warning')
    void router.push('/dev/wallet/order-deposit')
    return
  }

  if (requiresDepositGate(requirement) && (requirement.budget ?? 0) > (depositStatus.value?.available_cny ?? 0)) {
    showToast('当前需求预算高于可用保证金，请先补充保证金', 'warning')
    void router.push('/dev/wallet/order-deposit')
    return
  }

  if (requiresDepositGate(requirement) && !isBudgetWithinCap(requirement.budget)) {
    showToast(`当前信用最高可接 ¥${orderCreditCap.value.toFixed(2)} 的需求，无法绑定此预算`, 'warning')
    return
  }

  try {
    const payload = await listMcResources(auth.token)
    resources.value = payload
    selectedRequirement.value = requirement
    bindForm.resourceId = undefined
    resetInitForm()
    reviewConfirmed.value = false
    finalConfirmed.value = false
    bindingMode.value = availableResourceOptions.value.length > 0 ? 'existing' : 'new'
    bindDialogVisible.value = true

    if (bindingMode.value === 'new') {
      await ensureTagTreeLoaded()
      showToast('当前没有可直接关联的私有资源，可先初始化一个新资源项目再完成绑定', 'info')
    } else if (availableResourceOptions.value.length === 0 && hasPendingBindableResources.value) {
      showToast('当前没有可关联的私有资源。只有私有且未绑定的资源才能关联需求', 'warning')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载项目列表失败'
    showToast(message, 'error')
  }
}

async function submitBinding() {
  if (!auth.token || !selectedRequirement.value) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (!reviewConfirmed.value) {
    showToast('请先完整阅读需求信息，并确认已审阅后再继续', 'warning')
    return
  }

  if (!finalConfirmed.value) {
    showToast('请完成二次确认后再关联需求', 'warning')
    return
  }

  binding.value = true
  try {
    let resourceId = bindForm.resourceId
    let createdResourceTitle = ''

    if (bindingMode.value === 'existing') {
      if (!resourceId) {
        showToast('请选择要绑定的开发项目', 'warning')
        return
      }

      if (!selectedResource.value) {
        showToast('所选开发项目不可用，请重新选择', 'warning')
        return
      }
    } else {
      if (!canCreateResource.value) {
        showToast(createBlockReason.value || '请先补全资源初始化信息', 'warning')
        return
      }

      const created = await createMcResource(auth.token, {
        platform: currentPlatform.value,
        title: initForm.title.trim(),
        author: initForm.author.trim(),
        description: initSummary.value,
        tag_selections: buildTagSelections(),
        file_name: buildDerivedFileName(),
        source_url: buildDerivedSourceUrl(),
        cover_url: null,
        docs_url: null,
        visibility: 'draft',
        release_note: null,
      })

      resourceId = created.id
      createdResourceTitle = created.title
      resources.value = [created, ...resources.value]
    }

    await bindRequirementProject(auth.token, selectedRequirement.value.requirement_id, resourceId!)
    bindDialogVisible.value = false
    showToast(createdResourceTitle ? `已初始化资源“${createdResourceTitle}”，并完成需求关联` : '需求已关联到开发项目，并进入开发中', 'success')
    await loadRequirements()
    resources.value = []
    selectedRequirement.value = null
    resetInitForm()
  } catch (error) {
    const message = error instanceof Error ? error.message : '关联需求失败'
    showToast(message, 'error')
  } finally {
    binding.value = false
  }
}

function goToOrderDeposit() {
  void router.push('/dev/wallet/order-deposit')
}

function projectOptionLabel(resource: McResourcePayload): string {
  return `${resource.title} · ${resource.author}`
}

function requirementFieldValue(value?: string | null, fallback = '未填写') {
  const normalized = value?.trim()
  return normalized ? normalized : fallback
}

function handleResourceChange() {
  finalConfirmed.value = false
}

function handleBindingModeChange(mode: 'existing' | 'new') {
  if (bindingMode.value === mode) {
    return
  }

  bindingMode.value = mode
  finalConfirmed.value = false

  if (mode === 'new') {
    bindForm.resourceId = undefined
    void ensureTagTreeLoaded()
  }
}

function handleReviewChange() {
  if (!reviewConfirmed.value) {
    finalConfirmed.value = false
  }
}

function handleInitFieldChange() {
  finalConfirmed.value = false
}

async function ensureTagTreeLoaded() {
  if (processedTree.value.roots.length > 0) {
    return
  }

  await loadTagTree()
}

async function loadTagTree() {
  initTagsLoading.value = true
  try {
    invalidateTagTreeCache()
    processedTree.value = await getProcessedTagTree()

    const firstRoot = processedTree.value.roots[0]
    if (firstRoot && !processedTree.value.roots.some((item) => item.key === currentRootKey.value)) {
      currentRootKey.value = firstRoot.key
      currentEntryKey.value = firstRoot.first_entry_key ?? ''
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载标签失败'
    showToast(message, 'error')
  } finally {
    initTagsLoading.value = false
  }
}

function openRoot(rootKey: string, firstEntryKey: string | null) {
  if (rootKey === currentRootKey.value) {
    return
  }

  currentRootKey.value = rootKey
  currentEntryKey.value = firstEntryKey ?? ''
  finalConfirmed.value = false
}

function openEntry(entryKey: string) {
  if (entryKey === currentEntryKey.value) {
    return
  }

  currentEntryKey.value = entryKey
  finalConfirmed.value = false
}

function selectedNamesForGroup(group: McPublishTagGroup): string[] {
  const selectedIds = new Set(selectedTagIdsByGroup[group.group_id] ?? [])
  return group.items.filter((item) => selectedIds.has(item.id)).map((item) => item.name)
}

function buildTagSelections() {
  return platformTagGroups.value
    .map((group) => ({
      group_id: group.group_id,
      tag_ids: [...(selectedTagIdsByGroup[group.group_id] ?? [])],
    }))
    .filter((selection) => selection.tag_ids.length > 0)
}

function buildDerivedFileName() {
  const normalizedTitle = initForm.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'resource'

  return `${normalizedTitle}.package`
}

function buildDerivedSourceUrl() {
  const normalizedTitle = initForm.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'resource'

  return `pending://resource/${currentPlatform.value}/${currentEntryKey.value || 'catalog'}/${normalizedTitle}`
}

function resetInitForm() {
  initForm.title = ''
  initForm.author = auth.username || ''

  for (const key of Object.keys(selectedTagIdsByGroup)) {
    selectedTagIdsByGroup[Number(key)] = []
  }
}

async function handlePageChange(nextPage: number) {
  page.value = nextPage
  await loadRequirements()
}

async function handleSizeChange(nextSize: number) {
  pageSize.value = nextSize
  page.value = 1
  await loadRequirements()
}
</script>

<template>
  <div class="dev-page dev-page--requirement-hall">

    <el-alert v-if="!canTakeOrders" title="平台担保需求需要可用保证金，无平台担保需求仍可继续关联" type="warning" show-icon :closable="false"
      class="dev-requirement-hall__deposit-alert">
      <template #default>
        <div class="dev-requirement-hall__deposit-copy">
          <span>当前可用保证金：{{ availableDepositText }}</span>
          <span v-if="depositStatus?.frozen_cny">当前已冻结：{{ frozenDepositText }}</span>
          <span v-if="depositStatus?.latest_order">最近订单状态：{{ depositStatus.latest_order.status }}</span>
        </div>
        <el-button type="primary" size="small" @click="goToOrderDeposit">去缴纳保证金</el-button>
      </template>
    </el-alert>

    <div class="dev-grid dev-grid--three">
      <el-card shadow="never" class="dev-surface-card dev-surface-card--soft">
        <div class="dev-stat dev-stat--compact">
          <span class="dev-stat__label">当前命中</span>
          <span class="dev-stat__value">{{ total }}</span>
          <span class="dev-stat__hint">按当前筛选条件统计的需求总数</span>
        </div>
      </el-card>
      <el-card shadow="never" class="dev-surface-card dev-surface-card--soft">
        <div class="dev-stat dev-stat--compact">
          <span class="dev-stat__label">当前页</span>
          <span class="dev-stat__value">{{ currentPageCount }}</span>
          <span class="dev-stat__hint">当前分页内尚未关联资源的需求数量</span>
        </div>
      </el-card>
      <el-card shadow="never" class="dev-surface-card dev-surface-card--soft">
        <div class="dev-stat dev-stat--compact">
          <span class="dev-stat__label">处理规则</span>
          <span class="dev-stat__value">1:1</span>
          <span class="dev-stat__hint">一个需求只能绑定一个开发项目</span>
        </div>
      </el-card>
    </div>

    <el-card shadow="never" class="dev-surface-card">
      <el-alert title="平台担保需求按定金与尾款推进；无平台担保需求仅使用平台协作流程" type="warning" show-icon :closable="false"
        class="dev-requirement-hall__deposit-alert" />

      <div class="dev-requirement-hall__filters">
        <el-select v-model="filters.sortBy" placeholder="排序字段" class="dev-requirement-hall__field"
          @change="applyFilters">
          <el-option v-for="item in sortOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>

        <el-select v-model="filters.sortOrder" placeholder="排序方向"
          class="dev-requirement-hall__field dev-requirement-hall__field--small" @change="applyFilters">
          <el-option label="降序" value="desc" />
          <el-option label="升序" value="asc" />
        </el-select>

        <el-input v-model="filters.keyword" clearable placeholder="搜索需求编号、标题或描述" class="dev-requirement-hall__search"
          @keyup.enter="applyFilters" />

        <div class="dev-requirement-hall__actions">
          <el-button @click="resetFilters">重置</el-button>
          <el-button type="primary" :loading="loading" @click="applyFilters">查询</el-button>
        </div>
      </div>

      <el-table :data="rows" stripe v-loading="loading" class="dev-release-table dev-requirement-hall__table"
        :empty-text="emptyText">
        <el-table-column label="需求" min-width="360">
          <template #default="scope">
            <div class="dev-requirement-hall__title-cell">
              <div class="dev-requirement-hall__requirement-id">{{ scope.row.requirement_id }}</div>
              <div class="dev-requirement-hall__title">{{ scope.row.title }}</div>
              <div class="dev-requirement-hall__desc">{{ scope.row.description || '暂无补充描述' }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="creator" label="发起人" min-width="140" />
        <el-table-column label="预算" min-width="120">
          <template #default="scope">
            <span>{{ formatMoney(scope.row.budget) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="发布方式" width="130">
          <template #default="scope">
            <el-tag :type="isSelfManagedRequirement(scope.row) ? 'info' : 'warning'" effect="plain">
              {{ paymentModeLabel(scope.row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="140">
          <template #default>
            <el-tag type="success" effect="plain">待开发</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="updated_at" label="最近更新" min-width="180" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="scope">
            <el-button type="primary" plain class="dev-requirement-hall__bind-button"
              @click="openBindDialog(scope.row)">
              {{ bindButtonLabel(scope.row) }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="dev-requirement-hall__footer">
        <el-pagination background layout="total, sizes, prev, pager, next" :current-page="page" :page-size="pageSize"
          :page-sizes="[10, 20, 50]" :total="total" @current-change="handlePageChange"
          @size-change="handleSizeChange" />
      </div>
    </el-card>

    <el-dialog v-model="bindDialogVisible" width="720px"
      :title="selectedRequirement ? `关联需求 · ${selectedRequirement.title}` : '关联需求'">
      <div class="dev-requirement-hall__dialog-copy">
        <p class="dev-section-desc">关联前请先阅读需求标题、需求描述、预算与验收标准，确认资源匹配后再继续。</p>
      </div>

      <section v-if="selectedRequirement" class="dev-requirement-hall__review-panel">
        <div class="dev-requirement-hall__review-item">
          <span class="dev-requirement-hall__review-label">需求标题</span>
          <div class="dev-requirement-hall__review-value">{{ selectedRequirement.title }}</div>
        </div>
        <div class="dev-requirement-hall__review-item">
          <span class="dev-requirement-hall__review-label">需求描述</span>
          <div class="dev-requirement-hall__review-value dev-requirement-hall__review-value--multiline">
            {{ requirementFieldValue(selectedRequirement.description, '暂无需求描述') }}
          </div>
        </div>
        <div class="dev-requirement-hall__review-grid">
          <div class="dev-requirement-hall__review-item">
            <span class="dev-requirement-hall__review-label">预算</span>
            <div class="dev-requirement-hall__review-value">{{ formatMoney(selectedRequirement.budget) }}</div>
          </div>
          <div class="dev-requirement-hall__review-item">
            <span class="dev-requirement-hall__review-label">验收标准</span>
            <div class="dev-requirement-hall__review-value dev-requirement-hall__review-value--multiline">
              {{ requirementFieldValue(selectedRequirement.acceptance_criteria, '暂无验收标准') }}
            </div>
          </div>
        </div>
      </section>

      <el-form label-position="top">
        <el-form-item label="关联方式" required>
          <div class="dev-requirement-hall__mode-switch">
            <button type="button" class="dev-requirement-hall__mode-button"
              :class="{ 'is-active': bindingMode === 'existing' }" @click="handleBindingModeChange('existing')">
              关联已有资源项目
            </button>
            <button type="button" class="dev-requirement-hall__mode-button"
              :class="{ 'is-active': bindingMode === 'new' }" @click="handleBindingModeChange('new')">
              初始化新资源项目
            </button>
          </div>
        </el-form-item>

        <template v-if="bindingMode === 'existing'">
          <el-form-item label="选择开发项目" required>
            <el-select v-model="bindForm.resourceId" placeholder="请选择一个未绑定且保持私有的开发项目"
              class="dev-requirement-hall__dialog-field" @change="handleResourceChange">
              <el-option v-for="item in availableResourceOptions" :key="item.id" :label="projectOptionLabel(item)"
                :value="item.id" />
            </el-select>
          </el-form-item>

          <p v-if="availableResourceOptions.length === 0" class="dev-empty-state dev-requirement-hall__dialog-empty">
            当前没有可直接绑定的私有资源项目。你可以切换到“初始化新资源项目”，先创建一个私有项目后再继续关联。
          </p>
        </template>

        <template v-else>
          <section class="dev-requirement-hall__init-panel">
            <div class="dev-requirement-hall__init-copy">
              <p class="dev-section-desc">如果当前没有合适的资源项目，可以先初始化一个新的私有资源。创建完成后会直接用于本次需求关联。</p>
            </div>

            <div class="dev-upload-grid dev-upload-grid--two">
              <el-form-item label="资源标题" required>
                <el-input v-model="initForm.title" maxlength="200" show-word-limit
                  placeholder="例如 Better Combat Reloaded" @input="handleInitFieldChange" />
              </el-form-item>

              <el-form-item label="作者名称" required>
                <el-input v-model="initForm.author" maxlength="100" placeholder="默认使用当前开发者账号"
                  @input="handleInitFieldChange" />
              </el-form-item>
            </div>

            <section v-if="rootTabs.length > 0" class="dev-requirement-hall__catalog-block">
              <div class="dev-requirement-hall__catalog-head">
                <span class="dev-filter-label">一级分类</span>
                <el-button text size="small" :loading="initTagsLoading" @click="loadTagTree">刷新标签</el-button>
              </div>
              <div class="dev-requirement-hall__catalog-chips">
                <button v-for="root in rootTabs" :key="root.key" type="button"
                  class="dev-requirement-hall__catalog-chip" :class="{ 'is-active': root.key === currentRootKey }"
                  @click="openRoot(root.key, root.first_entry_key)">
                  {{ root.label }}
                </button>
              </div>
            </section>

            <section v-if="entryTabs.length > 0" class="dev-requirement-hall__catalog-block">
              <div class="dev-requirement-hall__catalog-head">
                <span class="dev-filter-label">二级分类</span>
                <span class="dev-section-desc">当前：{{ currentEntryLabel }}</span>
              </div>
              <div class="dev-requirement-hall__catalog-chips">
                <button v-for="entry in entryTabs" :key="entry.key" type="button"
                  class="dev-requirement-hall__catalog-chip dev-requirement-hall__catalog-chip--secondary"
                  :class="{ 'is-active': entry.key === currentEntryKey }" @click="openEntry(entry.key)">
                  {{ entry.group_name }}
                </button>
              </div>
            </section>

            <div v-if="platformTagGroups.length > 0" class="dev-requirement-hall__tag-groups">
              <section v-for="group in platformTagGroups" :key="group.key" class="dev-requirement-hall__tag-group">
                <div class="dev-requirement-hall__tag-group-head">
                  <div>
                    <h4 class="dev-requirement-hall__tag-group-title">{{ group.group_name }}</h4>
                    <p class="dev-requirement-hall__tag-group-path">{{ group.label }}</p>
                  </div>
                  <span class="dev-requirement-hall__tag-group-count">{{ (selectedTagIdsByGroup[group.group_id] ??
                    []).length }}/{{ group.items.length }}</span>
                </div>

                <div class="dev-requirement-hall__tag-group-selected">
                  <template v-if="selectedNamesForGroup(group).length > 0">
                    <span v-for="name in selectedNamesForGroup(group)" :key="`${group.key}:${name}`"
                      class="dev-chip dev-chip--cyan">{{ name }}</span>
                  </template>
                  <span v-else class="dev-requirement-hall__tag-group-empty">尚未选择标签</span>
                </div>

                <el-select v-model="selectedTagIdsByGroup[group.group_id]" multiple filterable placeholder="选择一个或多个标签"
                  class="dev-requirement-hall__dialog-field" @change="handleInitFieldChange">
                  <el-option v-for="item in group.items" :key="item.id" :label="item.name" :value="item.id" />
                </el-select>
              </section>
            </div>

            <p v-else class="dev-empty-state dev-requirement-hall__dialog-empty">
              当前分类下暂无可初始化资源的标签数据，请切换分类或刷新标签后重试。
            </p>
          </section>
        </template>

        <el-form-item required>
          <el-checkbox v-model="reviewConfirmed" @change="handleReviewChange">
            我已详细阅读需求标题、需求描述、预算、验收标准，并确认当前资源方案适合关联此需求
          </el-checkbox>
        </el-form-item>
      </el-form>

      <section v-if="selectedRequirement && (bindingMode === 'new' || selectedResource)"
        class="dev-requirement-hall__confirm-panel">
        <div class="dev-requirement-hall__confirm-head">
          <span class="dev-requirement-hall__confirm-title">二次确认</span>
          <span class="dev-requirement-hall__confirm-meta">需求将进入开发中且不可重复绑定</span>
        </div>
        <p class="dev-requirement-hall__confirm-text">
          当前将关联需求“{{ selectedRequirement.title }}”到资源“{{ confirmResourceLabel }}”。请确认资源能力、预算范围与验收标准均已匹配。
        </p>
        <el-checkbox v-model="finalConfirmed" :disabled="!reviewConfirmed">
          我确认本次关联无误，允许将该需求正式绑定到当前资源方案
        </el-checkbox>
      </section>

      <p v-if="bindingMode === 'existing' && availableResourceOptions.length === 0"
        class="dev-empty-state dev-requirement-hall__dialog-empty">
        当前没有可绑定的开发项目。只有未绑定且保持私有的资源才能关联需求；如果资源已提交公开审核或已经公开，请先改回私有。
      </p>

      <p v-if="bindingMode === 'new' && createBlockReason" class="dev-empty-state dev-requirement-hall__dialog-empty">
        {{ createBlockReason }}
      </p>

      <template #footer>
        <el-button @click="bindDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="binding"
          :disabled="bindingMode === 'existing' ? (!availableResourceOptions.length || !reviewConfirmed || !finalConfirmed || !bindForm.resourceId) : (!reviewConfirmed || !finalConfirmed || !canCreateResource)"
          @click="submitBinding">
          {{ bindingMode === 'existing' ? '确认关联' : '初始化并关联' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dev-requirement-hall__mode-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

.dev-requirement-hall__mode-button {
  appearance: none;
  border: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(255, 255, 255, 0.82);
  color: var(--dev-ink);
  border-radius: 16px;
  padding: 12px 14px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.dev-requirement-hall__mode-button:hover {
  transform: translateY(-1px);
  border-color: rgba(31, 74, 209, 0.18);
}

.dev-requirement-hall__mode-button.is-active {
  border-color: rgba(31, 74, 209, 0.26);
  background: linear-gradient(135deg, rgba(31, 74, 209, 0.1), rgba(42, 166, 164, 0.1));
  color: var(--dev-blue);
  box-shadow: 0 10px 20px rgba(31, 74, 209, 0.08);
}

.dev-requirement-hall__init-panel {
  display: grid;
  gap: 16px;
}

.dev-requirement-hall__init-copy {
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.58);
  border: 1px solid rgba(17, 24, 39, 0.06);
}

.dev-requirement-hall__catalog-block {
  display: grid;
  gap: 10px;
}

.dev-requirement-hall__catalog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dev-requirement-hall__catalog-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.dev-requirement-hall__catalog-chip {
  appearance: none;
  border: 1px solid rgba(31, 74, 209, 0.12);
  background: rgba(255, 255, 255, 0.9);
  color: rgba(17, 24, 39, 0.78);
  border-radius: 999px;
  padding: 8px 14px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.dev-requirement-hall__catalog-chip.is-active {
  border-color: rgba(31, 74, 209, 0.28);
  background: linear-gradient(180deg, rgba(31, 74, 209, 0.1), rgba(42, 166, 164, 0.1));
  color: var(--dev-blue);
  box-shadow: 0 8px 18px rgba(31, 74, 209, 0.12);
}

.dev-requirement-hall__catalog-chip--secondary {
  font-weight: 600;
}

.dev-requirement-hall__tag-groups {
  display: grid;
  gap: 12px;
}

.dev-requirement-hall__tag-group {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(17, 24, 39, 0.06);
  background: rgba(255, 255, 255, 0.6);
}

.dev-requirement-hall__tag-group-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.dev-requirement-hall__tag-group-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--dev-ink);
}

.dev-requirement-hall__tag-group-path {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--dev-muted);
}

.dev-requirement-hall__tag-group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.05);
  font-size: 10px;
  font-weight: 700;
  color: rgba(17, 24, 39, 0.62);
}

.dev-requirement-hall__tag-group-selected {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dev-requirement-hall__tag-group-empty {
  font-size: 12px;
  color: var(--dev-muted);
}

@media (max-width: 720px) {
  .dev-requirement-hall__mode-switch {
    grid-template-columns: 1fr;
  }
}
</style>
