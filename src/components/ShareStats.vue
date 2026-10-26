<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { TButton, TIcon, DataAnalysis, Refresh } from 'ui_73info'

import { getShareStats, type ShareRecord } from '@/api/invite'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const records = ref<ShareRecord[]>([])
const totalVisits = ref(0)
const totalRegistrations = ref(0)
const loading = ref(false)
const loadError = ref('')
const mergedRecords = computed(() => {
  const merged = new Map<string, ShareRecord>()
  for (const record of records.value) {
    const current = merged.get(record.share_type)
    merged.set(record.share_type, {
      ...record,
      visits: (current?.visits ?? 0) + record.visits,
      registrations: (current?.registrations ?? 0) + record.registrations,
    })
  }
  return [...merged.values()]
})
const conversionRate = computed(() =>
  totalVisits.value > 0
    ? `${Math.round((totalRegistrations.value / totalVisits.value) * 100)}%`
    : '0%',
)

function shareTypeLabel(type: string) {
  const labels: Record<string, string> = {
    invite: '邀请链接',
    requirement: '需求分享',
    portfolio: '作品分享',
    resource: '资源分享',
    community_post: '帖子分享',
  }
  return labels[type] ?? type
}

async function loadStats() {
  auth.hydrate()
  if (!auth.token) return
  loading.value = true
  loadError.value = ''
  try {
    const payload = await getShareStats(auth.token)
    records.value = payload.records
    totalVisits.value = payload.total_visits
    totalRegistrations.value = payload.total_registrations
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载分享数据失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => void loadStats())
</script>

<template>
  <section class="share-stats" aria-label="分享数据">
    <header class="share-stats__head">
      <h2>分享数据</h2>
      <TButton icon-only :loading="loading" aria-label="刷新分享数据" @click="loadStats"
        ><TIcon><Refresh /></TIcon
      ></TButton>
    </header>
    <div class="share-stats__metrics">
      <article>
        <span>访问</span><strong>{{ totalVisits }}</strong>
      </article>
      <article>
        <span>注册</span><strong>{{ totalRegistrations }}</strong>
      </article>
      <article>
        <span>转化</span><strong>{{ conversionRate }}</strong>
      </article>
    </div>
    <div v-if="loadError" class="share-stats__empty" role="alert">
      <span>{{ loadError }}</span
      ><TButton @click="loadStats">重试</TButton>
    </div>
    <div v-else class="share-stats__records">
      <article v-for="record in mergedRecords" :key="record.share_type">
        <strong>{{ shareTypeLabel(record.share_type) }}</strong
        ><span>{{ record.visits }} / {{ record.registrations }}</span>
      </article>
      <div v-if="!loading && !mergedRecords.length" class="share-stats__empty">
        <TIcon><DataAnalysis /></TIcon><span>暂无分享记录</span>
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
.share-stats__metrics span {
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
.share-stats__records span {
  color: var(--73-accent);
  font-weight: 900;
  white-space: nowrap;
}
.share-stats__empty {
  min-height: 86px;
  display: grid;
  place-items: center;
  gap: 8px;
  color: var(--73-ink-placeholder);
}
</style>
