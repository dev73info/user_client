<script setup lang="ts">
import { Close, Connection, TIcon } from 'ui_73info'

import type { PublicRequirementSpotlightItem } from '@/api/requirements'
import PaymentModeChip from '@/components/PaymentModeChip.vue'
import {
  formatCnDateTime as formatTimeLabel,
  formatCny as formatMoney,
  requirementPaymentModeLabel,
} from '@/shared/requirementDisplay'
import { requirementStatusText } from '@/shared/searchResults'

/**
 * 搜索结果里的需求详情弹窗（本体，不含遮罩：遮罩留在视图模板里，见 `SearchResultsView`）。
 *
 * 弹窗只吃四样东西：摘要、两段已经洗好的富文本、以及「能不能出接取入口」——
 * 补详情的时序、`v-html` 的兜底文案与「是不是我发的」都在
 * `useSearchRequirementPreview` / `shared/requirementDisplay` 里。
 * 关闭与接取各 `emit` 一次，落点由页面转给 `useSearchResultNavigation`。
 */
defineProps<{
  requirement: PublicRequirementSpotlightItem
  descriptionHtml: string
  acceptanceHtml: string
  canClaim: boolean
}>()
const emit = defineEmits<{ close: []; claim: [] }>()
</script>

<template>
  <section class="portal-search-detail" :aria-label="`${requirement.title}详情`">
    <header class="portal-search-detail__head">
      <div>
        <PaymentModeChip :mode="requirement.payment_mode" />
        <h3>{{ requirement.title }}</h3>
        <p>
          {{ requirement.requirement_id }} ·
          {{ requirementStatusText(requirement.status, requirement.payment_mode) }}
        </p>
      </div>
      <button
        class="portal-search-detail__close"
        type="button"
        aria-label="关闭详情"
        @click="emit('close')"
      >
        <TIcon>
          <Close />
        </TIcon>
      </button>
    </header>

    <div class="portal-search-detail__meta">
      <span>编号：{{ requirement.requirement_id }}</span>
      <span>发布方式：{{ requirementPaymentModeLabel(requirement.payment_mode) }}</span>
      <span>状态：{{ requirementStatusText(requirement.status, requirement.payment_mode) }}</span>
      <span>更新：{{ formatTimeLabel(requirement.updated_at) }}</span>
      <span>创建：{{ formatTimeLabel(requirement.created_at) }}</span>
    </div>

    <section class="portal-search-detail__review-panel">
      <div class="portal-search-detail__review-item">
        <span class="portal-search-detail__review-label">需求标题</span>
        <div class="portal-search-detail__review-value">{{ requirement.title }}</div>
      </div>

      <div class="portal-search-detail__review-item">
        <span class="portal-search-detail__review-label">需求描述</span>
        <article
          class="portal-search-detail__review-value portal-search-detail__review-value--multiline portal-search-detail__rich"
          v-html="descriptionHtml"
        ></article>
      </div>

      <div class="portal-search-detail__review-grid">
        <div class="portal-search-detail__review-item">
          <span class="portal-search-detail__review-label">预算</span>
          <div class="portal-search-detail__review-value">
            {{ formatMoney(requirement.budget) }}
          </div>
        </div>

        <div class="portal-search-detail__review-item">
          <span class="portal-search-detail__review-label">验收标准</span>
          <article
            class="portal-search-detail__review-value portal-search-detail__review-value--multiline portal-search-detail__rich"
            v-html="acceptanceHtml"
          ></article>
        </div>
      </div>
    </section>

    <div v-if="canClaim" class="portal-search-detail__actions">
      <button class="portal-search-detail__bind" type="button" @click="emit('claim')">
        <TIcon>
          <Connection />
        </TIcon>
        <span>前往工作台接取需求</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
/* 弹窗的色值一律取自视图根上那套 `--sr-*`（`SearchResultsView` 的 scoped 块）：
   本文件零裸色值，改色只改视图根那一处。遮罩的样式也在视图里（遮罩是视图的元素）。 */
.portal-search-detail {
  width: min(860px, 100%);
  max-height: min(760px, calc(100dvh - 32px));
  overflow-y: auto;
  border: 1px solid var(--sr-detail-line);
  border-radius: 18px;
  background: var(--sr-surface);
  box-shadow: 0 28px 72px var(--sr-detail-shadow);
}

.portal-search-detail__head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--sr-divider);
  background: var(--sr-head-bg);
  backdrop-filter: blur(12px);
}

.portal-search-detail__head h3 {
  margin: 10px 0 6px;
  color: var(--sr-ink);
  font-size: 22px;
  line-height: 1.3;
}

.portal-search-detail__head p {
  margin: 0;
  color: var(--sr-text-muted);
  font-size: 13px;
  font-weight: 700;
}

.portal-search-detail__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border: 1px solid var(--sr-close-line);
  border-radius: 10px;
  background: var(--sr-surface);
  color: var(--sr-ink-soft);
  cursor: pointer;
}

.portal-search-detail__close:hover,
.portal-search-detail__close:focus-visible {
  border-color: var(--sr-brand-line);
  color: var(--sr-brand);
  outline: none;
}

.portal-search-detail__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding: 14px 22px;
  border-bottom: 1px solid var(--sr-divider-soft);
  color: var(--sr-ink-muted);
  font-size: 13px;
  font-weight: 800;
}

.portal-search-detail__review-panel {
  display: grid;
  gap: 12px;
  margin: 16px 22px;
  padding: 16px;
  border: 1px solid var(--sr-panel-line);
  border-radius: 18px;
  background: linear-gradient(180deg, var(--sr-panel-from), var(--sr-panel-to));
}

.portal-search-detail__review-grid {
  display: grid;
  grid-template-columns: minmax(0, 160px) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}

.portal-search-detail__review-item {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.portal-search-detail__review-grid .portal-search-detail__review-item {
  grid-template-rows: auto 1fr;
}

.portal-search-detail__review-label {
  color: var(--sr-text-muted);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  line-height: 1.35;
}

.portal-search-detail__review-value {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--sr-value-bg);
  color: var(--sr-ink);
  font-weight: 700;
  line-height: 1.7;
  box-shadow: inset 0 0 0 1px var(--sr-value-line);
}

.portal-search-detail__review-value--multiline {
  min-height: 96px;
}

.portal-search-detail__review-grid .portal-search-detail__review-value {
  height: 100%;
}

.portal-search-detail__review-grid div.portal-search-detail__review-value {
  display: flex;
  align-items: center;
}

.portal-search-detail__rich :deep(p) {
  margin: 0 0 10px;
}

.portal-search-detail__rich :deep(p:last-child) {
  margin-bottom: 0;
}

.portal-search-detail__rich :deep(ul),
.portal-search-detail__rich :deep(ol) {
  margin: 8px 0;
  padding-left: 22px;
}

.portal-search-detail__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 22px 22px;
  background: var(--sr-actions-bg);
}

.portal-search-detail__bind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid var(--sr-brand-line);
  border-radius: 8px;
  background: var(--sr-brand);
  color: var(--sr-on-brand);
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 8px 18px var(--sr-bind-shadow);
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.portal-search-detail__bind:hover,
.portal-search-detail__bind:focus-visible {
  border-color: var(--sr-brand-line-strong);
  background: var(--sr-brand-strong);
  box-shadow: 0 10px 22px var(--sr-bind-hover-shadow);
  outline: none;
  transform: translateY(-1px);
}

/* 断点与其他页一致收敛到 640（原来这两处跟着页面的 860 档一起收到 640）。 */
@media (max-width: 640px) {
  .portal-search-detail__review-grid {
    grid-template-columns: 1fr;
  }
}
</style>
