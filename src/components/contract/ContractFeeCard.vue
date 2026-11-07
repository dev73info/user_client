<script setup lang="ts">
import { computed } from 'vue'

import type { RequirementFeeTerms } from '@/api/requirementFee'
import {
  FEE_TERMS_PENDING_TEXT,
  feeLockNote,
  requirementFeeLines,
  type FeeViewerRole,
} from '@/shared/requirementFee'

/**
 * 合同签署页的「费用与结算」卡。
 *
 * 甲乙双方看同一份费率快照，只切换强调项：需求方强调「您实付 / 不额外收取」，
 * 开发者强调「扣费后到手」。自管模式不挂这张卡（由视图判定），
 * 担保模式旧合同没有快照时显示「费率待确认」，不阻塞签署。
 */
const props = defineProps<{
  terms: RequirementFeeTerms | null
  role: FeeViewerRole
  /** 404 且属于担保模式：费率快照还没生成。 */
  pending: boolean
}>()

const lines = computed(() =>
  props.terms && !props.pending ? requirementFeeLines(props.terms, props.role) : [],
)
const lockNote = computed(() => (props.terms ? feeLockNote(props.terms) : ''))
</script>

<template>
  <section class="contract-fee" aria-label="费用与结算">
    <h3 class="contract-fee__title">费用与结算</h3>

    <p v-if="pending" class="contract-fee__pending" role="status">
      {{ FEE_TERMS_PENDING_TEXT }}，签署不受影响。
    </p>

    <template v-else-if="props.terms">
      <dl class="contract-fee__rows">
        <div
          v-for="line in lines"
          :key="line.label"
          class="contract-fee__row"
          :class="{ 'is-emphasis': line.emphasis }"
        >
          <dt>{{ line.label }}</dt>
          <dd>{{ line.value }}</dd>
        </div>
      </dl>
      <p class="contract-fee__lock">{{ lockNote }}</p>
    </template>
  </section>
</template>

<style scoped>
.contract-fee {
  margin: 0 0 1.25rem;
  padding: 14px 16px;
  border: 1px solid var(--73-accent-soft);
  border-radius: 10px;
  background: var(--73-surface-strong);
}

.contract-fee__title {
  margin: 0 0 10px;
  color: var(--73-ink);
  font-size: 14px;
  font-weight: 800;
}

.contract-fee__rows {
  display: grid;
  gap: 8px;
  margin: 0;
}

.contract-fee__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  line-height: 1.6;
}

.contract-fee__row dt {
  min-width: 0;
  color: var(--73-ink-soft);
}

.contract-fee__row dd {
  flex: 0 0 auto;
  margin: 0;
  color: var(--73-ink);
  font-variant-numeric: tabular-nums;
  font-weight: 650;
}

.contract-fee__row.is-emphasis dt,
.contract-fee__row.is-emphasis dd {
  color: var(--73-success);
  font-weight: 800;
}

.contract-fee__lock,
.contract-fee__pending {
  margin: 10px 0 0;
  color: var(--73-ink-soft);
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 640px) {
  .contract-fee__row {
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 2px 12px;
  }
}
</style>
