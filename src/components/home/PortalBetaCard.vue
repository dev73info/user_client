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
      <span v-if="status" class="portal-checkin-chip">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 22c4.4 0 7-2.8 7-6.6 0-2.7-1.5-5.1-4.4-7.2.2 1.8-.5 3.1-1.8 4.1.2-3.4-1.6-6.1-4.8-8.3.2 3.1-1 5.3-3 7.2-1.3 1.3-2 2.8-2 4.5C3 19.4 6.4 22 12 22Z"
          />
        </svg>
        连签 {{ status.streak_count }} 天
      </span>
      <span v-else class="portal-card__chip portal-card__chip--muted">内测中</span>
    </div>

    <p v-if="status" class="portal-checkin-copy">
      <template v-if="!status.today_checked_in"
        >今日签到可得 <strong>+{{ status.today_potential }} PTS</strong></template
      >
      <template v-else>今天已签到，连签记录保持中</template>
    </p>

    <div class="portal-beta-notice__actions">
      <button
        v-if="status && !status.today_checked_in"
        class="portal-beta-notice__btn portal-primary-action"
        type="button"
        :disabled="saving"
        :title="`今日签到可获 +${status.today_potential} PTS`"
        @click="emit('checkin')"
      >
        <svg v-if="!saving" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5A2.5 2.5 0 1 1 10 4.5L12 7Zm0 0h4.5A2.5 2.5 0 1 0 14 4.5L12 7Z"
          />
        </svg>
        {{ saving ? '签到中…' : `签到 +${status.today_potential}` }}
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
