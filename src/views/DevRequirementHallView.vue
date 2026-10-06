<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getProcessedTagTree,
  invalidateTagTreeCache,
  type McProcessedTagTree,
  type McPublishTagGroup,
  type McTagCatalogEntry,
  type McTagCatalogRoot,
} from '@/api/resourceTags'
import { getDevOrderDepositStatus, type DevOrderDepositStatus } from '@/api/devOrderDeposit'
import { getDevCreditSelf, type DevCreditSelf } from '@/api/devCredit'
import { getDevAccessStatus } from '@/api/auth'
import { createMcResource, type McResourcePayload } from '@/api/mcResources'
import {
  bindRequirementProject,
  listRequirementHall,
  type RequirementItem,
} from '@/api/devRequirements'
import PaymentModeChip from '@/components/PaymentModeChip.vue'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import { formatCnDateTime } from '@/shared/requirementDisplay'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import {
  requirementRichTextPreview,
  sanitizeRequirementRichText,
} from '@/utils/requirementRichText'


import {
  TButton,
  TCard,
  TCheckbox,
  TDialog,
  TForm,
  TFormItem,
  TIcon,
  TInput,
  TOption,
  TPagination,
  TSelect,
  TTable,
  TTableColumn,
  TTag,
  Refresh,
  RefreshLeft,
  Search,
  WarningFilled,
} from 'ui_73info'

const auth = useAuthStore()
const route = useRoute()
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
const developerAgreementSigned = ref(false)
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

const requirementPreviewMaxLength = 120

const emptyText = computed(() => {
  if (loading.value) {
    return '资源关联加载中'
  }

  return '当前没有可接的待关联需求'
})
/* 本页走服务端分页，条数口径只有 total 一处；
   原先还留着一个「当前页行数」的 computed，改服务端分页后没人再用，已删。 */
const selfManagedCount = computed(
  () => rows.value.filter((item) => isSelfManagedRequirement(item)).length,
)
const guaranteeCount = computed(
  () => rows.value.filter((item) => !isSelfManagedRequirement(item)).length,
)
const availableResourceOptions = computed(() =>
  resources.value.filter((item) => !item.requirement_id && item.visibility === 'draft'),
)
const selectedResource = computed(
  () => availableResourceOptions.value.find((item) => item.id === bindForm.resourceId) ?? null,
)
const canTakeOrders = computed(() => depositStatus.value?.can_bind_requirement ?? false)
const availableDepositText = computed(
  () => `¥${(depositStatus.value?.available_cny ?? 0).toFixed(2)}`,
)
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

function requiresDepositGate(requirement: RequirementItem) {
  return !isSelfManagedRequirement(requirement)
}

function bindButtonLabel(requirement: RequirementItem) {
  if (!requiresDepositGate(requirement)) {
    return '接单'
  }

  if (!developerAgreementSigned.value) {
    return '需先签署协议'
  }

  if (
    !canTakeOrders.value ||
    (requirement.budget ?? 0) > (depositStatus.value?.available_cny ?? 0)
  ) {
    return '保证金不足'
  }

  if (!isBudgetWithinCap(requirement.budget)) {
    return '信用不足'
  }

  return '接单'
}
const rootTabs = computed<McTagCatalogRoot[]>(() => processedTree.value.roots)
const currentRoot = computed<McTagCatalogRoot | null>(
  () =>
    rootTabs.value.find((item) => item.key === currentRootKey.value) ?? rootTabs.value[0] ?? null,
)
const entryTabs = computed<McTagCatalogEntry[]>(() => currentRoot.value?.entries ?? [])
const currentEntry = computed<McTagCatalogEntry | null>(
  () =>
    entryTabs.value.find((item) => item.key === currentEntryKey.value) ??
    entryTabs.value[0] ??
    null,
)
const currentPlatform = computed(() => currentEntry.value?.platform ?? '')
const currentEntryLabel = computed(() => currentEntry.value?.group_name ?? '当前分区')
const currentPlatformLabel = computed(() => currentPlatform.value || '当前平台')
const platformTagGroups = computed<McPublishTagGroup[]>(
  () => currentEntry.value?.publish_groups ?? [],
)
const selectedTagCount = computed(() =>
  Object.values(selectedTagIdsByGroup).reduce((sum, ids) => sum + ids.length, 0),
)
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
  syncKeywordFromRoute()
  if (!initForm.author.trim()) {
    initForm.author = auth.username || ''
  }
  await Promise.all([loadRequirements(), loadDepositStatus()])
})

watch(
  () => route.query.keyword,
  (value) => {
    const nextKeyword = routeKeyword(value)
    if (nextKeyword === filters.keyword) {
      return
    }

    filters.keyword = nextKeyword
    page.value = 1

    if (auth.token) {
      void loadRequirements()
    }
  },
)

watch(
  () => auth.username,
  (username) => {
    if (!initForm.author.trim() && username) {
      initForm.author = username
    }
  },
  { immediate: true },
)

watch(
  platformTagGroups,
  (groups) => {
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
      selectedTagIdsByGroup[groupId] = (selectedTagIdsByGroup[groupId] ?? []).filter((tagId) =>
        validTagIds.has(tagId),
      )
    }

    for (const group of groups) {
      if (!selectedTagIdsByGroup[group.group_id]) {
        selectedTagIdsByGroup[group.group_id] = []
      }
    }
  },
  { immediate: true },
)

function formatMoney(value?: number | null): string {
  if (value == null) {
    return '待议价'
  }

  return `¥${value}`
}

function routeKeyword(value = route.query.keyword): string {
  return typeof value === 'string' ? value.trim() : ''
}

function syncKeywordFromRoute() {
  const nextKeyword = routeKeyword()
  if (nextKeyword) {
    filters.keyword = nextKeyword
    page.value = 1
  }
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
    const [status, credit, accessStatus] = await Promise.all([
      getDevOrderDepositStatus(auth.token),
      getDevCreditSelf(auth.token).catch(() => null),
      getDevAccessStatus(auth.token).catch(() => null),
    ])
    depositStatus.value = status
    creditInfo.value = credit
    if (accessStatus) {
      developerAgreementSigned.value = accessStatus.developer_agreement_signed
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载接单保证金状态失败'
    showToast(message, 'error')
    depositStatus.value = null
  } finally {
    depositLoading.value = false
  }
}

async function applyFilters() {
  page.value = 1
  await loadRequirements()
}

/* 关键字搜索与其余菜单页一致：输入即生效，不再挂「查询」按钮。
   这一页走服务端分页查询，逐次按键都发请求会打满接口，所以关键字加 300ms 防抖；
   两个下拉改一次发一次，本来就不会连发。
   `appliedKeyword` 记最后一次真正发起请求的关键字，用来吃掉「重置」清空关键字时的重复请求。 */
let appliedKeyword = filters.keyword
let keywordTimer: ReturnType<typeof setTimeout> | null = null

function cancelPendingKeywordSearch() {
  if (keywordTimer) {
    clearTimeout(keywordTimer)
    keywordTimer = null
  }
}

function searchNow() {
  cancelPendingKeywordSearch()
  appliedKeyword = filters.keyword
  void applyFilters()
}

watch(
  () => filters.keyword,
  (value) => {
    if (value === appliedKeyword) {
      return
    }
    cancelPendingKeywordSearch()
    keywordTimer = setTimeout(() => {
      keywordTimer = null
      appliedKeyword = filters.keyword
      void applyFilters()
    }, 300)
  },
)

onBeforeUnmount(cancelPendingKeywordSearch)

async function resetFilters() {
  // 先撤掉待发的防抖请求，并让 watcher 认为清空后的关键字已经生效，
  // 否则「重置」会发两次（本次立即 + 300ms 后那次）。
  cancelPendingKeywordSearch()
  filters.keyword = ''
  appliedKeyword = ''
  filters.sortBy = 'updated_at'
  filters.sortOrder = 'desc'
  page.value = 1
  pageSize.value = 10
  await loadRequirements()
}

function handlePageSizeChange() {
  page.value = 1
  void loadRequirements()
}

function openBindDialog(requirement: RequirementItem) {
  if (requiresDepositGate(requirement) && !developerAgreementSigned.value) {
    goSignDeveloperAgreement(requirement.requirement_id)
    return
  }
  void router.push({
    name: 'dev-requirement-detail',
    params: { requirementId: requirement.requirement_id },
  })
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
    showToast(
      createdResourceTitle
        ? `已初始化资源“${createdResourceTitle}”，并完成需求关联`
        : '需求已关联到开发项目，并进入开发中',
      'success',
    )
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
  if (!developerAgreementSigned.value) {
    goSignDeveloperAgreement()
    return
  }
  void router.push('/dev/wallet/order-deposit')
}

function goSignDeveloperAgreement(requirementId?: string) {
  const redirectTo = requirementId
    ? `/workbench/developer/requirements/hall/${encodeURIComponent(requirementId)}`
    : route.fullPath
  void router.push({
    name: 'contract-sign',
    query: { agreement: 'developer', redirect_to: redirectTo },
  })
}

function projectOptionLabel(resource: McResourcePayload): string {
  return `${resource.title} · ${resource.author}`
}

function requirementFieldPreview(value?: string | null, fallback = '未填写') {
  const preview = requirementRichTextPreview(value, fallback)

  if (preview.length <= requirementPreviewMaxLength) {
    return preview
  }

  return `${preview.slice(0, requirementPreviewMaxLength).trimEnd()}...`
}

function requirementFieldHtml(value?: string | null, fallback = '未填写') {
  return sanitizeRequirementRichText(value ?? '') || fallback
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
  const normalizedTitle =
    initForm.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'resource'

  return `${normalizedTitle}.package`
}

function buildDerivedSourceUrl() {
  const normalizedTitle =
    initForm.title
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
</script>

<template>
  <div class="dev-page dev-page--requirement-hall">
    <div class="dev-meta-strip">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">需求单</span>
        <span class="dev-meta-strip__value">{{ total }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">无电签</span>
        <span class="dev-meta-strip__value">{{ selfManagedCount }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">电签</span>
        <span class="dev-meta-strip__value">{{ guaranteeCount }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">可用保证金</span>
        <span class="dev-meta-strip__value">{{ availableDepositText }}</span>
      </div>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <TButton variant="solid" tone="accent" @click="goToOrderDeposit">去缴纳保证金</TButton>
        <TButton icon-only aria-label="刷新需求列表" @click="loadRequirements">
          <TIcon>
            <Refresh />
          </TIcon>
        </TButton>
      </div>
    </div>

    <!-- 未签协议 / 接单资格两条提示：与总览页的保证金提示共用统一层的 .dev-notice
         （金色 + 图标徽标 + 文案 + 右侧动作），不再用 Element 的 el-alert。 -->
    <div v-if="!developerAgreementSigned" class="dev-notice" role="alert">
      <span class="dev-notice__icon" aria-hidden="true">
        <TIcon>
          <WarningFilled />
        </TIcon>
      </span>
      <div class="dev-notice__copy">
        <strong>尚未签署《开发者入驻协议》</strong>
        <p>可接取无电签约定需求；接取电签担保需求或缴纳保证金前需先签署协议。</p>
      </div>
      <div class="dev-notice__action">
        <TButton variant="solid" tone="accent" @click="goSignDeveloperAgreement()">去签署协议</TButton>
      </div>
    </div>

    <div v-if="!canTakeOrders" class="dev-notice" role="status">
      <span class="dev-notice__icon" aria-hidden="true">
        <TIcon>
          <WarningFilled />
        </TIcon>
      </span>
      <div class="dev-notice__copy">
        <p>无电签约定需求可继续关联；历史电签担保需求需要满足保证金规则。</p>
        <p v-if="depositStatus?.frozen_cny">当前已冻结：{{ frozenDepositText }}</p>
        <p v-if="depositStatus?.latest_order">最近订单状态：{{ depositStatus.latest_order.status }}</p>
      </div>
    </div>

    <TCard class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">可接需求</h3>
        </div>
      </div>

      <div class="dev-toolbar">
        <TSelect v-model="filters.sortBy" placeholder="排序字段" class="dev-toolbar__field" @change="applyFilters">
          <TOption v-for="item in sortOptions" :key="item.value" :label="item.label" :value="item.value" />
        </TSelect>

        <TSelect v-model="filters.sortOrder" placeholder="排序方向"
          class="dev-toolbar__field dev-toolbar__field--small" @change="applyFilters">
          <TOption label="降序" value="desc" />
          <TOption label="升序" value="asc" />
        </TSelect>

        <TInput v-model="filters.keyword" clearable placeholder="搜索需求编号、标题或描述" class="dev-toolbar__search"
          @keyup.enter="searchNow">
          <template #prefix>
            <TIcon>
              <Search />
            </TIcon>
          </template>
        </TInput>

        <!-- 筛选与其余菜单页同构：只有「重置」，输入／切换即时生效，没有「查询」按钮。
             条数只在表尾分页器里报一次，工具栏不再重复一行「共 N 条」。 -->
        <div class="dev-toolbar__actions">
          <TButton variant="outline" @click="resetFilters">
            <TIcon>
              <RefreshLeft />
            </TIcon>
            <span>重置</span>
          </TButton>
        </div>
      </div>

      <!-- 列宽可拖：表头右边缘的拖拽手柄由 TTableColumn 的 `resizable` 打开，与边框无关
           （TTable 的 `border` 是画竖线的皮肤开关，本页要的是无框表格，所以不给）。
           窄窗口下列宽合计超过卡片时表格本来就会横向滚动（见 dev-responsive.css 的说明），
           现在用户至少可以把列拖窄，自己把表格收进卡片宽度。 -->
      <TTable :loading="loading" :data="rows" stripe class="dev-table dev-requirement-hall__table">
        <template #empty>
          <p class="dev-empty-state">{{ emptyText }}</p>
        </template>
        <!-- 列宽合计必须留在卡片可用宽度以内（桌面端 1440 宽时约 965px）。
             原来这七列是 300+116+92+112+96+136+130 = 982px，刚好越界十几像素，
             表格因此横向滚动，「操作」列（fixed="right"）压掉「最近更新」的尾巴。
             现在固定六列 110+88+108+112+132+118 = 668px，需求列（min-width 260）
             吃掉剩下的约 297px。状态列由 96 放宽到 112：96px 装不下「待付定金」那枚标签
             （单元格内容需要 110px），标签会被截成「待付定金…」。 -->
        <TTableColumn label="需求" min-width="260" resizable>
          <template #default="scope">
            <div class="dev-requirement-hall__title-cell">
              <div class="dev-requirement-hall__requirement-id">{{ scope.row.requirement_id }}</div>
              <div class="dev-requirement-hall__title">{{ scope.row.title }}</div>
              <div class="dev-requirement-hall__desc">
                {{ requirementFieldPreview(scope.row.description, '暂无补充描述') }}
              </div>
            </div>
          </template>
        </TTableColumn>
        <TTableColumn prop="creator" label="发起人" width="110" resizable show-overflow-tooltip />
        <TTableColumn label="预算" width="88" resizable>
          <template #default="scope">
            <span>{{ formatMoney(scope.row.budget) }}</span>
          </template>
        </TTableColumn>
        <TTableColumn label="发布方式" width="108" resizable>
          <template #default="scope">
            <PaymentModeChip :mode="scope.row.payment_mode" />
          </template>
        </TTableColumn>
        <TTableColumn label="状态" width="112" resizable>
          <template #default="scope">
            <!-- 状态走全站统一口径（requirementStatusLabel）：待付定金 / 已付定金（担保）· 待开发（自管）。
                 这里原来自己写成「待接单/签约」，有两处不对：
                 1) 大厅的入口条件就是「未被接单」（后端过滤 status IN (pending_deposit, deposit_paid)
                    且没有生效中的资源绑定），所以「待接单」是整张表的属性，不是某一行的状态；
                    而「签约」只有接了单、生成合同之后才会出现，对未接单的行是提前叙说。
                 2) 无电签约定（self_managed）根本没有合同，那一档永远不会有签约这一步。
                 另一处错位：真正已付定金、接了就能开工的 deposit_paid 原来只写「待开发」，
                 倒是还没付定金的 pending_deposit 抢了「待接单」的说法。 -->
            <TTag variant="outline" :tone="scope.row.status === 'pending_deposit' ? 'warning' : 'success'">
              {{ requirementStatusLabel(scope.row.status, scope.row.payment_mode) }}
            </TTag>
          </template>
        </TTableColumn>
        <!-- 最近更新只报到分钟（工作台总览的「更新于」也是这个格式）：后端给的是
             「2026-09-28 15:30:00」，19 个字符要 144px，132px 的列会被截成
             「2026-09-28 15:…」；掐掉秒之后 107px 就够，也不再需要省略号。 -->
        <TTableColumn label="最近更新" width="132" resizable show-overflow-tooltip>
          <template #default="scope">{{ formatCnDateTime(scope.row.updated_at) }}</template>
        </TTableColumn>
        <TTableColumn label="操作" width="118" fixed="right" resizable>
          <template #default="scope">
            <TButton variant="outline" tone="accent"
              @click="openBindDialog(scope.row)">
              {{ bindButtonLabel(scope.row) }}
            </TButton>
          </template>
        </TTableColumn>
      </TTable>

      <!-- 表尾走统一层的 .dev-pager（与钱包记录同一形态）。
           本页走服务端分页，此前只取第 1 页 10 条且不给翻页入口，第 2 页起的数据在界面上不可达。 -->
      <div class="dev-pager">
        <div class="dev-pager__count">
          <span>共 {{ total }} 条</span>
          <TSelect v-model="pageSize" aria-label="每页条数" class="dev-pager__size" @change="handlePageSizeChange">
            <TOption v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
          </TSelect>
        </div>
        <TPagination v-model:current-page="page" :page-size="pageSize" :total="total" :pager-count="5" background aria-label="需求列表分页" @current-change="loadRequirements" />
      </div>
    </TCard>

    <TDialog v-model:open="bindDialogVisible" width="720px" class="dev-dialog"
      :title="selectedRequirement ? `关联需求 · ${selectedRequirement.title}` : '关联需求'">
      <div class="dev-requirement-hall__dialog-copy">
        <p class="dev-section-desc">
          关联前请先阅读需求标题、需求描述、预算与验收标准，确认资源匹配后再继续。
        </p>
      </div>

      <section v-if="selectedRequirement" class="dev-requirement-hall__review-panel">
        <div class="dev-requirement-hall__review-item">
          <span class="dev-requirement-hall__review-label">需求标题</span>
          <div class="dev-requirement-hall__review-value">{{ selectedRequirement.title }}</div>
        </div>
        <div class="dev-requirement-hall__review-item">
          <span class="dev-requirement-hall__review-label">需求描述</span>
          <div
            class="dev-requirement-hall__review-value dev-requirement-hall__review-value--multiline dev-requirement-hall__review-value--rich"
            v-html="requirementFieldHtml(selectedRequirement.description, '暂无需求描述')"></div>
        </div>
        <div class="dev-requirement-hall__review-grid">
          <div class="dev-requirement-hall__review-item">
            <span class="dev-requirement-hall__review-label">预算</span>
            <div class="dev-requirement-hall__review-value">
              {{ formatMoney(selectedRequirement.budget) }}
            </div>
          </div>
          <div class="dev-requirement-hall__review-item">
            <span class="dev-requirement-hall__review-label">验收标准</span>
            <div
              class="dev-requirement-hall__review-value dev-requirement-hall__review-value--multiline dev-requirement-hall__review-value--rich"
              v-html="requirementFieldHtml(selectedRequirement.acceptance_criteria, '暂无验收标准')"></div>
          </div>
        </div>
      </section>

      <TForm label-position="top">
        <TFormItem label="关联方式" required>
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
        </TFormItem>

        <template v-if="bindingMode === 'existing'">
          <TFormItem label="选择开发项目" required>
            <TSelect v-model="bindForm.resourceId" placeholder="请选择一个未绑定且保持私有的开发项目"
              class="dev-requirement-hall__dialog-field" @change="handleResourceChange">
              <TOption v-for="item in availableResourceOptions" :key="item.id" :label="projectOptionLabel(item)"
                :value="item.id" />
            </TSelect>
          </TFormItem>

          <p v-if="availableResourceOptions.length === 0" class="dev-empty-state dev-requirement-hall__dialog-empty">
            当前没有可直接绑定的私有资源项目。你可以切换到“初始化新资源项目”，先创建一个私有项目后再继续关联。
          </p>
        </template>

        <template v-else>
          <section class="dev-requirement-hall__init-panel">
            <div class="dev-upload-grid dev-upload-grid--two">
              <TFormItem label="资源标题" required>
                <TInput show-count v-model="initForm.title"  :maxlength="200"
                  placeholder="例如 Better Combat Reloaded" @input="handleInitFieldChange" />
              </TFormItem>

              <TFormItem label="作者名称" required>
                <TInput v-model="initForm.author"  :maxlength="100" placeholder="默认使用当前开发者账号"
                  @input="handleInitFieldChange" />
              </TFormItem>
            </div>

            <section v-if="rootTabs.length > 0" class="dev-requirement-hall__catalog-block">
              <div class="dev-requirement-hall__catalog-head">
                <span class="dev-filter-label">一级分类</span>
                <TButton variant="text" :loading="initTagsLoading" @click="loadTagTree"><template #prefix><TIcon><Refresh /></TIcon></template>刷新标签</TButton>
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
                    []).length }}/{{
                      group.items.length
                    }}</span>
                </div>

                <div class="dev-requirement-hall__tag-group-selected">
                  <template v-if="selectedNamesForGroup(group).length > 0">
                    <span v-for="name in selectedNamesForGroup(group)" :key="`${group.key}:${name}`"
                      class="dev-chip dev-chip--cyan">{{ name }}</span>
                  </template>
                  <span v-else class="dev-requirement-hall__tag-group-empty">尚未选择标签</span>
                </div>

                <TSelect v-model="selectedTagIdsByGroup[group.group_id]" multiple filterable placeholder="选择一个或多个标签"
                  class="dev-requirement-hall__dialog-field" @change="handleInitFieldChange">
                  <TOption v-for="item in group.items" :key="item.id" :label="item.name" :value="item.id" />
                </TSelect>
              </section>
            </div>

            <p v-else class="dev-empty-state dev-requirement-hall__dialog-empty">
              当前分类下暂无可初始化资源的标签数据，请切换分类或刷新标签后重试。
            </p>
          </section>
        </template>

        <TFormItem required>
          <TCheckbox v-model="reviewConfirmed" @change="handleReviewChange">
            我已详细阅读需求标题、需求描述、预算、验收标准，并确认当前资源方案适合关联此需求
          </TCheckbox>
        </TFormItem>
      </TForm>

      <section v-if="selectedRequirement && (bindingMode === 'new' || selectedResource)"
        class="dev-requirement-hall__confirm-panel">
        <div class="dev-requirement-hall__confirm-head">
          <span class="dev-requirement-hall__confirm-title">二次确认</span>
          <span class="dev-requirement-hall__confirm-meta">需求将进入开发中且不可重复绑定</span>
        </div>
        <p class="dev-requirement-hall__confirm-text">
          当前将关联需求“{{ selectedRequirement.title }}”到资源“{{
            confirmResourceLabel
          }}”。请确认资源能力、预算范围与验收标准均已匹配。
        </p>
        <TCheckbox v-model="finalConfirmed" :disabled="!reviewConfirmed">
          我确认本次关联无误，允许将该需求正式绑定到当前资源方案
        </TCheckbox>
      </section>

      <p v-if="bindingMode === 'existing' && availableResourceOptions.length === 0"
        class="dev-empty-state dev-requirement-hall__dialog-empty">
        当前没有可绑定的开发项目。只有未绑定且保持私有的资源才能关联需求；如果资源已提交公开审核或已经公开，请先改回私有。
      </p>

      <p v-if="bindingMode === 'new' && createBlockReason" class="dev-empty-state dev-requirement-hall__dialog-empty">
        {{ createBlockReason }}
      </p>

      <template #footer>
        <TButton @click="bindDialogVisible = false">取消</TButton>
        <TButton variant="solid" tone="accent" :loading="binding" :disabled="bindingMode === 'existing'
          ? !availableResourceOptions.length ||
          !reviewConfirmed ||
          !finalConfirmed ||
          !bindForm.resourceId
          : !reviewConfirmed || !finalConfirmed || !canCreateResource
          " @click="submitBinding">
          {{ bindingMode === 'existing' ? '确认关联' : '初始化并关联' }}
        </TButton>
      </template>
    </TDialog>
  </div>
</template>

<style scoped>
.dev-requirement-hall__table :deep(.cell),
.dev-requirement-hall__title-cell {
  min-width: 0;
}

.dev-requirement-hall__requirement-id,
.dev-requirement-hall__title,
.dev-requirement-hall__desc {
  overflow-wrap: anywhere;
}

.dev-requirement-hall__desc {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  -webkit-line-clamp: 2;
}

.dev-requirement-hall__review-value--rich {
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.dev-requirement-hall__review-value--rich :deep(p),
.dev-requirement-hall__review-value--rich :deep(ul),
.dev-requirement-hall__review-value--rich :deep(ol),
.dev-requirement-hall__review-value--rich :deep(blockquote) {
  margin: 0 0 8px;
}

.dev-requirement-hall__review-value--rich :deep(ul),
.dev-requirement-hall__review-value--rich :deep(ol) {
  padding-left: 20px;
}

.dev-requirement-hall__review-value--rich :deep(a) {
  color: var(--dev-blue);
}

.dev-requirement-hall__review-value--rich :deep(.rich-editor-media) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 10px 0;
  border-radius: 12px;
}

</style>
