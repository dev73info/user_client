<script setup lang="ts">
/** 活动奖励明细。详情页只看本活动；「我的活动奖励」跨活动，额外显示活动标题。 */
import { TTag } from 'ui_73info'

import type { ActivityRewardItem } from '@/api/activities'
import { activityRewardStatusLabel, activityRewardStatusTone } from '@/shared/activity'
import { formatBackendDateTime } from '@/shared/datetime'
import { formatFenAsCny } from '@/shared/money'

withDefaults(defineProps<{ rewards: ActivityRewardItem[]; showActivity?: boolean }>(), {
  showActivity: false,
})

function sourceLabel(reward: ActivityRewardItem): string {
  switch (reward.source) {
    case 'signup':
      return '报名奖励'
    case 'key':
      return '兑换奖励'
    case 'invite':
      return '邀请奖励'
    case 'admin':
      return '运营发放'
    default:
      return '活动奖励'
  }
}
</script>

<template>
  <ul v-if="rewards.length" class="wb-list" aria-label="活动奖励">
    <li v-for="reward in rewards" :key="reward.id" class="wb-item">
      <div class="wb-item__main">
        <span class="wb-item__title">
          {{ showActivity ? reward.activity_title : sourceLabel(reward) }}
        </span>
        <span class="wb-item__meta">
          {{ showActivity ? sourceLabel(reward) + ' · ' : ''
          }}{{ formatBackendDateTime(reward.created_at) }}
        </span>
        <span v-if="reward.fail_reason" class="activity-rewards__fail">
          {{ reward.fail_reason }}
        </span>
      </div>
      <div class="wb-item__side">
        <span class="activity-rewards__amount">¥{{ formatFenAsCny(reward.amount_fen) }}</span>
        <TTag :tone="activityRewardStatusTone(reward.status)" size="sm">
          {{ activityRewardStatusLabel(reward) }}
        </TTag>
      </div>
    </li>
  </ul>
  <p v-else class="wb-empty" role="status">
    <span class="wb-empty__title">暂无活动奖励</span>
  </p>
</template>

<style scoped>
.activity-rewards__amount {
  color: var(--73-ink);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.activity-rewards__fail {
  color: var(--73-danger-text);
  font-size: 12px;
}
</style>
