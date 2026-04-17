<script setup lang="ts">
import type { PropType } from 'vue'

type FreeResourceSectionView = {
    rootId: number
    rootName: string
    rootSlug: string
    entrySlug: string | null
    summary: string
    actionLabel: string
}

defineProps({
    sections: {
        type: Array as PropType<FreeResourceSectionView[]>,
        default: () => [],
    },
    loading: {
        type: Boolean,
        default: false,
    },
})

const emit = defineEmits<{
    (e: 'open-section', section: FreeResourceSectionView): void
}>()
</script>

<template>
    <section class="free-resource-board panel" aria-label="免费资源导航">
        <header class="panel-header free-resource-board__header">
            <div>
                <h2>免费资源导航</h2>
                <p class="free-resource-board__lead">这里只显示标签树根节点入口，后续新增根分区后会自动出现。</p>
            </div>
            <span>{{ sections.length }} 个根节点</span>
        </header>

        <div v-if="loading" class="empty-placeholder">正在加载免费资源分类...</div>

        <div v-else-if="sections.length > 0" class="free-resource-grid">
            <article v-for="section in sections" :key="section.rootId" class="free-resource-card">
                <div class="free-resource-card__head">
                    <div>
                        <p class="free-resource-card__eyebrow">资源入口</p>
                        <h3>{{ section.rootName }}</h3>
                    </div>
                    <button class="free-resource-card__cta" type="button" @click="emit('open-section', section)">
                        {{ section.actionLabel }}
                    </button>
                </div>

                <p class="free-resource-card__summary">{{ section.summary }}</p>
            </article>
        </div>

        <p v-else class="empty-placeholder">标签树暂无可用分区。</p>
    </section>
</template>
