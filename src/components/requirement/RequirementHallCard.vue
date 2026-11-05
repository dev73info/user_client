<script setup lang="ts">
/**
 * 需求大厅的一张需求卡（卡格里的 `<article>`）。
 *
 * 结构对齐 Stitch 源码「需求大厅（精密工程轻色工作台）」：
 * 顶部担保方式 chip 与右侧需求编号，下面标题、三行描述，
 * 底部是更新时间与「预算估算 + 查看详情」。
 */
import { computed } from 'vue'

import type { PublicRequirementSpotlightItem } from '@/api/requirements'
import BetaTag from '@/components/BetaTag.vue'
import {
  formatCnDateTime as formatTimeLabel,
  formatCny as formatMoney,
  requirementPaymentModeLabel,
} from '@/shared/requirementDisplay'
import { requirementRichTextPreview } from '@/utils/requirementRichText'

const props = defineProps<{
  card: PublicRequirementSpotlightItem
}>()

const emit = defineEmits<{
  (e: 'open', card: PublicRequirementSpotlightItem): void
}>()

const guaranteeLabel = computed(() => requirementPaymentModeLabel(props.card.payment_mode))
const guaranteeTone = computed(() =>
  props.card.payment_mode === 'platform_guarantee' ? 'success' : 'warning',
)

function open(): void {
  emit('open', props.card)
}
</script>

<template>
  <article
    class="portal-page__card requirement-hall__card"
    role="button"
    tabindex="0"
    @click="open"
    @keydown.enter="open"
    @keydown.space.prevent="open"
  >
    <div class="requirement-hall__card-main">
      <div class="requirement-hall__badges">
        <span class="requirement-hall__badge" :class="`requirement-hall__badge--${guaranteeTone}`">
          {{ guaranteeLabel }}
          <BetaTag
            v-if="props.card.payment_mode === 'platform_guarantee'"
            tone="soon"
            class="requirement-hall__badge-beta"
          />
        </span>
        <span class="requirement-hall__id">{{ props.card.requirement_id }}</span>
      </div>

      <h2>{{ props.card.title }}</h2>
      <p>{{ requirementRichTextPreview(props.card.description, '当前需求暂未补充详细描述。') }}</p>
    </div>

    <div class="requirement-hall__card-bottom">
      <div class="requirement-hall__meta-row">
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span>更新于 {{ formatTimeLabel(props.card.updated_at) }}</span>
      </div>

      <div class="portal-page__card-footer">
        <div class="requirement-hall__budget">
          <span>预算估算</span>
          <strong>{{ formatMoney(props.card.budget) }}</strong>
        </div>
        <span class="requirement-hall__view">查看详情 <span aria-hidden="true">→</span></span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.requirement-hall__card {
  height: 100%;
  min-height: 180px;
  cursor: pointer;
  transition:
    border-color var(--73-transition),
    box-shadow var(--73-transition);
}

.requirement-hall__card:hover {
  border-color: var(--73-border-hover);
  box-shadow: var(--73-shadow-card-hover);
}

.requirement-hall__card:focus-visible {
  outline: none;
  box-shadow: var(--73-focus-ring);
}

.requirement-hall__card-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.requirement-hall__badges {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 2px;
}

.requirement-hall__badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 20px;
  padding: 0 8px;
  border: 1px solid var(--73-border);
  border-radius: 4px;
  background: var(--73-inset);
  color: var(--73-ink-muted);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
}

.requirement-hall__badge--warning {
  border-color: var(--73-warning-line);
  background: var(--73-warning-soft);
  color: var(--73-warning-text);
}

.requirement-hall__badge--success {
  border-color: var(--73-success-line);
  background: var(--73-success-soft);
  color: var(--73-success-text);
}

/* 胶囊内塞一枚 BETA 后仍是 20px 高：标签字号降一档，别把卡头撑高。 */
.requirement-hall__badge-beta {
  min-height: 16px;
  padding: 0 5px;
  font-size: 10px;
}

.requirement-hall__id {
  margin-left: auto;
  color: var(--73-ink-muted);
  font-family: var(--73-font-family-mono);
  font-size: 11px;
}

.requirement-hall__card h2 {
  margin: 0;
  color: var(--73-ink);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.requirement-hall__card p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--73-ink-soft);
  font-size: 12px;
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
}

.requirement-hall__card-bottom {
  display: flex;
  flex-direction: column;
  margin-top: auto;
}

.requirement-hall__meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 0;
  border-top: 1px solid var(--73-border-soft);
  color: var(--73-ink-muted);
  font-size: 11px;
}

.requirement-hall__meta-row svg {
  flex: 0 0 auto;
}

.requirement-hall__budget {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.requirement-hall__budget span {
  color: var(--73-ink-muted);
  font-size: 11px;
}

.requirement-hall__budget strong {
  color: var(--73-ink);
  font-family: var(--73-font-family-mono);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.2;
}

.requirement-hall__view {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--73-border);
  border-radius: var(--73-radius-control);
  background: var(--73-surface);
  color: var(--73-accent);
  font-size: 12px;
  font-weight: 500;
  transition:
    background-color var(--73-transition),
    border-color var(--73-transition);
}

.requirement-hall__card:hover .requirement-hall__view {
  border-color: var(--73-border-hover);
  background: var(--73-bg-soft);
}
</style>
