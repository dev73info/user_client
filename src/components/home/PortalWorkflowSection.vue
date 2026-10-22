<script setup lang="ts">
import type { PortalWorkflowStep } from '@/shared/home/portalSections'

/**
 * 门户首页「定制流程」五步（R047 从 `views/HomeView.vue` 拆出）。
 *
 * 纯展示组件：五个步骤卡只回抛 `open(step)`，点哪一步走哪一支（发布弹窗 / 需求进度 /
 * 开发者入口）全在视图的 `openWorkflowStep` 里。末步不画箭头（`index < steps.length - 1`）。
 * 样式仍在全局 `styles/home.css`（`.portal-workflow-*` / `.portal-step-card*`），本组件不带 `<style>`。
 */
withDefaults(defineProps<{ steps: readonly PortalWorkflowStep[] }>(), { steps: () => [] })

const emit = defineEmits<{ (e: 'open', step: PortalWorkflowStep): void }>()
</script>

<template>
  <section class="portal-section portal-section--workflow">
    <div class="portal-section__header">
      <div class="portal-section-title portal-section-title--plain">
        <h2>定制流程</h2>
      </div>
    </div>
    <div class="portal-workflow-grid" aria-label="定制流程">
      <div
        v-for="(step, index) in steps"
        :key="step.step + step.title"
        class="portal-workflow-item"
      >
        <button
          class="portal-step-card"
          :class="`portal-step-card--${step.accent}`"
          type="button"
          @click="emit('open', step)"
        >
          <span class="portal-step-card__icon" aria-hidden="true">{{ step.icon }}</span>
          <span class="portal-step-card__body">
            <strong
              ><i class="portal-step-card__no">{{ step.step }}. </i>{{ step.title }}</strong
            >
            <span>{{ step.summary }}</span>
          </span>
        </button>
        <span v-if="index < steps.length - 1" class="portal-step-card__arrow" aria-hidden="true"
          >›</span
        >
      </div>
    </div>
  </section>
</template>
