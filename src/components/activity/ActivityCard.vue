<script setup lang="ts">
/** 活动卡片：活动中心列表的一行，字段按 `ActivitySummary` 读。 */
import { computed } from 'vue'

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
const phaseToneClass = computed(() => {
  switch (activityPhaseTone(props.activity.phase)) {
    case 'success':
      return 'wb-badge--success'
    case 'warning':
      return 'wb-badge--warning'
    case 'danger':
      return 'wb-badge--danger'
    default:
      return ''
  }
})
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
  <li
    class="wb-item wb-item--clickable activity-card"
    tabindex="0"
    @click="$emit('open')"
    @keydown.enter.prevent="$emit('open')"
    @keydown.space.prevent="$emit('open')"
  >
    <div class="wb-item__main">
      <div class="wb-item__title-row">
        <span class="wb-item__title">{{ activity.title }}</span>
        <span class="wb-badge" :class="phaseToneClass">{{ phaseLabel }}</span>
      </div>
      <span v-if="activity.subtitle" class="wb-item__meta">{{ activity.subtitle }}</span>
      <span class="wb-item__meta">活动时间 {{ windowLabel }}</span>
      <span class="wb-item__meta">名额 {{ quotaText }}</span>
      <span class="wb-item__meta">奖励 {{ rewardText }}</span>
      <span class="wb-item__meta">我的参与 {{ participationText || '未参与' }}</span>
    </div>
    <div class="wb-item__side">
      <span class="activity-card__more">查看详情</span>
    </div>
  </li>
</template>

<style scoped>
.activity-card__more {
  color: var(--wb-accent);
  white-space: nowrap;
}
</style>
