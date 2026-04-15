<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getPublicMcResource, type PublicMcResourceItem } from '@/api/mcResources'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)
const resource = ref<PublicMcResourceItem | null>(null)

const tagNames = computed(() => resource.value?.tag_selections.flatMap((item) => item.tag_names) ?? [])
const detailTitle = computed(() => resource.value?.title || '资源项目主页')

function backToPlatform() {
    const platform = resource.value?.platform === 'bedrock' ? 'mc-plugins-bedrock' : 'mc-plugins-java'
    router.push({ name: platform })
}

function openResourceFile() {
    if (!resource.value?.source_url || !/^https?:\/\//i.test(resource.value.source_url)) {
        showToast('该资源暂未提供可下载地址', 'info')
        return
    }

    window.open(resource.value.source_url, '_blank', 'noopener,noreferrer')
}

async function loadResource() {
    const resourceId = Number(route.params.id)
    if (!Number.isInteger(resourceId) || resourceId <= 0) {
        showToast('资源编号无效', 'warning')
        router.replace({ name: 'home' })
        return
    }

    loading.value = true
    try {
        resource.value = await getPublicMcResource(resourceId)
    } catch (error) {
        const message = error instanceof Error ? error.message : '加载资源主页失败'
        showToast(message, 'warning')
        router.replace({ name: 'home' })
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    loadResource()
})
</script>

<template>
    <main class="resource-detail-page">
        <section class="resource-detail-card" v-loading="loading">
            <button class="resource-detail-back" type="button" @click="backToPlatform">返回资源列表</button>

            <div v-if="resource" class="resource-detail-layout">
                <div class="resource-detail-cover">
                    <img v-if="resource.cover_url" :src="resource.cover_url" :alt="resource.title" />
                    <div v-else class="resource-detail-cover__placeholder">{{ resource.platform === 'java' ? '☕' : '🧱'
                        }}</div>
                </div>

                <div class="resource-detail-content">
                    <p class="resource-detail-kicker">{{ resource.platform === 'java' ? 'Java 版资源主页' : '基岩版资源主页' }}</p>
                    <h1>{{ detailTitle }}</h1>
                    <p class="resource-detail-meta">作者：{{ resource.author }} · 创建者：{{ resource.creator }}</p>
                    <p class="resource-detail-desc">{{ resource.description }}</p>

                    <div v-if="tagNames.length > 0" class="resource-detail-tags">
                        <span v-for="item in tagNames" :key="item" class="resource-detail-tag">{{ item }}</span>
                    </div>

                    <div class="resource-detail-actions">
                        <button class="resource-detail-primary" type="button" @click="openResourceFile">下载资源</button>
                        <a v-if="resource.docs_url" class="resource-detail-secondary" :href="resource.docs_url"
                            target="_blank" rel="noopener noreferrer">查看文档</a>
                    </div>

                    <section v-if="resource.release_note" class="resource-detail-note">
                        <h2>主页补充说明</h2>
                        <p>{{ resource.release_note }}</p>
                    </section>
                </div>
            </div>
        </section>
    </main>
</template>

<style scoped>
.resource-detail-page {
    padding: 32px 16px 56px;
}

.resource-detail-card {
    width: min(1080px, 100%);
    margin: 0 auto;
    padding: 24px;
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 24px 70px rgba(25, 40, 70, 0.12);
}

.resource-detail-back {
    border: none;
    background: transparent;
    color: #2563eb;
    cursor: pointer;
    padding: 0;
    margin-bottom: 20px;
    font-size: 14px;
}

.resource-detail-layout {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: 28px;
}

.resource-detail-cover {
    border-radius: 24px;
    overflow: hidden;
    background: linear-gradient(135deg, #dbeafe, #eff6ff);
    min-height: 280px;
}

.resource-detail-cover img,
.resource-detail-cover__placeholder {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.resource-detail-cover__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 84px;
}

.resource-detail-kicker {
    margin: 0 0 8px;
    color: #2563eb;
    font-weight: 700;
}

.resource-detail-content h1 {
    margin: 0;
    font-size: 2.4rem;
}

.resource-detail-meta,
.resource-detail-desc,
.resource-detail-note p {
    color: #475569;
    line-height: 1.8;
}

.resource-detail-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 20px 0;
}

.resource-detail-tag {
    padding: 8px 12px;
    border-radius: 999px;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 14px;
}

.resource-detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 24px;
}

.resource-detail-primary,
.resource-detail-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 999px;
    text-decoration: none;
}

.resource-detail-primary {
    border: none;
    background: #2563eb;
    color: #fff;
    cursor: pointer;
}

.resource-detail-secondary {
    border: 1px solid #bfdbfe;
    color: #1d4ed8;
    background: #fff;
}

.resource-detail-note {
    margin-top: 28px;
    padding-top: 20px;
    border-top: 1px solid #e2e8f0;
}

@media (max-width: 840px) {
    .resource-detail-layout {
        grid-template-columns: 1fr;
    }
}
</style>
