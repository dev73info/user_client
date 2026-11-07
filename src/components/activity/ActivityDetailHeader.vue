<script setup lang="ts">
/** 活动详情的头部：标题 / 阶段 / 报名、时间与名额、说明、邀请概况。 */
import { computed } from 'vue'
import { TButton, TTag } from 'ui_73info'

import type { ActivityDetail } from '@/api/activities'
import {
  activityPerUserQuotaLabel,
  activityPhaseLabel,
  activityPhaseTone,
  activityQuotaLabel,
  activityWindowLabel,
} from '@/shared/activity'
import { formatFenAsCny } from '@/shared/money'

const props = defineProps<{
  activity: ActivityDetail
  signupBlocked: string
  signupBusy: boolean
  signupHint: string
}>()

defineEmits<{ signup: []; inviteRewards: [] }>()

const phaseLabel = computed(() => activityPhaseLabel(props.activity.phase))
const phaseTone = computed(() => activityPhaseTone(props.activity.phase))
const windowLabel = computed(() => activityWindowLabel(props.activity))
const quotaLabel = computed(() => activityQuotaLabel(props.activity))
const perUserQuotaLabel = computed(() => activityPerUserQuotaLabel(props.activity))
</script>

<template>
  <section class="wallet-section">
    <div class="wb-card-head">
      <div class="wb-card-head__title-block">
        <h3 class="wb-card-head__title">{{ activity.title }}</h3>
        <p v-if="activity.subtitle" class="activity-detail__subtitle">
          {{ activity.subtitle }}
        </p>
      </div>
      <div class="wb-card-head__actions">
        <TTag :tone="phaseTone" size="sm">{{ phaseLabel }}</TTag>
        <TButton
          v-if="activity.signup_enabled"
          variant="solid"
          tone="accent"
          :disabled="Boolean(signupBlocked) || signupBusy"
          :loading="signupBusy"
          @click="$emit('signup')"
          >{{ signupBlocked || '立即报名' }}</TButton
        >
      </div>
    </div>

    <p v-if="signupHint" class="activity-detail__hint" role="alert">{{ signupHint }}</p>

    <dl class="activity-detail__meta">
      <div class="activity-detail__meta-item">
        <dt>活动时间</dt>
        <dd>{{ windowLabel }}</dd>
      </div>
      <div class="activity-detail__meta-item">
        <dt>名额</dt>
        <dd>{{ quotaLabel }}</dd>
      </div>
      <div class="activity-detail__meta-item">
        <dt>每人名额</dt>
        <dd>{{ perUserQuotaLabel }}</dd>
      </div>
      <div class="activity-detail__meta-item">
        <dt>奖励金额</dt>
        <dd class="activity-detail__reward">¥{{ formatFenAsCny(activity.reward_amount_fen) }}</dd>
      </div>
    </dl>

    <p v-if="activity.description" class="activity-detail__desc">{{ activity.description }}</p>

    <div v-if="activity.invite_summary" class="activity-detail__invite">
      <span>已邀请 {{ activity.invite_summary.total_invited }} 人</span>
      <span>累计奖励 ¥{{ formatFenAsCny(activity.invite_summary.total_rewarded_fen) }}</span>
      <TButton variant="outline" @click="$emit('inviteRewards')">邀请奖励</TButton>
    </div>
  </section>
</template>

<style scoped>
.activity-detail__subtitle {
  margin: 4px 0 0;
  color: var(--73-ink-muted);
  font-size: 12px;
}
.activity-detail__hint {
  margin: 0;
  color: var(--73-danger-text);
  font-size: 13px;
}
.activity-detail__meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}
.activity-detail__meta-item {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.activity-detail__meta dt {
  color: var(--73-ink-muted);
  font-size: 12px;
}
.activity-detail__meta dd {
  margin: 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.activity-detail__reward {
  color: var(--73-accent);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.activity-detail__desc {
  margin: 0;
  color: var(--73-ink-soft);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
}
.activity-detail__invite {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  color: var(--73-ink-muted);
  font-size: 13px;
}
@media (max-width: 900px) {
  .activity-detail__meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .activity-detail__meta {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
