<script setup lang="ts">
/**
 * 需求大厅的一张需求卡（卡格里的 `<article>`）。
 *
 * 从 `views/RequirementHallView.vue` 抽出来：模板、文案、可访问性属性（`role="button"` /
 * 键盘 Enter / 空格）与样式逐段照搬。组件只上报「要开详情」，取数与详情弹窗由页面处理。
 */
import type { PublicRequirementSpotlightItem } from '@/api/requirements'
import PaymentModeChip from '@/components/PaymentModeChip.vue'
import ShareCardGenerator from '@/components/ShareCardGenerator.vue'
import {
  formatCnDateTime as formatTimeLabel,
  formatCny as formatMoney,
} from '@/shared/requirementDisplay'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { requirementRichTextPreview } from '@/utils/requirementRichText'

const props = defineProps<{
  card: PublicRequirementSpotlightItem
  /** 未登录时卡片底部不给「分享」（分享卡要带身份信息） */
  authed: boolean
}>()

const emit = defineEmits<{
  (e: 'open', card: PublicRequirementSpotlightItem): void
}>()

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
    <div class="portal-page__card-topline">
      <PaymentModeChip :mode="card.payment_mode">{{
        requirementStatusLabel(card.status, card.payment_mode)
      }}</PaymentModeChip>
    </div>
    <h2>{{ card.title }}</h2>
    <p>{{ requirementRichTextPreview(card.description, '当前需求暂未补充详细描述。') }}</p>
    <div class="requirement-hall__meta-row">
      <span>{{ card.requirement_id }}</span>
      <span>更新于 {{ formatTimeLabel(card.updated_at) }}</span>
    </div>
    <div class="portal-page__card-footer">
      <strong>{{ formatMoney(card.budget) }}</strong>
      <div class="requirement-hall__card-actions">
        <span>查看详情</span>
        <ShareCardGenerator
          v-if="authed"
          share-type="requirement"
          :target-id="card.requirement_id"
          label="分享"
        />
      </div>
    </div>
  </article>
</template>

<style scoped>
.requirement-hall__card {
  height: 100%;
  min-height: 188px;
  cursor: pointer;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.requirement-hall__card .requirement-hall__meta-row {
  margin-top: auto;
}

.requirement-hall__card .portal-page__card-footer {
  margin-top: 0;
}

.requirement-hall__card:hover {
  border-color: rgba(37, 99, 235, 0.32);
  transform: translateY(-1px);
  box-shadow: 0 16px 30px rgba(76, 103, 172, 0.14);
}

.requirement-hall__card:focus-visible {
  border-color: rgba(37, 99, 235, 0.52);
  outline: none;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
}

.requirement-hall__card p {
  min-height: 48px;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  line-clamp: 3;
  -webkit-line-clamp: 3;
}

.requirement-hall__card .portal-page__card-footer span {
  color: #2563eb;
  font-size: 13px;
  font-weight: 800;
}

.requirement-hall__card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.requirement-hall__meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}
</style>
