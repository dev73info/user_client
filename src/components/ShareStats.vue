<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { DataAnalysis, Refresh } from '@element-plus/icons-vue'

import { getShareStats, type ShareRecord } from '@/api/invite'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const { showToast } = useToast()
const records = ref<ShareRecord[]>([])
const totalVisits = ref(0)
const totalRegistrations = ref(0)
const loading = ref(false)
const conversionRate = computed(() => {
    if (totalVisits.value <= 0) {
        return '0%'
    }
    return `${Math.round((totalRegistrations.value / totalVisits.value) * 100)}%`
})

function shareTypeLabel(type: ShareRecord['share_type']) {
    const labels: Record<ShareRecord['share_type'], string> = {
        invite: '邀请链接',
        requirement: '需求分享',
        portfolio: '作品分享',
        resource: '资源分享',
        community_post: '帖子分享',
    }
    return labels[type]
}

async function loadStats() {
    auth.hydrate()
    if (!auth.token) {
        records.value = []
        return
    }
    loading.value = true
    try {
        const payload = await getShareStats(auth.token)
        records.value = payload.records
        totalVisits.value = payload.total_visits
        totalRegistrations.value = payload.total_registrations
    } catch (error) {
        showToast(error instanceof Error ? error.message : '加载分享数据失败', 'error')
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    void loadStats()
})
</script>

<template>
    <section class="share-stats" aria-label="分享数据">
        <header class="share-stats__head">
            <h2>分享数据</h2>
            <button type="button" :disabled="loading" @click="loadStats" aria-label="刷新分享数据">
                <el-icon>
                    <Refresh />
                </el-icon>
            </button>
        </header>

        <div class="share-stats__metrics">
            <article>
                <span>访问</span>
                <strong>{{ totalVisits }}</strong>
            </article>
            <article>
                <span>注册</span>
                <strong>{{ totalRegistrations }}</strong>
            </article>
            <article>
                <span>转化</span>
                <strong>{{ conversionRate }}</strong>
            </article>
        </div>

        <div class="share-stats__records">
            <article v-for="record in records" :key="`${record.share_type}-${record.target_id ?? ''}`">
                <div>
                    <strong>{{ shareTypeLabel(record.share_type) }}</strong>
                    <small>{{ record.target_id || '邀请码' }}</small>
                </div>
                <span>{{ record.visits }} / {{ record.registrations }}</span>
            </article>
            <div v-if="!loading && records.length === 0" class="share-stats__empty">
                <el-icon>
                    <DataAnalysis />
                </el-icon>
                <span>暂无分享记录</span>
            </div>
        </div>
    </section>
</template>

<style scoped>
.share-stats {
    display: grid;
    gap: 14px;
}

.share-stats__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}

.share-stats__head h2 {
    margin: 0;
    color: #0f172a;
    font-size: 22px;
}

.share-stats__head button {
    display: inline-grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 8px;
    background: #eff6ff;
    color: #2563eb;
    cursor: pointer;
}

.share-stats__metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.share-stats__metrics article,
.share-stats__records article {
    border: 1px solid rgba(226, 232, 240, 0.96);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.9);
}

.share-stats__metrics article {
    display: grid;
    gap: 4px;
    padding: 12px;
}

.share-stats__metrics span,
.share-stats__records small {
    color: #64748b;
    font-size: 12px;
}

.share-stats__metrics strong {
    color: #0f172a;
    font-size: 22px;
}

.share-stats__records {
    display: grid;
    gap: 8px;
}

.share-stats__records article {
    min-height: 58px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
}

.share-stats__records strong,
.share-stats__records small {
    display: block;
}

.share-stats__records span {
    color: #1d4ed8;
    font-weight: 900;
    white-space: nowrap;
}

.share-stats__empty {
    min-height: 86px;
    display: grid;
    place-items: center;
    gap: 6px;
    color: #94a3b8;
    font-weight: 800;
}
</style>