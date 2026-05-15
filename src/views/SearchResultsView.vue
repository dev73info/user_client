<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Close, Connection } from '@element-plus/icons-vue'

import { listCommunityPosts, type CommunityPost, type CommunityPostStatus } from '@/api/community'
import { apiUrl } from '@/api/http'
import { listAllPublicMcResources, type PublicMcResourceItem } from '@/api/resources'
import {
    getWorkbenchRequirementHallItem,
    listPublicRequirementSpotlights,
    type PublicRequirementSpotlightItem,
    type RequirementPaymentMode,
    type RequirementStatus,
} from '@/api/requirements'
import {
    getProcessedTagTree,
    getResourceDetailSlug,
    normalizeTagName,
    type McProcessedTagTree,
} from '@/api/resourceTags'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import {
    requirementRichTextPreview,
    sanitizeRequirementRichText,
} from '@/utils/requirementRichText'

type SearchScope = 'all' | 'resources' | 'requirements' | 'community'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

const loading = ref(false)
const resources = ref<PublicMcResourceItem[]>([])
const requirements = ref<PublicRequirementSpotlightItem[]>([])
const communityPosts = ref<CommunityPost[]>([])
const tagTree = ref<McProcessedTagTree | null>(null)
const loadError = ref('')
const loadedCommunityKeyword = ref('')
const selectedRequirement = ref<PublicRequirementSpotlightItem | null>(null)
const selectedRequirementDetailLoading = ref(false)

const keyword = computed(() =>
    typeof route.query.keyword === 'string' ? route.query.keyword.trim() : '',
)
const normalizedKeyword = computed(() => keyword.value.toLowerCase())
const scope = computed<SearchScope>(() => {
    const rawScope = typeof route.query.scope === 'string' ? route.query.scope : ''
    return rawScope === 'resources' || rawScope === 'requirements' || rawScope === 'community'
        ? rawScope
        : 'all'
})
const showResources = computed(() => scope.value === 'all' || scope.value === 'resources')
const showRequirements = computed(() => scope.value === 'all' || scope.value === 'requirements')
const showCommunity = computed(() => scope.value === 'all' || scope.value === 'community')

const filteredResources = computed(() => {
    if (!showResources.value) {
        return []
    }

    const searchText = normalizedKeyword.value
    if (!searchText) {
        return resources.value.slice(0, 12)
    }

    return resources.value.filter((resource) => buildResourceSearchText(resource).includes(searchText))
})

const filteredRequirements = computed(() => {
    if (!showRequirements.value) {
        return []
    }

    const searchText = normalizedKeyword.value
    if (!searchText) {
        return requirements.value.slice(0, 12)
    }

    return requirements.value.filter((requirement) =>
        buildRequirementSearchText(requirement).includes(searchText),
    )
})

const filteredCommunityPosts = computed(() => {
    if (!showCommunity.value) {
        return []
    }

    const searchText = normalizedKeyword.value
    if (!searchText) {
        return communityPosts.value.slice(0, 12)
    }

    if (loadedCommunityKeyword.value === keyword.value) {
        return communityPosts.value
    }

    return communityPosts.value.filter((post) => buildCommunitySearchText(post).includes(searchText))
})

const resultCount = computed(
    () => filteredResources.value.length + filteredRequirements.value.length + filteredCommunityPosts.value.length,
)
const resultSummary = computed(() => {
    if (!keyword.value) {
        return '输入关键词后展示匹配的资源、需求和帖子。'
    }

    if (resultCount.value === 0) {
        return '暂时没有匹配的资源、需求或帖子。'
    }

    const parts: string[] = []
    if (filteredResources.value.length > 0) {
        parts.push(`${filteredResources.value.length} 个资源`)
    }
    if (filteredRequirements.value.length > 0) {
        parts.push(`${filteredRequirements.value.length} 个需求`)
    }
    if (filteredCommunityPosts.value.length > 0) {
        parts.push(`${filteredCommunityPosts.value.length} 篇帖子`)
    }

    return `找到 ${parts.join('、')}`
})
const selectedRequirementDescriptionHtml = computed(
    () =>
        sanitizeRequirementRichText(selectedRequirement.value?.description ?? '') ||
        '当前需求暂未补充详细描述。',
)
const selectedRequirementAcceptanceHtml = computed(
    () =>
        sanitizeRequirementRichText(selectedRequirement.value?.acceptance_criteria ?? '') ||
        (selectedRequirementDetailLoading.value ? '验收标准加载中...' : '当前需求暂未补充验收标准。'),
)

watch(
    () => [route.query.keyword, route.query.scope] as const,
    () => {
        if (!loading.value) {
            void loadSearchData()
        }
    },
)

onMounted(() => {
    auth.hydrate()
    void loadSearchData()
})

async function loadSearchData() {
    loading.value = true
    loadError.value = ''

    try {
        const token = auth.token?.trim() ? auth.token : null
        const nextKeyword = keyword.value
        const [treeResult, resourceResult, requirementResult, communityResult] = await Promise.allSettled([
            showResources.value ? getProcessedTagTree() : Promise.resolve(tagTree.value),
            showResources.value ? listAllPublicMcResources(token) : Promise.resolve(resources.value),
            showRequirements.value ? listPublicRequirementSpotlights() : Promise.resolve(requirements.value),
            showCommunity.value
                ? listCommunityPosts({ token, keyword: nextKeyword, limit: 12 })
                : Promise.resolve([]),
        ])

        if (treeResult.status === 'fulfilled') {
            tagTree.value = treeResult.value
        }

        if (resourceResult.status === 'fulfilled') {
            resources.value = resourceResult.value
        } else {
            throw resourceResult.reason
        }

        if (requirementResult.status === 'fulfilled') {
            requirements.value = requirementResult.value
        } else {
            throw requirementResult.reason
        }

        if (communityResult.status === 'fulfilled') {
            communityPosts.value = communityResult.value
            loadedCommunityKeyword.value = nextKeyword
        } else {
            throw communityResult.reason
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : '加载搜索结果失败'
        loadError.value = message
        showToast(message, 'error')
    } finally {
        loading.value = false
    }
}

function buildResourceSearchText(resource: PublicMcResourceItem): string {
    return [
        resource.title,
        resource.description,
        resource.author,
        resource.creator,
        resource.platform,
        resource.file_name,
        resource.release_note ?? '',
        ...resource.tag_selections.flatMap((selection) => [
            selection.group_name,
            selection.group_alias ?? '',
            ...selection.group_path,
            ...(selection.group_path_aliases ?? []),
            ...selection.tag_names,
            ...(selection.tag_aliases ?? []),
        ]),
    ]
        .join(' ')
        .toLowerCase()
}

function buildRequirementSearchText(requirement: PublicRequirementSpotlightItem): string {
    return [
        requirement.requirement_id,
        requirement.title,
        requirementRichTextPreview(requirement.description, ''),
        requirementRichTextPreview(requirement.acceptance_criteria, ''),
        requirement.payment_method ?? '',
        paymentModeLabel(requirement.payment_mode),
        statusToLabel(requirement.status),
    ]
        .join(' ')
        .toLowerCase()
}

function buildCommunitySearchText(post: CommunityPost): string {
    return [
        post.title,
        post.author,
        post.content_html,
        communityStatusLabel(post.status),
        ...post.tags.map((tag) => tag.name),
    ]
        .join(' ')
        .toLowerCase()
}

function resourceTags(resource: PublicMcResourceItem): string[] {
    const tags = resource.tag_selections.flatMap((selection) =>
        selection.tag_names.map((tag) => normalizeTagName(tag)).filter(Boolean),
    )
    return Array.from(new Set([normalizeTagName(resource.platform), ...tags].filter(Boolean))).slice(0, 3)
}

function resourceDescription(resource: PublicMcResourceItem): string {
    const description = resource.description.replace(/\s+/g, ' ').trim()
    return previewText(description || '该资源暂未填写简介，可进入详情查看下载与版本信息。')
}

function requirementDescription(requirement: PublicRequirementSpotlightItem): string {
    return previewText(
        requirementRichTextPreview(requirement.description, '当前需求暂未补充详细描述。'),
    )
}

function communityDescription(post: CommunityPost): string {
    const tags = post.tags.map((tag) => tag.name).filter(Boolean)
    if (tags.length > 0) {
        return previewText(`标签：${tags.join('、')}`)
    }

    return '进入社区查看帖子正文与评论。'
}

function previewText(value: string, maxLength = 120): string {
    const text = value.replace(/\s+/g, ' ').trim()
    if (text.length <= maxLength) {
        return text
    }

    return `${text.slice(0, maxLength)}...`
}

function resourceCoverUrl(resource: PublicMcResourceItem): string {
    return resource.cover_url ? apiUrl(resource.cover_url) : ''
}

function resolveResourceRoute(
    resource: PublicMcResourceItem,
): { rootSlug: string; entrySlug: string } | null {
    for (const root of tagTree.value?.roots ?? []) {
        const entry = root.entries.find((item) => item.platform === resource.platform)
        if (entry) {
            return { rootSlug: root.key, entrySlug: entry.key }
        }
    }

    const fallbackRoot = tagTree.value?.roots[0]
    const fallbackEntry = fallbackRoot?.entries[0]
    return fallbackRoot && fallbackEntry
        ? { rootSlug: fallbackRoot.key, entrySlug: fallbackEntry.key }
        : null
}

function openResource(resource: PublicMcResourceItem) {
    const routeParams = resolveResourceRoute(resource)
    if (!routeParams) {
        void router.push({ name: 'free-resources', query: keyword.value ? { keyword: keyword.value } : {} })
        return
    }

    void router.push({
        name: 'resource-detail',
        params: {
            rootSlug: routeParams.rootSlug,
            entrySlug: routeParams.entrySlug,
            resourceSlug: getResourceDetailSlug(resource.id, resource.creator || resource.author),
        },
    })
}

function openRequirement(requirement: PublicRequirementSpotlightItem) {
    selectedRequirement.value = requirement
    void loadRequirementDetailForModal(requirement)
}

function closeRequirementDetail() {
    selectedRequirementDetailLoading.value = false
    selectedRequirement.value = null
}

function openRequirementWorkbench(requirement: PublicRequirementSpotlightItem) {
    void router.push({
        name: 'dev-requirement-detail',
        params: { requirementId: requirement.requirement_id },
    })
}

async function loadRequirementDetailForModal(requirement: PublicRequirementSpotlightItem) {
    if (requirement.acceptance_criteria?.trim()) {
        return
    }

    auth.hydrate()
    if (!auth.token) {
        return
    }

    selectedRequirementDetailLoading.value = true
    try {
        const detail = await getWorkbenchRequirementHallItem(auth.token, requirement.requirement_id)
        if (selectedRequirement.value?.requirement_id !== requirement.requirement_id) {
            return
        }

        selectedRequirement.value = {
            ...selectedRequirement.value,
            title: detail.title,
            description: detail.description ?? selectedRequirement.value.description,
            acceptance_criteria:
                detail.acceptance_criteria ?? selectedRequirement.value.acceptance_criteria,
            budget: detail.budget ?? selectedRequirement.value.budget,
            payment_method: detail.payment_method ?? selectedRequirement.value.payment_method,
            payment_mode: detail.payment_mode,
            status: detail.status,
            updated_at: detail.updated_at,
        }
    } catch {
        // 搜索结果已有公开摘要，详情补齐失败时保留当前信息。
    } finally {
        if (selectedRequirement.value?.requirement_id === requirement.requirement_id) {
            selectedRequirementDetailLoading.value = false
        }
    }
}

function openCommunityPost(post: CommunityPost) {
    void router.push({
        name: 'community-post',
        params: { postId: String(post.id) },
        query: keyword.value ? { keyword: keyword.value } : {},
    })
}

function paymentModeLabel(mode: RequirementPaymentMode): string {
    return mode === 'self_managed' ? '无平台担保' : '平台担保'
}

function paymentTag(requirement: PublicRequirementSpotlightItem): string {
    return requirement.payment_method?.trim() || paymentModeLabel(requirement.payment_mode)
}

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

function communityStatusLabel(status: CommunityPostStatus): string {
    const mapping: Record<CommunityPostStatus, string> = {
        pending_review: '审核中',
        published: '公开中',
        rejected: '已驳回',
    }
    return mapping[status]
}

function formatMoney(value?: number | null): string {
    if (value == null) {
        return '待议价'
    }

    return new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency: 'CNY',
        maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value)
}

function formatTimeLabel(value: string): string {
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
</script>

<template>
    <main class="portal-page portal-search-page">
        <section class="portal-page__panel portal-search-page__hero">
            <div class="portal-page__section-header portal-search-page__header">
                <div>
                    <p class="portal-page__eyebrow">全站搜索</p>
                    <h2>{{ keyword ? `“${keyword}” 的搜索结果` : '输入关键词开始搜索' }}</h2>
                    <p class="portal-search-page__summary">{{ resultSummary }}</p>
                </div>
                <button class="portal-page__link-btn" type="button" @click="router.push({ name: 'home' })">
                    返回首页
                </button>
            </div>
        </section>

        <section v-if="loading" class="portal-page__card-grid portal-search-page__grid">
            <article v-for="item in 4" :key="item" class="portal-page__card portal-page__resource-skeleton">
                <span class="portal-page__skeleton-chip"></span>
                <span class="portal-page__skeleton-title"></span>
                <span class="portal-page__skeleton-line portal-page__skeleton-line--wide"></span>
                <span class="portal-page__skeleton-line"></span>
                <span class="portal-page__skeleton-action"></span>
            </article>
        </section>

        <section v-else-if="loadError" class="portal-page__empty portal-page__empty--stacked">
            <strong>搜索结果加载失败</strong>
            <span>{{ loadError }}</span>
            <button class="portal-page__action" type="button" @click="loadSearchData">重新加载</button>
        </section>

        <section v-else-if="resultCount === 0" class="portal-page__empty portal-page__empty--stacked">
            <strong>{{ keyword ? '没有找到匹配结果' : '还没有输入搜索关键词' }}</strong>
            <span>{{ keyword ? '换个关键词，或切换搜索范围再试。' : '可以在顶部搜索栏输入资源名称、需求标题或编号。' }}</span>
        </section>

        <template v-else>
            <section v-if="filteredResources.length" class="portal-page__panel portal-search-page__section">
                <div class="portal-page__section-header">
                    <div>
                        <p class="portal-page__eyebrow">公开资源</p>
                        <h2>资源项目</h2>
                    </div>
                    <span class="portal-page__loading-chip">{{ filteredResources.length }} 条</span>
                </div>

                <div class="portal-page__card-grid portal-search-page__grid">
                    <article v-for="resource in filteredResources" :key="resource.id"
                        class="portal-page__card portal-search-result-card portal-search-result-card--resource"
                        role="button" tabindex="0" @click="openResource(resource)"
                        @keydown.enter="openResource(resource)" @keydown.space.prevent="openResource(resource)">
                        <div class="portal-search-result-card__cover">
                            <img v-if="resourceCoverUrl(resource)" :src="resourceCoverUrl(resource)"
                                :alt="`${resource.title} 封面`" />
                            <span v-else>{{ normalizeTagName(resource.platform).slice(0, 2) || '资' }}</span>
                        </div>
                        <div class="portal-search-result-card__body">
                            <div class="portal-page__card-topline">
                                <span class="portal-page__chip">{{ normalizeTagName(resource.platform) || '资源' }}</span>
                                <span class="portal-page__meta">{{ formatTimeLabel(resource.updated_at) }}</span>
                            </div>
                            <h3>{{ resource.title }}</h3>
                            <p>{{ resourceDescription(resource) }}</p>
                            <div class="portal-search-result-card__tags">
                                <span v-for="tag in resourceTags(resource)" :key="`${resource.id}-${tag}`">{{ tag
                                }}</span>
                            </div>
                            <div class="portal-page__card-footer">
                                <strong>{{ resource.creator || resource.author }}</strong>
                                <span>{{ resource.like_count }} 赞</span>
                            </div>
                        </div>
                    </article>
                </div>
            </section>

            <section v-if="filteredRequirements.length" class="portal-page__panel portal-search-page__section">
                <div class="portal-page__section-header">
                    <div>
                        <p class="portal-page__eyebrow">需求大厅</p>
                        <h2>需求项目</h2>
                    </div>
                    <span class="portal-page__loading-chip">{{ filteredRequirements.length }} 条</span>
                </div>

                <div class="portal-page__card-grid portal-search-page__grid">
                    <article v-for="requirement in filteredRequirements" :key="requirement.requirement_id"
                        class="portal-page__card portal-search-result-card" role="button" tabindex="0"
                        @click="openRequirement(requirement)" @keydown.enter="openRequirement(requirement)"
                        @keydown.space.prevent="openRequirement(requirement)">
                        <div class="portal-page__card-topline">
                            <span class="portal-page__chip">{{ paymentTag(requirement) }}</span>
                            <span class="portal-page__meta">{{ statusToLabel(requirement.status) }}</span>
                        </div>
                        <h3>{{ requirement.title }}</h3>
                        <p>{{ requirementDescription(requirement) }}</p>
                        <div class="portal-search-result-card__meta-row">
                            <span>{{ requirement.requirement_id }}</span>
                            <span>更新于 {{ formatTimeLabel(requirement.updated_at) }}</span>
                        </div>
                        <div class="portal-page__card-footer">
                            <strong>{{ formatMoney(requirement.budget) }}</strong>
                            <span class="portal-search-result-card__action">查看需求</span>
                        </div>
                    </article>
                </div>
            </section>

            <section v-if="filteredCommunityPosts.length" class="portal-page__panel portal-search-page__section">
                <div class="portal-page__section-header">
                    <div>
                        <p class="portal-page__eyebrow">社区内容</p>
                        <h2>社区帖子</h2>
                    </div>
                    <span class="portal-page__loading-chip">{{ filteredCommunityPosts.length }} 条</span>
                </div>

                <div class="portal-page__card-grid portal-search-page__grid">
                    <article v-for="post in filteredCommunityPosts" :key="post.id"
                        class="portal-page__card portal-search-result-card" role="button" tabindex="0"
                        @click="openCommunityPost(post)" @keydown.enter="openCommunityPost(post)"
                        @keydown.space.prevent="openCommunityPost(post)">
                        <div class="portal-page__card-topline">
                            <span class="portal-page__chip">{{ communityStatusLabel(post.status) }}</span>
                            <span class="portal-page__meta">{{ formatTimeLabel(post.updated_at) }}</span>
                        </div>
                        <h3>{{ post.title }}</h3>
                        <p>{{ communityDescription(post) }}</p>
                        <div class="portal-search-result-card__tags">
                            <span v-for="tag in post.tags.slice(0, 4)" :key="`${post.id}-${tag.id}`">
                                {{ tag.name }}
                            </span>
                        </div>
                        <div class="portal-page__card-footer">
                            <strong>{{ post.author }}</strong>
                            <span>{{ post.like_count }} 赞 · {{ post.comment_count }} 评论</span>
                        </div>
                    </article>
                </div>
            </section>
        </template>
    </main>

    <Teleport to="body">
        <div v-if="selectedRequirement" class="portal-search-detail-wrap" @click.self="closeRequirementDetail">
            <section class="portal-search-detail" :aria-label="`${selectedRequirement.title}详情`">
                <header class="portal-search-detail__head">
                    <div>
                        <span class="portal-page__chip">{{ paymentTag(selectedRequirement) }}</span>
                        <h3>{{ selectedRequirement.title }}</h3>
                        <p>
                            {{ selectedRequirement.requirement_id }} ·
                            {{ statusToLabel(selectedRequirement.status) }}
                        </p>
                    </div>
                    <button class="portal-search-detail__close" type="button" aria-label="关闭详情"
                        @click="closeRequirementDetail">
                        <el-icon>
                            <Close />
                        </el-icon>
                    </button>
                </header>

                <div class="portal-search-detail__meta">
                    <span>编号：{{ selectedRequirement.requirement_id }}</span>
                    <span>发布方式：{{ paymentTag(selectedRequirement) }}</span>
                    <span>状态：{{ statusToLabel(selectedRequirement.status) }}</span>
                    <span>更新：{{ formatTimeLabel(selectedRequirement.updated_at) }}</span>
                    <span>创建：{{ formatTimeLabel(selectedRequirement.created_at) }}</span>
                </div>

                <section class="portal-search-detail__review-panel">
                    <div class="portal-search-detail__review-item">
                        <span class="portal-search-detail__review-label">需求标题</span>
                        <div class="portal-search-detail__review-value">{{ selectedRequirement.title }}</div>
                    </div>

                    <div class="portal-search-detail__review-item">
                        <span class="portal-search-detail__review-label">需求描述</span>
                        <article
                            class="portal-search-detail__review-value portal-search-detail__review-value--multiline portal-search-detail__rich"
                            v-html="selectedRequirementDescriptionHtml"></article>
                    </div>

                    <div class="portal-search-detail__review-grid">
                        <div class="portal-search-detail__review-item">
                            <span class="portal-search-detail__review-label">预算</span>
                            <div class="portal-search-detail__review-value">
                                {{ formatMoney(selectedRequirement.budget) }}
                            </div>
                        </div>

                        <div class="portal-search-detail__review-item">
                            <span class="portal-search-detail__review-label">验收标准</span>
                            <article
                                class="portal-search-detail__review-value portal-search-detail__review-value--multiline portal-search-detail__rich"
                                v-html="selectedRequirementAcceptanceHtml"></article>
                        </div>
                    </div>
                </section>

                <div v-if="auth.isAuthed" class="portal-search-detail__actions">
                    <button class="portal-search-detail__bind" type="button"
                        @click="openRequirementWorkbench(selectedRequirement)">
                        <el-icon>
                            <Connection />
                        </el-icon>
                        <span>前往工作台接取需求</span>
                    </button>
                </div>
            </section>
        </div>
    </Teleport>
</template>

<style scoped>
.portal-search-page {
    gap: 18px;
}

.portal-search-page__hero {
    display: grid;
    gap: 10px;
}

.portal-search-page__header {
    margin-bottom: 0;
}

.portal-search-page__summary {
    margin: 8px 0 0;
    color: #64748b;
    font-size: 14px;
    font-weight: 700;
}

.portal-search-page__section {
    display: grid;
    gap: 14px;
}

.portal-search-page__section .portal-page__section-header {
    margin-bottom: 0;
}

.portal-search-page__grid {
    gap: 14px;
}

.portal-search-result-card {
    min-height: 220px;
    cursor: pointer;
    transition:
        border-color 180ms ease,
        box-shadow 180ms ease,
        transform 180ms ease;
}

.portal-search-result-card:hover,
.portal-search-result-card:focus-visible {
    border-color: rgba(96, 165, 250, 0.84);
    box-shadow: 0 20px 42px rgba(37, 99, 235, 0.12);
    outline: none;
    transform: translateY(-2px);
}

.portal-search-result-card h3 {
    margin: 0;
    color: #0f172a;
    font-size: 20px;
    line-height: 1.35;
}

.portal-search-result-card p {
    display: -webkit-box;
    min-height: 44px;
    margin: 0;
    overflow: hidden;
    color: #64748b;
    line-height: 1.65;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}

.portal-search-result-card--resource {
    display: grid;
    grid-template-columns: 128px minmax(0, 1fr);
    gap: 16px;
}

.portal-search-result-card__cover {
    display: grid;
    place-items: center;
    overflow: hidden;
    min-height: 150px;
    border-radius: 18px;
    background: linear-gradient(135deg, #dbeafe, #eff6ff);
    color: #2563eb;
    font-size: 22px;
    font-weight: 900;
}

.portal-search-result-card__cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.portal-search-result-card__body {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 12px;
}

.portal-search-result-card__tags,
.portal-search-result-card__meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.portal-search-result-card__tags span,
.portal-search-result-card__meta-row span {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    padding: 4px 9px;
    border-radius: 999px;
    background: rgba(248, 250, 252, 0.96);
    color: #475569;
    font-size: 12px;
    font-weight: 800;
    box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.92);
}

.portal-search-result-card__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 32px;
    padding: 0 13px;
    border-radius: 999px;
    background: rgba(219, 234, 254, 0.86);
    color: #2563eb;
    font-size: 13px;
    font-weight: 900;
    line-height: 1;
    box-shadow: inset 0 0 0 1px rgba(147, 197, 253, 0.72);
    transition:
        background-color 160ms ease,
        box-shadow 160ms ease,
        color 160ms ease,
        transform 160ms ease;
}

.portal-search-result-card__action::after {
    content: '›';
    margin-left: 6px;
    font-size: 16px;
    line-height: 1;
}

.portal-search-result-card:hover .portal-search-result-card__action,
.portal-search-result-card:focus-visible .portal-search-result-card__action {
    background: #2563eb;
    color: #fff;
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18);
    transform: translateX(1px);
}

.portal-search-detail-wrap {
    position: fixed;
    inset: 0;
    z-index: 1300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    background: rgba(15, 23, 42, 0.28);
    backdrop-filter: blur(5px);
}

.portal-search-detail {
    width: min(860px, 100%);
    max-height: min(760px, calc(100dvh - 32px));
    overflow-y: auto;
    border: 1px solid rgba(203, 213, 225, 0.82);
    border-radius: 18px;
    background: #fff;
    box-shadow: 0 28px 72px rgba(15, 23, 42, 0.22);
}

.portal-search-detail__head {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 22px 16px;
    border-bottom: 1px solid rgba(226, 232, 240, 0.84);
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(12px);
}

.portal-search-detail__head h3 {
    margin: 10px 0 6px;
    color: #0f172a;
    font-size: 22px;
    line-height: 1.3;
}

.portal-search-detail__head p {
    margin: 0;
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
}

.portal-search-detail__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border: 1px solid rgba(203, 213, 225, 0.86);
    border-radius: 10px;
    background: #fff;
    color: #334155;
    cursor: pointer;
}

.portal-search-detail__close:hover,
.portal-search-detail__close:focus-visible {
    border-color: rgba(37, 99, 235, 0.34);
    color: #2563eb;
    outline: none;
}

.portal-search-detail__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    padding: 14px 22px;
    border-bottom: 1px solid rgba(226, 232, 240, 0.76);
    color: #475569;
    font-size: 13px;
    font-weight: 800;
}

.portal-search-detail__review-panel {
    display: grid;
    gap: 12px;
    margin: 16px 22px;
    padding: 16px;
    border: 1px solid rgba(17, 24, 39, 0.08);
    border-radius: 18px;
    background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.92));
}

.portal-search-detail__review-grid {
    display: grid;
    grid-template-columns: minmax(0, 160px) minmax(0, 1fr);
    gap: 12px;
    align-items: stretch;
}

.portal-search-detail__review-item {
    display: grid;
    gap: 8px;
    min-width: 0;
}

.portal-search-detail__review-grid .portal-search-detail__review-item {
    grid-template-rows: auto 1fr;
}

.portal-search-detail__review-label {
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    line-height: 1.35;
}

.portal-search-detail__review-value {
    min-width: 0;
    padding: 12px 14px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.9);
    color: #0f172a;
    font-weight: 700;
    line-height: 1.7;
    box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}

.portal-search-detail__review-value--multiline {
    min-height: 96px;
}

.portal-search-detail__review-grid .portal-search-detail__review-value {
    height: 100%;
}

.portal-search-detail__review-grid div.portal-search-detail__review-value {
    display: flex;
    align-items: center;
}

.portal-search-detail__rich :deep(p) {
    margin: 0 0 10px;
}

.portal-search-detail__rich :deep(p:last-child) {
    margin-bottom: 0;
}

.portal-search-detail__rich :deep(ul),
.portal-search-detail__rich :deep(ol) {
    margin: 8px 0;
    padding-left: 22px;
}

.portal-search-detail__actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 0 22px 22px;
    background: rgba(248, 250, 252, 0.62);
}

.portal-search-detail__bind {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 16px;
    border: 1px solid rgba(37, 99, 235, 0.34);
    border-radius: 8px;
    background: #2563eb;
    color: #fff;
    font-size: 14px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.16);
    transition:
        background-color 160ms ease,
        border-color 160ms ease,
        box-shadow 160ms ease,
        transform 160ms ease;
}

.portal-search-detail__bind:hover,
.portal-search-detail__bind:focus-visible {
    border-color: rgba(29, 78, 216, 0.42);
    background: #1d4ed8;
    box-shadow: 0 10px 22px rgba(37, 99, 235, 0.22);
    outline: none;
    transform: translateY(-1px);
}

@media (max-width: 860px) {
    .portal-search-page__grid {
        grid-template-columns: 1fr;
    }

    .portal-search-result-card--resource {
        grid-template-columns: 1fr;
    }

    .portal-search-result-card__cover {
        min-height: 180px;
    }

    .portal-search-detail__review-grid {
        grid-template-columns: 1fr;
    }
}
</style>