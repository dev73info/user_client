<script setup lang="ts">
import type { PublicRequirementSpotlightItem } from '@/api/requirements'
import PaymentModeChip from '@/components/PaymentModeChip.vue'
import {
  formatCnDateTime as formatTimeLabel,
  formatCny as formatMoney,
} from '@/shared/requirementDisplay'
import { requirementDescription, requirementStatusText } from '@/shared/searchResults'

/**
 * 搜索结果里的一张需求卡片（发布方式胶囊 + 状态 / 标题与描述 / 编号与更新时间 / 预算与入口）。
 *
 * 与资源卡片的差别只有「点开是页内详情弹窗」：本组件照样只 `emit('open')`，
 * 弹窗状态在 `useSearchRequirementPreview`，落点在 `useSearchResultNavigation`。
 */
defineProps<{ requirement: PublicRequirementSpotlightItem }>()
const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <article
    class="portal-page__card portal-search-result-card portal-search-result-card--requirement"
    role="button"
    tabindex="0"
    @click="emit('open')"
    @keydown.enter="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <div class="portal-page__card-topline">
      <PaymentModeChip :mode="requirement.payment_mode" />
      <span class="portal-page__meta">{{
        requirementStatusText(requirement.status, requirement.payment_mode)
      }}</span>
    </div>
    <h3>{{ requirement.title }}</h3>
    <p>{{ requirementDescription(requirement) }}</p>
    <div class="portal-search-result-card__meta-row">
      <span>{{ requirement.requirement_id }}</span>
      <span>更新于 {{ formatTimeLabel(requirement.updated_at) }}</span>
    </div>
    <div class="portal-page__card-footer">
      <strong>{{ formatMoney(requirement.budget) }}</strong>
      <span class="portal-search-result-card__action">查看需求</span>
    </div>
  </article>
</template>
