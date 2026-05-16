<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { apiUrl } from '@/api/http'
import { listPublicMcResources, type McResourcePlatform, type PublicMcResourceItem } from '@/api/resources'
import { getProcessedTagTree, getResourceDetailSlug, getTagFilterSections, type McTagFilterSection } from '@/api/resourceTags'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

type MobileCard = {
    id: number
    title: string
    desc: string
    likeCount: number
    author: string
    ownerName: string
    updatedAt: string
    img: string | null
    groupTags: Record<string, string[]>
    tagsText: string
}

type SectionView = McTagFilterSection & {
    selected: string[]
}

type RootOption = {
    key: string
    label: string
    firstEntryKey: string | null
}

type EntryOption = {
    key: string
    label: string
}

const props = defineProps<{
    platform: McResourcePlatform
    rootSlug: string
    entrySlug: string
    groupName: string
}>()

const { showToast } = useToast()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const sort = ref<'latest' | 'like'>('latest')
const menuOpen = ref(false)
const keyword = ref('')
const pageSize = 10
const visibleCount = ref(pageSize)
const currentRootLabel = ref('')
const currentEntryLabel = ref('')
const rootOptions = ref<RootOption[]>([])
const entryOptions = ref<EntryOption[]>([])
const rootDropdownOpen = ref(false)
const entryDropdownOpen = ref(false)

const cards = ref<MobileCard[]>([])
const filterSections = ref<SectionView[]>([])

const filteredItems = computed(() => {
    const query = keyword.value.trim().toLowerCase()

    const data = cards.value.filter((card) => {
        if (query) {
            const haystack = `${card.title} ${card.desc} ${card.author} ${card.tagsText}`.toLowerCase()
            if (!haystack.includes(query)) {
                return false
            }
        }

        for (const section of filterSections.value) {
            if (section.selected.length === 0) {
                continue
            }

            const selectedSet = new Set(section.selected)
            const groupValues = card.groupTags[section.label] ?? []
            const matched = groupValues.some((value) => selectedSet.has(value))
            if (!matched) {
                return false
            }
        }

        return true
    })

    if (sort.value === 'like') {
        return data.slice().sort((a, b) => b.likeCount - a.likeCount)
    }

    return data.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
})

const visibleItems = computed(() => filteredItems.value.slice(0, visibleCount.value))

function mapResourceToCard(item: PublicMcResourceItem): MobileCard {
    const groupTags = Object.fromEntries(
        item.tag_selections.map((entry) => [entry.group_name, entry.tag_names]),
    )

    return {
        id: item.id,
        title: item.title,
        desc: item.description || '暂无描述',
        likeCount: item.like_count ?? 0,
        author: item.author || item.creator,
        ownerName: item.creator.trim() || item.author.trim() || item.title,
        updatedAt: item.updated_at,
        img: item.cover_url ? apiUrl(item.cover_url) : null,
        groupTags,
        tagsText: item.tag_selections.flatMap((entry) => entry.tag_names).join(' '),
    }
}

function openMenu() {
    menuOpen.value = true
}

function closeMenu() {
    menuOpen.value = false
    rootDropdownOpen.value = false
    entryDropdownOpen.value = false
}

function toggleRootDropdown() {
    rootDropdownOpen.value = !rootDropdownOpen.value
    if (rootDropdownOpen.value) {
        entryDropdownOpen.value = false
    }
}

function toggleEntryDropdown() {
    entryDropdownOpen.value = !entryDropdownOpen.value
    if (entryDropdownOpen.value) {
        rootDropdownOpen.value = false
    }
}

function selectRoot(option: RootOption) {
    rootDropdownOpen.value = false
    entryDropdownOpen.value = false
    if (option.key === props.rootSlug) {
        return
    }

    const targetEntry = option.firstEntryKey
    if (!targetEntry) {
        return
    }

    void router.push({
        name: 'resource-catalog',
        params: {
            rootSlug: option.key,
            entrySlug: targetEntry,
        },
    })
}

function selectEntry(entry: EntryOption) {
    entryDropdownOpen.value = false
    if (entry.key === props.entrySlug) {
        return
    }

    void router.push({
        name: 'resource-catalog',
        params: {
            rootSlug: props.rootSlug,
            entrySlug: entry.key,
        },
    })
}

function toggleSectionTag(sectionId: number, tag: string) {
    const section = filterSections.value.find((entry) => entry.id === sectionId)
    if (!section) {
        return
    }

    if (section.selected.includes(tag)) {
        section.selected = section.selected.filter((item) => item !== tag)
        return
    }

    section.selected = [...section.selected, tag]
}

function resetFilters() {
    sort.value = 'latest'
    keyword.value = ''
    filterSections.value.forEach((section) => {
        section.selected = []
    })
    visibleCount.value = pageSize
}

function applyFilters() {
    visibleCount.value = pageSize
    closeMenu()
}

function loadMore() {
    visibleCount.value += pageSize
}

function openResource(card: MobileCard) {
    void router.push({
        name: 'resource-detail',
        params: {
            rootSlug: props.rootSlug,
            entrySlug: props.entrySlug,
            resourceSlug: getResourceDetailSlug(card.id, card.ownerName),
        },
    })
}

function formatUpdatedAt(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        return '最近'
    }

    return date.toLocaleDateString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
    })
}

async function loadData() {
    if (!props.platform) {
        cards.value = []
        filterSections.value = []
        return
    }

    try {
        const token = auth.token?.trim() ? auth.token : null
        const [tree, resources] = await Promise.all([
            getProcessedTagTree(),
            listPublicMcResources(props.platform, token),
        ])

        const rootNode = tree.roots.find((root) => root.key === props.rootSlug)
        const entryNode = rootNode?.entries.find((entry) => entry.key === props.entrySlug) ?? null
        rootOptions.value = tree.roots.map((root) => ({
            key: root.key,
            label: root.label,
            firstEntryKey: root.first_entry_key,
        }))
        entryOptions.value = (rootNode?.entries ?? []).map((entry) => ({
            key: entry.key,
            label: entry.group_name,
        }))
        currentRootLabel.value = rootNode?.label || props.rootSlug
        currentEntryLabel.value = entryNode?.group_name || props.groupName

        cards.value = resources.map(mapResourceToCard)
        filterSections.value = getTagFilterSections(tree, props.rootSlug, props.entrySlug).map((section) => ({
            ...section,
            selected: [],
        }))
        visibleCount.value = pageSize
    } catch (error) {
        showToast(error instanceof Error ? error.message : '加载资源失败', 'warning')
    }
}

onMounted(() => {
    auth.hydrate()
    void loadData()
})

watch(
    () => [props.platform, props.rootSlug, props.entrySlug],
    () => {
        resetFilters()
        void loadData()
    },
)

watch(
    () => filteredItems.value.length,
    () => {
        if (visibleCount.value < pageSize) {
            visibleCount.value = pageSize
        }
    },
)
</script>

<template>
    <section class="mobile-resource-page">
        <header class="mobile-resource-header">
            <button class="mobile-icon-btn" type="button" aria-label="打开菜单" @click="openMenu">
                ≡
            </button>
            <input v-model="keyword" class="mobile-search-input" type="search" placeholder="搜索公开资源..." />
        </header>

        <aside v-if="menuOpen" class="mobile-menu-mask" @click.self="closeMenu">
            <section class="mobile-menu-drawer" aria-label="筛选菜单">
                <header class="mobile-menu-head">
                    <h3>筛选</h3>
                    <button class="mobile-icon-btn" type="button" aria-label="关闭菜单" @click="closeMenu">
                        ×
                    </button>
                </header>

                <div class="mobile-menu-body">
                    <div class="mobile-level-card">
                        <div class="mobile-level-item">
                            <button type="button" class="mobile-level-trigger" @click="toggleRootDropdown">
                                <strong>{{ currentRootLabel }}</strong>
                            </button>
                            <div v-if="rootDropdownOpen" class="mobile-level-options">
                                <button v-for="option in rootOptions" :key="option.key" type="button"
                                    class="mobile-level-option"
                                    :class="{ 'mobile-level-option--active': option.key === props.rootSlug }"
                                    @click="selectRoot(option)">
                                    {{ option.label }}
                                </button>
                            </div>
                        </div>

                        <div class="mobile-level-item">
                            <button type="button" class="mobile-level-trigger" @click="toggleEntryDropdown">
                                <strong>{{ currentEntryLabel }}</strong>
                            </button>
                            <div v-if="entryDropdownOpen" class="mobile-level-options">
                                <button v-for="option in entryOptions" :key="option.key" type="button"
                                    class="mobile-level-option"
                                    :class="{ 'mobile-level-option--active': option.key === props.entrySlug }"
                                    @click="selectEntry(option)">
                                    {{ option.label }}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div v-for="section in filterSections" :key="section.id" class="mobile-menu-group">
                        <p>{{ section.label }}</p>
                        <div class="mobile-chip-row">
                            <button v-for="tag in section.tags" :key="tag" type="button"
                                :class="['mobile-chip', { 'mobile-chip--active': section.selected.includes(tag) }]"
                                @click="toggleSectionTag(section.id, tag)">
                                {{ tag }}
                            </button>
                        </div>
                    </div>
                </div>

                <footer class="mobile-menu-foot">
                    <button type="button" class="mobile-foot-btn mobile-foot-btn--ghost" @click="resetFilters">
                        重置
                    </button>
                    <button type="button" class="mobile-foot-btn mobile-foot-btn--primary" @click="applyFilters">
                        应用筛选
                    </button>
                </footer>
            </section>
        </aside>

        <nav class="mobile-filter-bar" aria-label="移动端排序栏">
            <button type="button" :class="{ active: sort === 'latest' }" @click="sort = 'latest'">最新</button>
            <button type="button" :class="{ active: sort === 'like' }" @click="sort = 'like'">点赞</button>
            <button type="button" @click="openMenu">筛选</button>
        </nav>

        <section class="mobile-card-list">
            <article v-for="item in visibleItems" :key="item.id" class="mobile-card" @click="openResource(item)">
                <div class="card-thumb">
                    <img v-if="item.img" :src="item.img" :alt="item.title" />
                    <span v-else class="card-thumb-fallback">📦</span>
                </div>
                <div class="card-body">
                    <h3 class="card-title">{{ item.title }}</h3>
                    <p class="card-desc">{{ item.desc }}</p>
                    <div class="card-stats">
                        <span>♥ {{ item.likeCount }}</span>
                        <span>标签 {{ item.tagsText ? item.tagsText.split(' ').length : 0 }}</span>
                    </div>
                    <div class="card-meta">by {{ item.author }} | {{ formatUpdatedAt(item.updatedAt) }}</div>
                </div>
            </article>

            <p v-if="filteredItems.length === 0" class="mobile-empty">暂无符合条件的资源</p>
            <button v-else-if="visibleItems.length < filteredItems.length" class="load-more" type="button"
                @click="loadMore">加载更多</button>
        </section>
    </section>
</template>

<style scoped>
.mobile-resource-page {
    width: 100%;
    margin: 0 auto;
    background: #f8fafc;
    padding-bottom: 92px;
}

.mobile-resource-header {
    position: sticky;
    top: 0;
    z-index: 12;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.96);
    border-bottom: 1px solid #e5e7eb;
}

.mobile-icon-btn {
    border: 0;
    border-radius: 10px;
    min-width: 36px;
    min-height: 36px;
    background: #eef2ff;
    color: #1f2937;
    font-size: 20px;
    line-height: 1;
}

.mobile-search-input {
    width: 100%;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #f8fafc;
    padding: 8px 12px;
    font-size: 14px;
}

.mobile-menu-mask {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgba(15, 23, 42, 0.32);
}

.mobile-menu-drawer {
    width: 100%;
    max-width: 320px;
    height: 100%;
    background: #fff;
    box-shadow: 10px 0 28px rgba(15, 23, 42, 0.18);
    display: grid;
    grid-template-rows: auto 1fr auto;
}

.mobile-menu-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 12px;
    border-bottom: 1px solid #e5e7eb;
}

.mobile-menu-head h3 {
    margin: 0;
    font-size: 16px;
    color: #0f172a;
}

.mobile-menu-body {
    padding: 14px 12px 18px;
    display: grid;
    gap: 14px;
    overflow-y: auto;
}

.mobile-menu-group p {
    margin: 0 0 8px;
    color: #475569;
    font-size: 13px;
    font-weight: 700;
}

.mobile-menu-group {
    padding: 12px;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    background: #ffffff;
}

.mobile-level-card {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px;
    border-radius: 16px;
    background: #eff6ff;
}

.mobile-level-item {
    flex: 1 1 calc(50% - 5px);
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mobile-level-item strong {
    color: #1d4ed8;
    font-size: 13px;
    font-weight: 700;
}

.mobile-level-trigger {
    border: 1px solid #c7d2fe;
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 12px 14px;
    border-radius: 14px;
    color: #0f172a;
    min-height: 48px;
}

.mobile-level-trigger strong {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mobile-level-options {
    display: grid;
    gap: 8px;
    margin-top: 8px;
}

.mobile-level-option {
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    background: #ffffff;
    padding: 8px 10px;
    text-align: left;
}

.mobile-level-option--active {
    border-color: #93c5fd;
    background: #eff6ff;
    color: #1d4ed8;
}

.mobile-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.mobile-chip {
    border: 0;
    border-radius: 999px;
    padding: 8px 14px;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 13px;
    font-weight: 700;
}

.mobile-chip--active {
    color: #fff;
    background: linear-gradient(135deg, #2563eb, #4f8cff);
}

.mobile-menu-foot {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 12px;
    border-top: 1px solid #e5e7eb;
    background: #fff;
}

.mobile-foot-btn {
    border-radius: 10px;
    padding: 10px 0;
    font-size: 14px;
    font-weight: 700;
}

.mobile-foot-btn--ghost {
    border: 1px solid #dbeafe;
    background: #fff;
    color: #334155;
}

.mobile-foot-btn--primary {
    border: 0;
    background: linear-gradient(135deg, #2563eb, #4f8cff);
    color: #fff;
}

.mobile-filter-bar {
    position: sticky;
    top: 58px;
    z-index: 11;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.96);
    border-bottom: 1px solid #e5e7eb;
}

.mobile-filter-bar button {
    flex: 1 1 0;
    min-width: 0;
    border: 0;
    border-radius: 999px;
    padding: 10px 14px;
    background: #eef2ff;
    color: #1d4ed8;
    font-size: 14px;
    font-weight: 700;
}

.mobile-filter-bar button.active {
    color: #fff;
    background: linear-gradient(135deg, #2563eb, #4f8cff);
}

.mobile-card-list {
    padding: 12px;
    display: grid;
    gap: 12px;
}

.mobile-card {
    display: flex;
    gap: 12px;
    padding: 12px;
    border-radius: 14px;
    border: 1px solid #dbe2ef;
    background: #fff;
    cursor: pointer;
}

.card-thumb {
    width: 74px;
    height: 74px;
    border-radius: 12px;
    overflow: hidden;
    flex-shrink: 0;
    background: #e2e8f0;
}

.card-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.card-thumb-fallback {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    font-size: 26px;
}

.card-body {
    flex: 1;
    min-width: 0;
}

.card-title {
    margin: 0;
    font-size: 18px;
    line-height: 1.3;
    color: #0f172a;
}

.card-desc {
    margin: 6px 0;
    font-size: 15px;
    color: #475569;
}

.card-stats {
    display: flex;
    gap: 12px;
    margin-bottom: 4px;
    color: #334155;
    font-size: 13px;
}

.card-meta {
    color: #64748b;
    font-size: 12px;
}

.load-more {
    border: 0;
    border-radius: 10px;
    padding: 11px 0;
    background: #2563eb;
    color: #fff;
    font-size: 15px;
    font-weight: 700;
}

.mobile-empty {
    margin: 8px 0;
    padding: 18px;
    text-align: center;
    border-radius: 10px;
    background: #fff;
    border: 1px solid #dbe2ef;
    color: #64748b;
}
</style>
