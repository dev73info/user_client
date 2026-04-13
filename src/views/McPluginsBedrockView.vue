<script setup lang="ts">
import { computed, ref } from 'vue'
import '../styles/McPluginsView.css'

type McCardItem = {
    title: string
    author: string
    description: string
    platform: string
    side: string
    version: string
    loader: string
    category: string
    downloads: string
    rating: string
    icon: string
    iconBg: string
}

const currentPlatform = '基岩'

const sides = ['客户端', '服务端']
const versions = ['1.20.1', '1.19.2', '1.18.2', '1.16.5']
const loaders = ['资源包', 'BTA', 'Add-on']
const categories = ['资源包', '管理', '存储', '实用', '魔法', '冒险', '社交', '优化']
const sortOptions = ['下载量', '最新']

const searchQuery = ref('')
const selectedSides = ref<string[]>(['客户端'])
const selectedVersions = ref<string[]>(['1.20.1'])
const selectedLoaders = ref<string[]>([])
const selectedCategories = ref<string[]>([])
const selectedSort = ref('下载量')

const cards = ref<McCardItem[]>([
    {
        title: '基岩轻量资源包',
        author: 'BedrockDev',
        description: '适用于基岩版的轻量资源包，兼容最新版本。',
        platform: '基岩',
        side: '客户端',
        version: '1.20.1',
        loader: '资源包',
        category: '资源包',
        downloads: '95.3k',
        rating: '4.9k',
        icon: '🧱',
        iconBg: 'bg-purple',
    },
    {
        title: '基岩服务器管理',
        author: 'BedrockTools',
        description: '基岩版服务器管理插件，支持权限与备份。',
        platform: '基岩',
        side: '服务端',
        version: '1.19.2',
        loader: 'BTA',
        category: '管理',
        downloads: '28.7k',
        rating: '2.8k',
        icon: '🛠️',
        iconBg: 'bg-teal',
    },
])

function toggleFilter(list: string[], item: string) {
    const index = list.indexOf(item)
    if (index >= 0) {
        list.splice(index, 1)
    } else {
        list.push(item)
    }
}

const filteredCards = computed(() => {
    const filtered = cards.value.filter((card) => {
        if (card.platform !== currentPlatform) {
            return false
        }
        if (searchQuery.value && !card.title.toLowerCase().includes(searchQuery.value.toLowerCase())) {
            return false
        }
        const sideMatch = selectedSides.value.some((s) => card.side.includes(s))
        if (selectedSides.value.length > 0 && !sideMatch) return false
        if (selectedVersions.value.length > 0 && !selectedVersions.value.includes(card.version)) return false
        if (selectedLoaders.value.length > 0 && !selectedLoaders.value.includes(card.loader)) return false
        if (selectedCategories.value.length > 0 && !selectedCategories.value.includes(card.category)) return false
        return true
    })

    if (selectedSort.value === '下载量') {
        return filtered.slice().sort((a, b) => {
            const aVal = parseFloat(a.downloads.replace('M', '000000').replace('k', '000'))
            const bVal = parseFloat(b.downloads.replace('M', '000000').replace('k', '000'))
            return bVal - aVal
        })
    }
    return filtered
})

function resetFilters() {
    searchQuery.value = ''
    selectedSides.value = [...sides]
    selectedVersions.value = [...versions]
    selectedLoaders.value = [...loaders]
    selectedCategories.value = [...categories]
    selectedSort.value = '下载量'
}
</script>

<template>
    <section>
        <div class="mc-page-title-row">
            <h2 class="mc-page-heading">基岩版资源</h2>
            <p class="mc-page-subtitle">显示 基岩 版专用模组与插件</p>
        </div>

        <section class="mc-filter-panel">
            <div class="filter-row flex-between">
                <div class="filter-group">
                    <span class="label">端：</span>
                    <button v-for="side in sides" :key="side" class="tag"
                        :class="{ active: selectedSides.includes(side) }" @click="toggleFilter(selectedSides, side)">
                        {{ side }}
                    </button>
                </div>
                <div class="search-bar">
                    <input v-model="searchQuery" type="text" placeholder="搜索 基岩 版资源..." />
                    <span class="search-icon">🔍</span>
                </div>
            </div>

            <div class="filter-row">
                <div class="filter-group">
                    <span class="label">版本：</span>
                    <div class="tag-cloud">
                        <button v-for="v in versions" :key="v" class="tag"
                            :class="{ active: selectedVersions.includes(v) }"
                            @click="toggleFilter(selectedVersions, v)">
                            {{ v }}
                        </button>
                    </div>
                </div>
            </div>

            <div class="filter-row">
                <div class="filter-group">
                    <span class="label">加载器：</span>
                    <div class="tag-cloud">
                        <button v-for="l in loaders" :key="l" class="tag"
                            :class="{ active: selectedLoaders.includes(l) }" @click="toggleFilter(selectedLoaders, l)">
                            {{ l }}
                        </button>
                    </div>
                </div>
            </div>

            <div class="filter-row">
                <div class="filter-group align-start">
                    <span class="label mt-1">类别：</span>
                    <div class="tag-cloud">
                        <button v-for="c in categories" :key="c" class="tag"
                            :class="{ active: selectedCategories.includes(c) }"
                            @click="toggleFilter(selectedCategories, c)">
                            {{ c }}
                        </button>
                    </div>
                </div>
            </div>

            <div class="filter-row flex-between mt-2">
                <div class="filter-group">
                    <span class="label">排序：</span>
                    <button v-for="s in sortOptions" :key="s" class="tag" :class="{ active: selectedSort === s }"
                        @click="selectedSort = s">
                        {{ s }}
                    </button>
                </div>
                <button class="btn-reset" type="button" @click="resetFilters">↻ 重置筛选</button>
            </div>
        </section>

        <section class="mc-content-grid">
            <div v-for="card in filteredCards" :key="card.title" class="res-card">
                <div :class="['res-icon', card.iconBg]">{{ card.icon }}</div>
                <div class="res-info">
                    <h3>{{ card.title }}</h3>
                    <p class="author">by {{ card.author }}</p>
                    <p class="desc">{{ card.description }}</p>
                    <div class="res-tags">
                        <span>{{ card.version }}</span>
                        <span>{{ card.loader }}</span>
                    </div>
                </div>
                <div class="res-stats">
                    <span>⬇ {{ card.downloads }}</span>
                    <button class="btn-download" type="button">下载</button>
                </div>
            </div>
            <p v-if="filteredCards.length === 0" class="empty-state">当前没有符合条件的资源。</p>
        </section>
    </section>
</template>
