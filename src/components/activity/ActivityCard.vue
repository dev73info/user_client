<script setup lang="ts">
/** 活动卡片：列表页一行一个活动，字段按 `ActivitySummary` 读。 */
import { computed } from 'vue'
import { TTag } from 'ui_73info'

import type { ActivitySummary } from '@/api/activities'
import {
  activityPhaseLabel,
  activityPhaseTone,
  activityQuotaLabel,
  activityWindowLabel,
} from '@/shared/activity'
import { formatFenAsCny } from '@/shared/money'

const props = defineProps<{ activity: ActivitySummary }>()
defineEmits<{ open: [] }>()

const phaseLabel = computed(() => activityPhaseLabel(props.activity.phase))
const phaseTone = computed(() => activityPhaseTone(props.activity.phase))
const windowLabel = computed(() => activityWindowLabel(props.activity))
const quotaText = computed(() => activityQuotaLabel(props.activity))
const rewardText = computed(() => `¥${formatFenAsCny(props.activity.reward_amount_fen)}`)
const participationText = computed(() => {
  const parts: string[] = []
  if (props.activity.my_quota > 0) parts.push(`我的名额 ${props.activity.my_quota}`)
  const reward = props.activity.my_reward_pending_fen + props.activity.my_reward_paid_fen
  if (reward > 0) parts.push(`我的奖励 ¥${formatFenAsCny(reward)}`)
  return parts.join(' · ')
})
</script>

<template>
  <button type="button" class="activity-card" @click="$emit('open')">
    <div class="activity-card__head">
      <div class="activity-card__title-block">
        <strong class="activity-card__title">{{ activity.title }}</strong>
        <span v-if="activity.subtitle" class="activity-card__subtitle">
          {{ activity.subtitle }}
        </span>
      </div>
      <TTag :tone="phaseTone" size="sm">{{ phaseLabel }}</TTag>
    </div>

    <dl class="activity-card__meta">
      <div class="activity-card__meta-item">
        <dt>活动时间</dt>
        <dd>{{ windowLabel }}</dd>
      </div>
      <div class="activity-card__meta-item">
        <dt>名额</dt>
        <dd>{{ quotaText }}</dd>
      </div>
      <div class="activity-card__meta-item">
        <dt>奖励</dt>
        <dd class="activity-card__reward">{{ rewardText }}</dd>
      </div>
    </dl>

    <div class="activity-card__foot">
      <span class="activity-card__mine">{{ participationText || '未参与' }}</span>
      <span class="activity-card__more">查看详情</span>
    </div>
  </button>
</template>

<style scoped>
.activity-card {
  display: grid;
  gap: 12px;
  width: 100%;
  padding: 16px;
  border: 1px solid var(--73-border-soft);
  border-radius: var(--73-radius-card);
  background: var(--73-bg);
  color: var(--73-ink);
  text-align: left;
  cursor: pointer;
}
.activity-card:hover {
  border-color: var(--73-border-hover);
}
.activity-card:focus-visible {
  outline: 2px solid var(--73-focus-ring);
  outline-offset: 2px;
}
.activity-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.activity-card__title-block {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.activity-card__title {
  font-size: 15px;
  font-weight: 600;
}
.activity-card__subtitle {
  color: var(--73-ink-muted);
  font-size: 12px;
}
.activity-card__meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}
.activity-card__meta-item {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.activity-card__meta dt {
  color: var(--73-ink-muted);
  font-size: 12px;
}
.activity-card__meta dd {
  margin: 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.activity-card__reward {
  color: var(--73-accent);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.activity-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--73-ink-muted);
  font-size: 12px;
}
.activity-card__mine {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.activity-card__more {
  color: var(--73-accent);
  white-space: nowrap;
}
@media (max-width: 640px) {
  .activity-card__meta {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
