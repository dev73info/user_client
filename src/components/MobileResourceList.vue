<script setup lang="ts">
import {
    ArrowDown,
    Box,
    Close,
    CollectionTag,
    Grid,
    Menu as MenuIcon,
    Monitor,
    Search,
} from '@element-plus/icons-vue'
import { computed, onMounted, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { apiUrl } from '@/api/http'
import {
    listPublicMcResources,
    type McResourcePlatform,
    type PublicMcResourceItem,
} from '@/api/resources'
import {
    getResourceDetailSlug,
    getTagFilterSections,
    type McTagFilterSection,
} from '@/api/resourceTags'
import { useTagTreeStore } from '@/stores/tagTree'
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
const tagTreeStore = useTagTreeStore()
const route = useRoute()
const router = useRouter()

const sortMode = ref<'latest' | 'like'>('latest')
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
const expandedSectionIds = ref<number[]>([])

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

    if (sortMode.value === 'like') {
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

function isSectionExpanded(sectionId: number) {
    return expandedSectionIds.value.includes(sectionId)
}

function toggleSection(sectionId: number) {
    if (isSectionExpanded(sectionId)) {
        expandedSectionIds.value = expandedSectionIds.value.filter((id) => id !== sectionId)
        return
    }

    expandedSectionIds.value = [...expandedSectionIds.value, sectionId]
}

function getSectionIcon(label: string): Component {
    if (label.includes('适用') || label.includes('端')) {
        return Monitor
    }
    if (label.includes('版本')) {
        return CollectionTag
    }
    if (label.includes('加载')) {
        return Box
    }
    if (label.includes('类别') || label.includes('分类')) {
        return Grid
    }
    return CollectionTag
}

function syncExpandedSections() {
    if (filterSections.value.length === 0) {
        expandedSectionIds.value = []
        return
    }

    const validIds = new Set(filterSections.value.map((section) => section.id))
    const retained = expandedSectionIds.value.filter((id) => validIds.has(id))
    expandedSectionIds.value = retained
}

function openMenu() {
    menuOpen.value = true
    syncExpandedSections()
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
    sortMode.value = 'latest'
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
        const tree = await tagTreeStore.ensure()
        const resources = await listPublicMcResources(props.platform, token)

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
        filterSections.value = getTagFilterSections(tree, props.rootSlug, props.entrySlug).map(
            (section) => ({
                ...section,
                selected: [],
            }),
        )
        syncExpandedSections()
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
    <section class="mobile-resource-page" :class="{ 'mobile-resource-page--menu-open': menuOpen }">
        <button v-if="menuOpen" class="mobile-resource-menu-backdrop" type="button" aria-label="关闭筛选菜单"
            @click="closeMenu" />

        <aside class="mobile-menu-drawer" aria-label="筛选菜单" :aria-hidden="!menuOpen">
            <section class="mobile-menu-drawer-shell">
                <header class="mobile-menu-head">
                    <div class="mobile-menu-head-copy">
                        <strong>筛选</strong>
                    </div>
                    <button class="mobile-menu-drawer-close" type="button" aria-label="关闭筛选菜单" @click="closeMenu">
                        <el-icon>
                            <Close />
                        </el-icon>
                    </button>
                </header>

                <div class="mobile-menu-body">
                    <div class="mobile-level-row">
                        <div class="mobile-level-item">
                            <button type="button" class="mobile-level-trigger" @click="toggleRootDropdown">
                                <strong>{{ currentRootLabel }}</strong>
                            </button>
                            <div v-if="rootDropdownOpen" class="mobile-level-options">
                                <button v-for="option in rootOptions" :key="option.key" type="button"
                                    class="mobile-level-option" :class="{
                                        'mobile-level-option--active': option.key === props.rootSlug,
                                    }" @click="selectRoot(option)">
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
                                    class="mobile-level-option" :class="{
                                        'mobile-level-option--active': option.key === props.entrySlug,
                                    }" @click="selectEntry(option)">
                                    {{ option.label }}
                                </button>
                            </div>
                        </div>
                    </div>

                    <section v-for="section in filterSections" :key="section.id" class="mobile-menu-group" :class="{
                        'mobile-menu-group--open': isSectionExpanded(section.id),
                        'mobile-menu-group--active': section.selected.length > 0,
                    }">
                        <button type="button" class="mobile-menu-group-trigger"
                            :aria-expanded="isSectionExpanded(section.id)" @click="toggleSection(section.id)">
                            <span class="mobile-menu-group-title">{{ section.label }}</span>
                            <span v-if="section.selected.length > 0" class="mobile-menu-group-count">
                                {{ section.selected.length }}
                            </span>
                            <span class="mobile-menu-group-chevron" aria-hidden="true" />
                        </button>
                        <div class="mobile-menu-group-panel"
                            :class="{ 'mobile-menu-group-panel--open': isSectionExpanded(section.id) }">
                            <div class="mobile-menu-group-body">
                                <div class="mobile-chip-row">
                                    <button v-for="tag in section.tags" :key="tag" type="button" :class="[
                                        'mobile-chip',
                                        { 'mobile-chip--active': section.selected.includes(tag) },
                                    ]" @click.stop="toggleSectionTag(section.id, tag)">
                                        {{ tag }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
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

        <header class="mobile-resource-header">
            <button class="mobile-resource-menu-btn" type="button" aria-label="打开筛选菜单" @click="openMenu">
                <el-icon>
                    <MenuIcon />
                </el-icon>
                <span>筛选</span>
            </button>
            <form class="mobile-search-form" @submit.prevent>
                <el-icon class="mobile-search-icon">
                    <Search />
                </el-icon>
                <input v-model="keyword" class="mobile-search-input" type="search" placeholder="搜索公开资源..." />
            </form>
            <div>
                <el-dropdown trigger="click" popper-class="mobile-sort-dropdown" placement="bottom-end"
                    :offset="[-6, 4]" @command="(cmd: string) => (sortMode = cmd as 'latest' | 'like')">
                    <button class="mobile-sort-btn" type="button">
                        <el-icon>
                            <ArrowDown />
                        </el-icon>
                        <span>{{ sortMode === 'like' ? '点赞' : '最新' }}</span>
                    </button>
                    <template #dropdown>
                        <el-dropdown-menu>
                            <el-dropdown-item command="latest" :class="{ 'is-active': sortMode === 'latest' }">
                                最新
                            </el-dropdown-item>
                            <el-dropdown-item command="like" :class="{ 'is-active': sortMode === 'like' }">
                                点赞
                            </el-dropdown-item>
                        </el-dropdown-menu>
                    </template>
                </el-dropdown>
            </div>
        </header>

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
                @click="loadMore">
                加载更多
            </button>
        </section>
    </section>
</template>

<style scoped>
.mobile-resource-page {
    width: 100%;
    margin: 0 auto;
    background: #f8fafc;
    padding: 0 0 0px;
}

.mobile-resource-header {
    position: sticky;
    top: 8px;
    z-index: 12;
    display: flex;
    align-items: center;
    gap: 10px;
    width: calc(100% - 16px);
    margin: 8px 8px 12px;
    height: auto;
    min-height: 66px;
    padding: 12px;
    border: 1px solid rgba(224, 232, 255, 0.96);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 10px 24px rgba(76, 103, 172, 0.08);
}

.mobile-resource-menu-btn,
.mobile-resource-menu-backdrop,
.mobile-menu-drawer-close {
    border: 0;
    font: inherit;
    cursor: pointer;
}

.mobile-resource-menu-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    min-height: 38px;
    padding: 0 12px;
    border-radius: 12px;
    background: rgba(219, 234, 254, 0.9);
    color: #1d4ed8;
    font-size: 13px;
    font-weight: 800;
}

.mobile-resource-menu-btn .el-icon {
    font-size: 16px;
}

.mobile-search-form {
    display: inline-flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    gap: 9px;
    padding: 0 10px 0 12px;
    min-height: 38px;
    border-radius: 999px;
    border: 1px solid rgba(203, 213, 225, 0.86);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.94));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
    color: #64748b;
    transition:
        background-color 160ms ease,
        border-color 160ms ease,
        box-shadow 160ms ease,
        color 160ms ease;
}

.mobile-search-form:hover,
.mobile-search-form:focus-within {
    border-color: rgba(147, 197, 253, 0.96);
    background: #fff;
}

.mobile-search-icon {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    font-size: 18px;
    color: #64748b;
    transition: color 160ms ease;
}

.mobile-search-form:hover .mobile-search-icon,
.mobile-search-form:focus-within .mobile-search-icon {
    color: #2563eb;
}

.mobile-sort-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    min-height: 38px;
    padding: 0 12px;
    border: 0;
    border-radius: 12px;
    background: rgba(219, 234, 254, 0.9);
    color: #1d4ed8;
    font-size: 13px;
    font-weight: 800;
    fill: #1d4ed8;
}

.mobile-sort-btn .el-icon {
    font-size: 16px;
}

.mobile-search-input {
    flex: 1;
    min-width: 0;
    height: 40px;
    border: 0;
    outline: 0;
    appearance: none;
    background: transparent;
    caret-color: #2563eb;
    color: #0f172a;
    font: inherit;
    font-size: 14px;
    line-height: 1.4;
    text-overflow: ellipsis;
}

.mobile-search-input::placeholder {
    color: #94a3b8;
    font-weight: 500;
}

.mobile-search-input::-webkit-search-cancel-button,
.mobile-search-input::-webkit-search-decoration {
    appearance: none;
    display: none;
}

.mobile-resource-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: rgba(15, 23, 42, 0.36);
    backdrop-filter: blur(2px);
    animation: mobile-resource-backdrop-in 220ms ease;
}

.mobile-menu-drawer {
    --mobile-dock-clearance: calc(108px + env(safe-area-inset-bottom, 0px));
    position: fixed;
    top: 0;
    bottom: var(--mobile-dock-clearance);
    left: 0;
    z-index: 80;
    width: min(84vw, 320px);
    transform: translateX(-104%);
    transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
    pointer-events: none;
    border: 1px solid rgba(224, 232, 255, 0.96);
    border-left: 0;
    border-radius: 0 22px 22px 0;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 14px 34px rgba(76, 103, 172, 0.12);
}

.mobile-resource-page--menu-open .mobile-menu-drawer {
    transform: translateX(0);
    pointer-events: auto;
}

.mobile-menu-drawer-shell {
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
}

.mobile-menu-head {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 16px 12px;
    border-bottom: 1px solid rgba(226, 232, 240, 0.82);
    background: #fff;
}

.mobile-menu-head-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
}

.mobile-menu-head-copy strong {
    color: #0f172a;
    font-size: 18px;
    line-height: 1.2;
}

.mobile-menu-head-copy span {
    overflow: hidden;
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mobile-menu-drawer-close {
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    border-radius: 11px;
    background: rgba(239, 246, 255, 0.94);
    color: #1d4ed8;
}

.mobile-menu-drawer-close .el-icon {
    font-size: 16px;
}

@keyframes mobile-resource-backdrop-in {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}

.mobile-menu-body {
    flex: 1 1 auto;
    min-height: 0;
    padding: 12px 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    background: #fff;
}

.mobile-menu-group {
    flex: 0 0 auto;
    width: 100%;
    border: 1px solid #e8eef5;
    border-radius: 12px;
    background: #fff;
    overflow: hidden;
}

.mobile-menu-group--open {
    border-color: #bfdbfe;
}

.mobile-menu-group--active:not(.mobile-menu-group--open) .mobile-menu-group-trigger {
    color: #1d4ed8;
}

.mobile-menu-group-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    margin: 0;
    padding: 14px 12px;
    border: 0;
    border-radius: 12px;
    background: #fff;
    color: #334155;
    cursor: pointer;
    text-align: left;
    transition:
        background 220ms ease,
        color 220ms ease;
}

.mobile-menu-group--open .mobile-menu-group-trigger {
    border-radius: 12px 12px 0 0;
    background: #eff6ff;
    color: #1d4ed8;
}

.mobile-menu-group-title {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
}

.mobile-menu-group-count {
    min-width: 20px;
    padding: 2px 7px;
    border-radius: 999px;
    background: #2563eb;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.4;
    text-align: center;
}

.mobile-menu-group-chevron {
    width: 8px;
    height: 8px;
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: rotate(-45deg);
    transition: transform 280ms cubic-bezier(0.33, 1, 0.68, 1);
    flex-shrink: 0;
}

.mobile-menu-group--open .mobile-menu-group-chevron {
    transform: rotate(45deg);
}

.mobile-menu-group-panel {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 320ms cubic-bezier(0.33, 1, 0.68, 1);
}

.mobile-menu-group-panel--open {
    grid-template-rows: 1fr;
}

.mobile-menu-group-body {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    overflow: hidden;
    background: #fff;
    opacity: 0;
    border-top: 1px solid transparent;
    transition:
        opacity 220ms ease,
        border-color 220ms ease;
}

.mobile-menu-group-panel:not(.mobile-menu-group-panel--open) .mobile-menu-group-body {
    pointer-events: none;
}

.mobile-menu-group-panel--open .mobile-menu-group-body {
    padding: 10px 12px 12px;
    opacity: 1;
    border-top-color: #e8eef5;
    transition:
        opacity 280ms ease 60ms,
        border-color 280ms ease;
}

.mobile-menu-group .mobile-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
}

@media (prefers-reduced-motion: reduce) {

    .mobile-menu-drawer,
    .mobile-resource-menu-backdrop {
        animation: none;
        transition: none;
    }

    .mobile-menu-group,
    .mobile-menu-group-trigger,
    .mobile-menu-group-chevron,
    .mobile-menu-group-panel,
    .mobile-menu-group-body {
        transition: none;
    }
}

.mobile-level-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.mobile-level-item {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
}

.mobile-level-item:has(.mobile-level-options) {
    z-index: 1;
}

.mobile-level-trigger {
    border: 1px solid #bfdbfe;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 12px 10px;
    border-radius: 12px;
    color: #1d4ed8;
    font: inherit;
    min-height: 44px;
    cursor: pointer;
}

.mobile-level-trigger strong {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mobile-level-options {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    display: grid;
    gap: 6px;
    margin-top: 6px;
    padding: 8px;
    border: 1px solid #e8eef5;
    border-radius: 12px;
    background: #fff;
    z-index: 2;
    box-shadow: 0 8px 24px rgba(76, 103, 172, 0.12);
}

.mobile-level-option {
    border: 1px solid #e8eef5;
    border-radius: 12px;
    background: #fff;
    padding: 10px 12px;
    text-align: left;
    font: inherit;
    cursor: pointer;
}

.mobile-level-option--active {
    border-color: #93c5fd;
    background: #eff6ff;
    color: #1d4ed8;
}

.mobile-chip {
    border: 1px solid #dbeafe;
    border-radius: 999px;
    padding: 6px 12px;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 12px;
    font-weight: 700;
}

.mobile-chip--active {
    border-color: transparent;
    color: #fff;
    background: linear-gradient(135deg, #2563eb, #4f8cff);
}

.mobile-menu-foot {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid #e5e7eb;
    background: #fff;
}

.mobile-foot-btn {
    border-radius: 12px;
    padding: 12px 0;
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
    top: 68px;
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
    border: 1px solid rgba(203, 213, 225, 0.7);
    background: #fff;
    cursor: pointer;
    transition:
        box-shadow 200ms ease,
        border-color 200ms ease,
        transform 200ms ease;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}

.mobile-card:hover {
    border-color: rgba(147, 197, 253, 0.6);
    box-shadow: 0 4px 20px rgba(76, 103, 172, 0.1);
}

.mobile-card:active {
    transform: scale(0.985);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    transition-duration: 80ms;
}

.card-thumb {
    width: 74px;
    height: 74px;
    border-radius: 12px;
    overflow: hidden;
    flex-shrink: 0;
    background: #e2e8f0;
    border: 1px solid rgba(203, 213, 225, 0.5);
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
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
    background: linear-gradient(135deg, #eef2ff, #dbeafe);
}

.card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.card-title {
    margin: 0;
    font-size: 18px;
    line-height: 1.3;
    color: #0f172a;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.card-desc {
    margin: 6px 0;
    font-size: 15px;
    line-height: 1.4;
    color: #475569;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.card-stats {
    display: flex;
    gap: 12px;
    margin-bottom: 4px;
    color: #334155;
    font-size: 13px;
    font-weight: 500;
}

.card-stats span:first-child {
    color: #e11d48;
}

.card-meta {
    color: #64748b;
    font-size: 12px;
    font-weight: 500;
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

<style>
.mobile-sort-dropdown {
    border-radius: 14px !important;
    border: 1px solid rgba(224, 232, 255, 0.96) !important;
    background: rgba(255, 255, 255, 0.98) !important;
    box-shadow: 0 14px 34px rgba(76, 103, 172, 0.14) !important;
    padding: 4px !important;
    min-width: 0 !important;
    width: auto !important;
}

.mobile-sort-dropdown .el-scrollbar__view {
    width: auto !important;
}

.mobile-sort-dropdown .el-dropdown-menu {
    padding: 4px 0 !important;
}

.mobile-sort-dropdown .el-dropdown-menu__item {
    border-radius: 10px;
    padding: 10px 16px;
    font-size: 14px;
    font-weight: 700;
    color: #334155;
    transition:
        background 200ms ease,
        color 200ms ease;
}

.mobile-sort-dropdown .el-dropdown-menu__item:hover {
    background: #eff6ff;
    color: #1d4ed8;
}

.mobile-sort-dropdown .el-dropdown-menu__item.is-active {
    background: linear-gradient(135deg, #2563eb, #4f8cff);
    color: #fff;
}
</style>
