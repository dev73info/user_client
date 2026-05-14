<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
    getProcessedTagTree,
    invalidateTagTreeCache,
    type McProcessedTagTree,
    type McPublishTagGroup,
    type McTagCatalogEntry,
    type McTagCatalogRoot,
} from '@dev/api/Tags'
import { getDevCreditSelf, type DevCreditSelf } from '@dev/api/devCredit'
import { getDevOrderDepositStatus, type DevOrderDepositStatus } from '@dev/api/devOrderDeposit'
import { createMcResource, listMcResources, type McResourcePayload } from '@dev/api/mcResources'
import {
    bindRequirementProject,
    getRequirementHallItem,
    type RequirementItem,
    type RequirementPaymentMode,
    type RequirementStatus,
} from '@dev/api/requirements'
import { useToast } from '@dev/composables/useToast'
import { useAuthStore } from '@dev/stores/auth'
import { sanitizeRequirementRichText } from '@/utils/requirementRichText'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

const loading = ref(false)
const resourcesLoading = ref(false)
const depositLoading = ref(false)
const binding = ref(false)
const requirement = ref<RequirementItem | null>(null)
const resources = ref<McResourcePayload[]>([])
const bindingMode = ref<'existing' | 'new'>('existing')
const reviewConfirmed = ref(false)
const finalConfirmed = ref(false)
const depositStatus = ref<DevOrderDepositStatus | null>(null)
const creditInfo = ref<DevCreditSelf | null>(null)
const processedTree = ref<McProcessedTagTree>({ roots: [] })
const initTagsLoading = ref(false)
const currentRootKey = ref('')
const currentEntryKey = ref('')

const bindForm = reactive({
    resourceId: undefined as number | undefined,
})

const initForm = reactive({
    title: '',
    author: '',
})

const selectedTagIdsByGroup = reactive<Record<number, number[]>>({})

const requirementId = computed(() => {
    const value = route.params.requirementId
    if (Array.isArray(value)) {
        return value[0]?.trim() ?? ''
    }

    return typeof value === 'string' ? value.trim() : ''
})

const availableResourceOptions = computed(() =>
    resources.value.filter((item) => !item.requirement_id && item.visibility === 'draft'),
)
const hasPendingBindableResources = computed(() =>
    resources.value.some((item) => !item.requirement_id && item.visibility !== 'draft'),
)
const selectedResource = computed(
    () => availableResourceOptions.value.find((item) => item.id === bindForm.resourceId) ?? null,
)
const canTakeOrders = computed(() => depositStatus.value?.can_bind_requirement ?? false)
const availableDepositText = computed(
    () => `¥${(depositStatus.value?.available_cny ?? 0).toFixed(2)}`,
)
const orderCreditCap = computed(() => {
    if (!creditInfo.value || !creditInfo.value.enforce_order_limit) {
        return Number.POSITIVE_INFINITY
    }

    return creditInfo.value.max_order_amount_cny
})
const rootTabs = computed<McTagCatalogRoot[]>(() => processedTree.value.roots)
const currentRoot = computed<McTagCatalogRoot | null>(
    () =>
        rootTabs.value.find((item) => item.key === currentRootKey.value) ?? rootTabs.value[0] ?? null,
)
const entryTabs = computed<McTagCatalogEntry[]>(() => currentRoot.value?.entries ?? [])
const currentEntry = computed<McTagCatalogEntry | null>(
    () =>
        entryTabs.value.find((item) => item.key === currentEntryKey.value) ?? entryTabs.value[0] ?? null,
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
const requirementDescriptionHtml = computed(() =>
    requirementFieldHtml(requirement.value?.description, '暂无需求描述'),
)
const requirementAcceptanceHtml = computed(() =>
    requirementFieldHtml(requirement.value?.acceptance_criteria, '暂无验收标准'),
)
const bindingBlockReason = computed(() => {
    const currentRequirement = requirement.value
    if (!currentRequirement || !requiresDepositGate(currentRequirement)) {
        return ''
    }

    if (!canTakeOrders.value) {
        return `当前可用保证金不足，当前可用：${availableDepositText.value}`
    }

    if ((currentRequirement.budget ?? 0) > (depositStatus.value?.available_cny ?? 0)) {
        return '当前需求预算高于可用保证金，请先补充保证金'
    }

    if (!isBudgetWithinCap(currentRequirement.budget)) {
        return `当前信用最高可接 ¥${orderCreditCap.value.toFixed(2)} 的需求，无法绑定此预算`
    }

    return ''
})
const canSubmitBinding = computed(() => {
    if (
        !requirement.value ||
        Boolean(bindingBlockReason.value) ||
        !reviewConfirmed.value ||
        !finalConfirmed.value
    ) {
        return false
    }

    if (bindingMode.value === 'existing') {
        return Boolean(bindForm.resourceId && selectedResource.value)
    }

    return canCreateResource.value
})

onMounted(async () => {
    auth.hydrate()
    syncDefaultAuthor()
    await loadPage()
})

watch(
    () => route.params.requirementId,
    () => {
        void loadPage()
    },
)

watch(
    () => auth.username,
    () => syncDefaultAuthor(),
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

function statusToLabel(status: RequirementStatus): string {
    const mapping: Record<RequirementStatus, string> = {
        pending_review: '待审核',
        rejected: '已拒绝',
        pending_deposit: '待付定金',
        deposit_paid: '待开发',
        in_development: '开发中',
        pending_final: '待付尾款',
        final_paid: '已付尾款',
        completed: '已完成',
    }

    return mapping[status]
}

function formatMoney(value?: number | null): string {
    if (value == null) {
        return '待议价'
    }

    return `¥${value}`
}

function formatTimeLabel(value?: string | null): string {
    if (!value) {
        return '时间未知'
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        return '时间未知'
    }

    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function isSelfManagedRequirement(currentRequirement: RequirementItem) {
    return currentRequirement.payment_mode === 'self_managed'
}

function paymentModeLabel(mode: RequirementPaymentMode) {
    return mode === 'self_managed' ? '无平台担保' : '平台担保'
}

function paymentLabel(currentRequirement: RequirementItem) {
    return currentRequirement.payment_method?.trim() || paymentModeLabel(currentRequirement.payment_mode)
}

function requiresDepositGate(currentRequirement: RequirementItem) {
    return !isSelfManagedRequirement(currentRequirement)
}

function isBudgetWithinCap(budget?: number | null) {
    return (budget ?? 0) <= orderCreditCap.value + 0.0001
}

function requirementFieldHtml(value?: string | null, fallback = '未填写') {
    return sanitizeRequirementRichText(value ?? '') || fallback
}

function syncDefaultAuthor() {
    if (!initForm.author.trim() && auth.username) {
        initForm.author = auth.username
    }
}

async function loadPage() {
    if (!auth.token) {
        showToast('登录状态已失效，请重新登录', 'error')
        return
    }

    if (!requirementId.value) {
        requirement.value = null
        showToast('需求编号无效', 'error')
        return
    }

    loading.value = true
    try {
        resetBindingState()
        const [currentRequirement] = await Promise.all([loadRequirement(), loadBindingContext()])
        requirement.value = currentRequirement
        await ensureInitialBindingMode()
    } catch (error) {
        requirement.value = null
        showToast(error instanceof Error ? error.message : '加载需求详情失败', 'error')
    } finally {
        loading.value = false
    }
}

async function loadRequirement() {
    return getRequirementHallItem(auth.token, requirementId.value)
}

async function loadBindingContext() {
    resourcesLoading.value = true
    depositLoading.value = true
    try {
        const [resourceList, deposit, credit] = await Promise.all([
            listMcResources(auth.token),
            getDevOrderDepositStatus(auth.token),
            getDevCreditSelf(auth.token).catch(() => null),
        ])

        resources.value = resourceList
        depositStatus.value = deposit
        creditInfo.value = credit
    } finally {
        resourcesLoading.value = false
        depositLoading.value = false
    }
}

async function ensureInitialBindingMode() {
    bindingMode.value = availableResourceOptions.value.length > 0 ? 'existing' : 'new'
    if (bindingMode.value === 'new') {
        await ensureTagTreeLoaded()
    }
}

function resetBindingState() {
    resources.value = []
    bindForm.resourceId = undefined
    reviewConfirmed.value = false
    finalConfirmed.value = false
    resetInitForm()
}

function goBack() {
    void router.push({
        name: 'dev-requirement-hall',
        query: requirementId.value ? { keyword: requirementId.value } : {},
    })
}

function goToOrderDeposit() {
    void router.push('/dev/wallet/order-deposit')
}

function projectOptionLabel(resource: McResourcePayload): string {
    return `${resource.title} · ${resource.author}`
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

async function submitBinding() {
    const currentRequirement = requirement.value
    if (!auth.token || !currentRequirement) {
        showToast('登录状态已失效，请重新登录', 'error')
        return
    }

    if (bindingBlockReason.value) {
        showToast(bindingBlockReason.value, 'warning')
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
        }

        await bindRequirementProject(auth.token, currentRequirement.requirement_id, resourceId!)
        showToast(
            createdResourceTitle
                ? `已初始化资源“${createdResourceTitle}”，并完成需求关联`
                : '需求已关联到开发项目，并进入开发中',
            'success',
        )
        void router.push({ name: 'dev-my-requirements' })
    } catch (error) {
        const message = error instanceof Error ? error.message : '关联需求失败'
        showToast(message, 'error')
    } finally {
        binding.value = false
    }
}
</script>

<template>
    <div class="dev-page dev-requirement-detail" v-loading="loading">
        <div class="dev-requirement-detail__toolbar">
            <el-button class="dev-requirement-detail__back" plain @click="goBack">返回需求大厅</el-button>
            <div v-if="requirement" class="dev-requirement-detail__toolbar-meta">
                <span>{{ requirement.requirement_id }}</span>
                <span>{{ statusToLabel(requirement.status) }}</span>
            </div>
        </div>

        <div v-if="requirement" class="dev-requirement-detail__layout">
            <section class="dev-requirement-detail__left">
                <el-card shadow="never" class="dev-surface-card dev-requirement-detail__requirement-card">
                    <div class="dev-requirement-detail__head">
                        <div>
                            <span class="dev-requirement-detail__id">{{ requirement.requirement_id }}</span>
                            <h2>{{ requirement.title }}</h2>
                        </div>
                        <el-tag :type="isSelfManagedRequirement(requirement) ? 'info' : 'warning'" effect="plain">
                            {{ paymentLabel(requirement) }}
                        </el-tag>
                    </div>

                    <div class="dev-requirement-detail__stats">
                        <div class="dev-requirement-detail__stat">
                            <span>预算</span>
                            <strong>{{ formatMoney(requirement.budget) }}</strong>
                        </div>
                        <div class="dev-requirement-detail__stat">
                            <span>发起人</span>
                            <strong>{{ requirement.creator }}</strong>
                        </div>
                        <div class="dev-requirement-detail__stat">
                            <span>最近更新</span>
                            <strong>{{ formatTimeLabel(requirement.updated_at) }}</strong>
                        </div>
                    </div>

                    <section class="dev-requirement-detail__section">
                        <span class="dev-requirement-hall__review-label">需求描述</span>
                        <article class="dev-requirement-detail__rich" v-html="requirementDescriptionHtml"></article>
                    </section>

                    <section class="dev-requirement-detail__section">
                        <span class="dev-requirement-hall__review-label">验收标准</span>
                        <article class="dev-requirement-detail__rich" v-html="requirementAcceptanceHtml"></article>
                    </section>
                </el-card>
            </section>

            <aside class="dev-requirement-detail__right">
                <el-card shadow="never" class="dev-surface-card dev-requirement-detail__binding-card"
                    v-loading="resourcesLoading || depositLoading">
                    <div class="dev-requirement-detail__binding-head">
                        <div>
                            <span class="dev-requirement-detail__binding-eyebrow">接取需求</span>
                            <h3>配置关联资源</h3>
                        </div>
                        <span class="dev-requirement-detail__binding-status">
                            {{ bindingMode === 'existing' ? '已有资源' : '新资源' }}
                        </span>
                    </div>

                    <div v-if="bindingBlockReason" class="dev-requirement-detail__block-note">
                        <span>{{ bindingBlockReason }}</span>
                        <el-button v-if="requirement && requiresDepositGate(requirement)" type="primary" plain
                            size="small" @click="goToOrderDeposit">
                            去缴纳保证金
                        </el-button>
                    </div>

                    <el-form label-position="top">
                        <el-form-item label="关联方式" required>
                            <div class="dev-requirement-hall__mode-switch">
                                <button type="button" class="dev-requirement-hall__mode-button"
                                    :class="{ 'is-active': bindingMode === 'existing' }"
                                    @click="handleBindingModeChange('existing')">
                                    关联已有资源项目
                                </button>
                                <button type="button" class="dev-requirement-hall__mode-button"
                                    :class="{ 'is-active': bindingMode === 'new' }"
                                    @click="handleBindingModeChange('new')">
                                    初始化新资源项目
                                </button>
                            </div>
                        </el-form-item>

                        <template v-if="bindingMode === 'existing'">
                            <el-form-item label="选择开发项目" required>
                                <el-select v-model="bindForm.resourceId" filterable placeholder="请选择一个未绑定且保持私有的开发项目"
                                    class="dev-requirement-hall__dialog-field" @change="handleResourceChange">
                                    <el-option v-for="item in availableResourceOptions" :key="item.id"
                                        :label="projectOptionLabel(item)" :value="item.id" />
                                </el-select>
                            </el-form-item>

                            <p v-if="availableResourceOptions.length === 0"
                                class="dev-empty-state dev-requirement-hall__dialog-empty">
                                当前没有可直接绑定的私有资源项目。你可以切换到“初始化新资源项目”，先创建一个私有项目后再继续关联。
                            </p>
                            <p v-else-if="hasPendingBindableResources"
                                class="dev-empty-state dev-requirement-hall__dialog-empty">
                                只有私有且未绑定的资源才能关联需求；已提交审核或已公开的资源不可在此绑定。
                            </p>
                        </template>

                        <template v-else>
                            <section class="dev-requirement-hall__init-panel">
                                <div class="dev-requirement-hall__init-copy">
                                    <p class="dev-section-desc">
                                        如果当前没有合适的资源项目，可以先初始化一个新的私有资源。创建完成后会直接用于本次需求关联。
                                    </p>
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
                                        <el-button text size="small" :loading="initTagsLoading" @click="loadTagTree">
                                            刷新标签
                                        </el-button>
                                    </div>
                                    <div class="dev-requirement-hall__catalog-chips">
                                        <button v-for="root in rootTabs" :key="root.key" type="button"
                                            class="dev-requirement-hall__catalog-chip"
                                            :class="{ 'is-active': root.key === currentRootKey }"
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
                                            :class="{ 'is-active': entry.key === currentEntryKey }"
                                            @click="openEntry(entry.key)">
                                            {{ entry.group_name }}
                                        </button>
                                    </div>
                                </section>

                                <div v-if="platformTagGroups.length > 0" class="dev-requirement-hall__tag-groups">
                                    <section v-for="group in platformTagGroups" :key="group.key"
                                        class="dev-requirement-hall__tag-group">
                                        <div class="dev-requirement-hall__tag-group-head">
                                            <div>
                                                <h4 class="dev-requirement-hall__tag-group-title">
                                                    {{ group.group_name }}
                                                </h4>
                                                <p class="dev-requirement-hall__tag-group-path">{{ group.label }}</p>
                                            </div>
                                            <span class="dev-requirement-hall__tag-group-count">
                                                {{ (selectedTagIdsByGroup[group.group_id] ?? []).length }}/{{
                                                    group.items.length }}
                                            </span>
                                        </div>

                                        <div class="dev-requirement-hall__tag-group-selected">
                                            <template v-if="selectedNamesForGroup(group).length > 0">
                                                <span v-for="name in selectedNamesForGroup(group)"
                                                    :key="`${group.key}:${name}`" class="dev-chip dev-chip--cyan">
                                                    {{ name }}
                                                </span>
                                            </template>
                                            <span v-else class="dev-requirement-hall__tag-group-empty">尚未选择标签</span>
                                        </div>

                                        <el-select v-model="selectedTagIdsByGroup[group.group_id]" multiple filterable
                                            placeholder="选择一个或多个标签" class="dev-requirement-hall__dialog-field"
                                            @change="handleInitFieldChange">
                                            <el-option v-for="item in group.items" :key="item.id" :label="item.name"
                                                :value="item.id" />
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

                    <section v-if="requirement && (bindingMode === 'new' || selectedResource)"
                        class="dev-requirement-hall__confirm-panel">
                        <div class="dev-requirement-hall__confirm-head">
                            <span class="dev-requirement-hall__confirm-title">二次确认</span>
                            <span class="dev-requirement-hall__confirm-meta">需求将进入开发中且不可重复绑定</span>
                        </div>
                        <p class="dev-requirement-hall__confirm-text">
                            当前将关联需求“{{ requirement.title }}”到资源“{{ confirmResourceLabel }}”。请确认资源能力、预算范围与验收标准均已匹配。
                        </p>
                        <el-checkbox v-model="finalConfirmed" :disabled="!reviewConfirmed">
                            我确认本次关联无误，允许将该需求正式绑定到当前资源方案
                        </el-checkbox>
                    </section>

                    <p v-if="bindingMode === 'new' && createBlockReason"
                        class="dev-empty-state dev-requirement-hall__dialog-empty">
                        {{ createBlockReason }}
                    </p>

                    <div class="dev-requirement-detail__actions">
                        <el-button @click="goBack">取消</el-button>
                        <el-button type="primary" :loading="binding" :disabled="!canSubmitBinding"
                            @click="submitBinding">
                            {{ bindingMode === 'existing' ? '确认关联' : '初始化并关联' }}
                        </el-button>
                    </div>
                </el-card>
            </aside>
        </div>

        <el-card v-else-if="!loading" shadow="never" class="dev-surface-card dev-requirement-detail__empty">
            <p class="dev-empty-state">当前需求不存在或已不可接取。</p>
            <el-button type="primary" plain @click="goBack">返回需求大厅</el-button>
        </el-card>
    </div>
</template>

<style scoped>
.dev-requirement-detail {
    container-type: inline-size;
    display: grid;
    gap: 16px;
    width: 100%;
    min-width: 0;
}

.dev-requirement-detail__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.dev-requirement-detail__back.el-button {
    border-radius: 999px;
    font-weight: 800;
}

.dev-requirement-detail__toolbar-meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    color: var(--dev-muted);
    font-size: 12px;
    font-weight: 700;
}

.dev-requirement-detail__layout {
    --requirement-detail-panel-height: clamp(500px, calc(100dvh - 190px), 780px);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    align-items: stretch;
    min-width: 0;
}

.dev-requirement-detail__left,
.dev-requirement-detail__right {
    display: grid;
    min-width: 0;
    min-height: 0;
}

.dev-requirement-detail__requirement-card,
.dev-requirement-detail__binding-card {
    position: sticky;
    top: 14px;
    height: var(--requirement-detail-panel-height);
    min-width: 0;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
}

.dev-requirement-detail__binding-card {
    container-type: inline-size;
}

.dev-requirement-detail__requirement-card :deep(.el-card__body),
.dev-requirement-detail__binding-card :deep(.el-card__body) {
    display: grid;
    gap: 16px;
    min-width: 0;
    min-height: 100%;
}

.dev-requirement-detail__binding-card :deep(.el-form),
.dev-requirement-detail__binding-card :deep(.el-form-item),
.dev-requirement-detail__binding-card :deep(.el-input),
.dev-requirement-detail__binding-card :deep(.el-select) {
    max-width: 100%;
    min-width: 0;
}

.dev-requirement-detail__binding-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 2px;
}

.dev-requirement-detail__binding-head h3 {
    margin: 4px 0 0;
    color: var(--dev-ink);
    font-size: 18px;
    line-height: 1.25;
}

.dev-requirement-detail__binding-eyebrow {
    color: var(--dev-blue);
    font-size: 12px;
    font-weight: 800;
}

.dev-requirement-detail__binding-status {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    background: rgba(31, 74, 209, 0.09);
    color: var(--dev-blue);
    font-size: 12px;
    font-weight: 800;
}

.dev-requirement-detail__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}

.dev-requirement-detail__head h2 {
    margin: 6px 0 0;
    color: var(--dev-ink);
    font-size: 22px;
    line-height: 1.35;
}

.dev-requirement-detail__id {
    color: var(--dev-blue);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
}

.dev-requirement-detail__stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
}

.dev-requirement-detail__stat {
    display: grid;
    gap: 6px;
    min-width: 0;
    padding: 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.72);
    box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}

.dev-requirement-detail__stat span {
    color: var(--dev-muted);
    font-size: 11px;
    font-weight: 800;
}

.dev-requirement-detail__stat strong {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--dev-ink);
    font-size: 14px;
    line-height: 1.45;
}

.dev-requirement-detail__section {
    display: grid;
    gap: 8px;
}

.dev-requirement-detail__rich {
    padding: 14px 16px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.78);
    color: var(--dev-ink);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.75;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
}

.dev-requirement-detail__rich :deep(p),
.dev-requirement-detail__rich :deep(ul),
.dev-requirement-detail__rich :deep(ol),
.dev-requirement-detail__rich :deep(blockquote) {
    margin: 0 0 10px;
}

.dev-requirement-detail__rich :deep(ul),
.dev-requirement-detail__rich :deep(ol) {
    padding-left: 20px;
}

.dev-requirement-detail__rich :deep(a) {
    color: var(--dev-blue);
}

.dev-requirement-detail__rich :deep(.rich-editor-media) {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 10px 0;
    border-radius: 12px;
}

.dev-requirement-detail__block-note {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(245, 158, 11, 0.28);
    background: rgba(255, 251, 235, 0.92);
    color: #9a3412;
    font-size: 13px;
    font-weight: 800;
    line-height: 1.6;
}

.dev-requirement-detail__actions {
    position: sticky;
    bottom: -1px;
    z-index: 1;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 14px;
    border-top: 1px solid rgba(148, 163, 184, 0.14);
    background: linear-gradient(180deg, rgba(255, 251, 244, 0.72), rgba(255, 251, 244, 0.98));
}

.dev-requirement-detail__empty :deep(.el-card__body) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

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
    transition:
        border-color 0.2s ease,
        background 0.2s ease,
        box-shadow 0.2s ease,
        transform 0.2s ease;
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
    gap: 8px;
}

.dev-requirement-hall__tag-group {
    display: grid;
    grid-template-columns: minmax(126px, 0.36fr) minmax(0, 1fr);
    align-items: center;
    column-gap: 12px;
    row-gap: 6px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(17, 24, 39, 0.06);
    background: rgba(255, 255, 255, 0.6);
}

.dev-requirement-hall__tag-group-head {
    grid-column: 1;
    grid-row: 1 / span 2;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
}

.dev-requirement-hall__tag-group-title {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--dev-ink);
}

.dev-requirement-hall__tag-group-path {
    margin: 2px 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    line-height: 1.3;
    color: var(--dev-muted);
}

.dev-requirement-hall__tag-group-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    padding: 3px 7px;
    border-radius: 999px;
    background: rgba(17, 24, 39, 0.05);
    font-size: 10px;
    font-weight: 700;
    color: rgba(17, 24, 39, 0.62);
}

.dev-requirement-hall__tag-group-selected {
    grid-column: 2;
    display: flex;
    flex-wrap: nowrap;
    gap: 6px;
    min-height: 20px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
}

.dev-requirement-hall__tag-group-selected::-webkit-scrollbar {
    display: none;
}

.dev-requirement-hall__tag-group-empty {
    font-size: 11px;
    color: var(--dev-muted);
}

.dev-requirement-hall__tag-group .dev-requirement-hall__dialog-field {
    grid-column: 2;
}

.dev-requirement-hall__tag-group :deep(.el-select__wrapper) {
    min-height: 34px;
    border-radius: 10px;
}

@container (max-width: 960px) {
    .dev-requirement-detail__layout {
        grid-template-columns: 1fr;
    }

    .dev-requirement-detail__requirement-card,
    .dev-requirement-detail__binding-card {
        position: static;
        height: auto;
        max-height: none;
        overflow: visible;
    }

    .dev-requirement-detail__actions {
        position: static;
    }
}

@container (max-width: 520px) {

    .dev-upload-grid--two,
    .dev-requirement-detail__stats,
    .dev-requirement-hall__mode-switch {
        grid-template-columns: 1fr;
    }

    .dev-requirement-hall__tag-group {
        grid-template-columns: 1fr;
    }

    .dev-requirement-hall__tag-group-head,
    .dev-requirement-hall__tag-group-selected,
    .dev-requirement-hall__tag-group .dev-requirement-hall__dialog-field {
        grid-column: 1;
        grid-row: auto;
    }
}

@media (max-width: 1120px) {
    .dev-requirement-detail__layout {
        grid-template-columns: 1fr;
    }

    .dev-requirement-detail__requirement-card,
    .dev-requirement-detail__binding-card {
        position: static;
        height: auto;
        max-height: none;
        overflow: visible;
    }

    .dev-requirement-detail__actions {
        position: static;
    }
}

@media (max-width: 720px) {

    .dev-requirement-detail__toolbar,
    .dev-requirement-detail__actions,
    .dev-requirement-detail__empty :deep(.el-card__body),
    .dev-requirement-detail__block-note {
        align-items: stretch;
        flex-direction: column;
    }

    .dev-requirement-detail__toolbar-meta {
        justify-content: flex-start;
    }

    .dev-requirement-detail__stats,
    .dev-requirement-hall__mode-switch {
        grid-template-columns: 1fr;
    }
}
</style>