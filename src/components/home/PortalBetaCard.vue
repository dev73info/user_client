<script setup lang="ts">
import type { CheckinStatus } from '@/api/points'

/**
 * 侧栏签到卡：真实字段来自 `GET /points/checkin/status`
 * （`streak_count` / `today_checked_in` / `today_potential`）。
 * 未登录（`status` 为空）时退化成「内测中 + 加入QQ群」。
 */
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
  <section class="portal-card portal-card--checkin portal-section--beta">
    <div class="portal-card__header">
      <div class="portal-card__title">
        <span class="portal-card-title-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M3 10h18" />
            <path d="m9 15 2 2 4-4" />
          </svg>
        </span>
        <h2>今日签到</h2>
      </div>
      <span v-if="status" class="portal-checkin-chip">连续 {{ status.streak_count }} 天</span>
      <span v-else class="portal-card__chip portal-card__chip--muted">内测中</span>
    </div>

    <p v-if="status" class="portal-checkin-copy">
      已连续打卡 {{ status.streak_count }} 天
      <template v-if="!status.today_checked_in">
        · 今日可获
        <strong>+{{ status.today_potential }} PTS</strong>
      </template>
    </p>

    <div class="portal-beta-notice__actions">
      <button
        v-if="status && !status.today_checked_in"
        class="portal-beta-notice__btn portal-primary-action"
        type="button"
        :disabled="saving"
        @click="emit('checkin')"
      >
        {{ saving ? '签到中…' : '立即签到领取奖励' }}
      </button>
      <button v-else-if="status" class="portal-beta-notice__btn" type="button" disabled>
        今日已签到
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
