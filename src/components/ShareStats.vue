<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { DataAnalysis, Refresh } from '@element-plus/icons-vue'
import { TIcon } from 'ui_73info'

import { getShareStats, type ShareRecord } from '@/api/invite'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const { showToast } = useToast()
const records = ref<ShareRecord[]>([])
const totalVisits = ref(0)
const totalRegistrations = ref(0)
const loading = ref(false)
const mergedRecords = computed(() => {
    const merged = new Map<ShareRecord['share_type'], ShareRecord>()

    for (const record of records.value) {
        const current = merged.get(record.share_type)
        if (current) {
            merged.set(record.share_type, {
                ...current,
                visits: current.visits + record.visits,
                registrations: current.registrations + record.registrations,
            })
            continue
        }

        merged.set(record.share_type, {
            share_type: record.share_type,
            target_id: record.target_id,
            visits: record.visits,
            registrations: record.registrations,
        })
    }

    return Array.from(merged.values())
})
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
                <TIcon>
                    <Refresh />
                </TIcon>
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
            <article v-for="record in mergedRecords" :key="record.share_type">
                <div>
                    <strong>{{ shareTypeLabel(record.share_type) }}</strong>
                </div>
                <span>{{ record.visits }} / {{ record.registrations }}</span>
            </article>
            <div v-if="!loading && mergedRecords.length === 0" class="share-stats__empty">
                <TIcon>
                    <DataAnalysis />
                </TIcon>
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
    color: var(--73-ink);
    font-size: 22px;
}

.share-stats__head button {
    display: inline-grid;
    place-items: center;
    width: var(--73-control-height);
    height: var(--73-control-height);
    border: 0;
    border-radius: var(--73-radius-sm);
    background: var(--73-accent-soft);
    color: var(--73-accent);
    cursor: pointer;
}

.share-stats__metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.share-stats__metrics article,
.share-stats__records article {
    border: 1px solid var(--73-border);
    border-radius: var(--73-radius-sm);
    background: var(--73-surface);
}

.share-stats__metrics article {
    display: grid;
    gap: 4px;
    padding: 12px;
}

.share-stats__metrics span,
.share-stats__records small {
    color: var(--73-ink-muted);
    font-size: 12px;
}

.share-stats__metrics strong {
    color: var(--73-ink);
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
    color: var(--73-accent);
    font-weight: 900;
    white-space: nowrap;
}

.share-stats__empty {
    min-height: 86px;
    display: grid;
    place-items: center;
    gap: 6px;
    color: var(--73-ink-placeholder);
    font-weight: 800;
}
</style>
