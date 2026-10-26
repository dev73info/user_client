<script setup lang="ts">
import type { CheckinStatus } from '@/api/points'

withDefaults(
  defineProps<{
    status?: CheckinStatus | null
    saving?: boolean
    error?: string
  }>(),
  { status: null, saving: false, error: '' },
)
const emit = defineEmits<{
  (e: 'open-group'): void
  (e: 'checkin'): void
  (e: 'reload'): void
}>()
</script>

<template>
  <section class="portal-card portal-section--beta">
    <div class="portal-beta-notice">
      <span class="portal-beta-notice__badge">
        {{ status?.today_checked_in ? '今日已签到' : '内测中' }}
      </span>
      <button
        v-if="status && !status.today_checked_in"
        class="portal-beta-notice__btn"
        type="button"
        :disabled="saving"
        @click="emit('checkin')"
      >
        {{ saving ? '签到中…' : '每日签到' }}
      </button>
      <button class="portal-beta-notice__btn" type="button" @click="emit('open-group')">
        加入QQ群
      </button>
    </div>
    <p v-if="error" class="portal-beta-notice__error" role="alert">
      {{ error }}
      <button type="button" @click="emit('reload')">重试</button>
    </p>
  </section>
</template>
