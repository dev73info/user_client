<script setup lang="ts">
/** 活动中心：浏览已发布活动（标题、时间、名额、奖励与我的参与状态），点卡片进详情。 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh, TButton, TIcon } from 'ui_73info'

import { listActivities, type ActivitySummary } from '@/api/activities'
import ActivityCard from '@/components/activity/ActivityCard.vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const activities = ref<ActivitySummary[]>([])
const loading = ref(false)
const loadError = ref('')

const activeCount = computed(
  () => activities.value.filter((activity) => activity.phase === 'active').length,
)
const joinedCount = computed(
  () =>
    activities.value.filter(
      (activity) =>
        activity.my_quota > 0 || activity.my_reward_pending_fen + activity.my_reward_paid_fen > 0,
    ).length,
)

async function load() {
  auth.hydrate()
  if (!auth.isAuthed) return

  loading.value = true
  loadError.value = ''
  try {
    const result = await listActivities(auth.token)
    activities.value = result.items
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载活动失败'
  } finally {
    loading.value = false
  }
}

function openActivity(activity: ActivitySummary) {
  void router.push({ name: 'workbench-activity-detail', params: { code: activity.code } })
}

onMounted(() => {
  void load()
})
</script>

<template>
  <main
    class="page-shell custom-page-shell profile-page activities-page wb-sheet"
    :aria-busy="loading"
  >
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="活动概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">活动</span>
          <span class="wb-strip__value">{{ activities.length }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">进行中</span>
          <span class="wb-strip__value">{{ activeCount }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">我参与的</span>
          <span class="wb-strip__value">{{ joinedCount }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton icon-only :loading="loading" aria-label="刷新活动" @click="load">
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">活动中心</h3>
        </div>
        <div class="wb-card-head__actions">
          <TButton variant="outline" @click="router.push({ name: 'workbench-activity-rewards' })">
            我的活动奖励
          </TButton>
        </div>
      </div>

      <div v-if="loadError" class="wb-empty" role="alert">
        <span>{{ loadError }}</span>
        <div class="wb-empty__actions">
          <TButton variant="outline" :loading="loading" @click="load">重试</TButton>
        </div>
      </div>
      <p v-else-if="loading && !activities.length" class="wb-empty" role="status">正在加载活动…</p>
      <p v-else-if="!activities.length" class="wb-empty" role="status">
        <span class="wb-empty__title">暂无活动</span>
      </p>
      <div v-else class="activity-grid">
        <ActivityCard
          v-for="activity in activities"
          :key="activity.id"
          :activity="activity"
          @open="openActivity(activity)"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
.activity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 900px) {
  .activity-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
