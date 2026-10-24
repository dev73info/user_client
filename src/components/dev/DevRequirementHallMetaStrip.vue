<script setup lang="ts">
import { TButton, TIcon, Refresh } from 'ui_73info'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'

/**
 * 需求大厅顶部的读数条：需求单 / 无电签 / 电签 / 可用保证金 + 缴纳入口与刷新。
 *
 * 窄屏（≤1180 的工作台顶栏）里这整条由 `WorkbenchBarSlot` 搬进顶栏，
 * 「去缴纳保证金」按钮让出位置、读数本身变成可点的入口（见下方 `#workbench-mobile-bar-extra` 几条）。
 */
defineProps<{
  /** 服务端给的命中总数（不是当前页行数） */
  total: number
  /** 当前页里无电签（自管）的条数 */
  selfManaged: number
  /** 当前页里电签担保的条数 */
  guarantee: number
  /** 可用保证金读数，已格式化成 ¥0.00 */
  availableText: string
  /** 列表刷新中（刷新按钮的转圈） */
  loading: boolean
}>()

const emit = defineEmits<{
  /** 点可用保证金读数：去缴纳页（未签协议时会先被拦去签协议） */
  deposit: []
  /** 重新拉列表 */
  refresh: []
}>()
</script>

<template>
  <WorkbenchBarSlot>
    <div class="dev-meta-strip">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">需求单</span>
        <span class="dev-meta-strip__value">{{ total }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">无电签</span>
        <span class="dev-meta-strip__value">{{ selfManaged }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">电签</span>
        <span class="dev-meta-strip__value">{{ guarantee }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <!-- 窄屏顶栏里「去缴纳保证金」按钮让出位置，读数本身可点，直接去缴纳页 -->
      <button
        type="button"
        class="dev-meta-strip__item hall-deposit-link"
        aria-label="可用保证金，去缴纳保证金"
        @click="emit('deposit')"
      >
        <span class="dev-meta-strip__label">
          <span class="hall-deposit-link__prefix">可用</span>保证金
        </span>
        <span class="dev-meta-strip__value">{{ availableText }}</span>
      </button>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <TButton variant="solid" tone="accent" class="hall-deposit-cta" @click="emit('deposit')">
          去缴纳保证金
        </TButton>
        <TButton icon-only :loading="loading" aria-label="刷新需求列表" @click="emit('refresh')">
          <TIcon>
            <Refresh />
          </TIcon>
        </TButton>
      </div>
    </div>
  </WorkbenchBarSlot>
</template>

<style scoped>
/* 可用保证金读数做成按钮，但宽屏外观与其它读数一致 */
.hall-deposit-link {
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

/* 读数条进了顶栏：去掉「去缴纳保证金」按钮，读数改成主色带箭头的入口 */
#workbench-mobile-bar-extra .hall-deposit-cta {
  display: none;
}

#workbench-mobile-bar-extra .hall-deposit-link .dev-meta-strip__value {
  color: var(--dev-blue);
}

#workbench-mobile-bar-extra .hall-deposit-link .dev-meta-strip__value::after {
  margin-left: 2px;
  content: '›';
}

/* 顶栏宽度紧：标签省成「保证金」，刷新钉在右侧，读数再挤也只在左边折行 */
#workbench-mobile-bar-extra .hall-deposit-link__prefix {
  display: none;
}

#workbench-mobile-bar-extra .dev-meta-strip {
  position: relative;
  padding-right: 32px;
}

#workbench-mobile-bar-extra .dev-meta-strip__action {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
}
</style>
