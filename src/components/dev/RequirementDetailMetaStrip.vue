<script setup lang="ts">
import { computed } from 'vue'
import { TButton, TIcon, Back, Refresh } from 'ui_73info'
import {
  requirementPaymentText,
  requirementStatusText,
  type RequirementDetailFacts,
} from '@/shared/devRequirementDetail'

/**
 * 详情页顶部读数条：需求编号 / 状态 / 结算方式，右侧是返回与刷新。
 *
 * 与其余开发者页同一条形态（读数在左、页面级操作在右，刷新固定在 `__action` 槽）。
 * 这一页原来只有一条放两个灰字的工具栏、返回还是个另做的青色胶囊，
 * 与别页的 `.dev-btn` 不是一个体系，拆分时统一到这里。
 */
const props = defineProps<{
  requirement: RequirementDetailFacts | null
  loading: boolean
}>()

const emit = defineEmits<{
  back: []
  refresh: []
}>()

const statusText = computed(() =>
  props.requirement
    ? requirementStatusText(props.requirement.status, props.requirement.payment_mode)
    : '',
)
const paymentText = computed(() =>
  props.requirement ? requirementPaymentText(props.requirement) : '',
)
</script>

<template>
  <div class="dev-meta-strip">
    <template v-if="requirement">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">需求编号</span>
        <span class="dev-meta-strip__value">{{ requirement.requirement_id }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">状态</span>
        <span class="dev-meta-strip__value">{{ statusText }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">结算方式</span>
        <span class="dev-meta-strip__value">{{ paymentText }}</span>
      </div>
    </template>
    <div class="dev-meta-strip__item dev-meta-strip__action">
      <button type="button" class="dev-btn dev-btn--ghost" @click="emit('back')">
        <TIcon>
          <Back />
        </TIcon>
        <span>返回需求大厅</span>
      </button>
      <TButton icon-only :loading="loading" aria-label="刷新需求详情" @click="emit('refresh')">
        <TIcon>
          <Refresh />
        </TIcon>
      </TButton>
    </div>
  </div>
</template>
