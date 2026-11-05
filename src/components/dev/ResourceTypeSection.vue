<script setup lang="ts">
import BetaTag from '@/components/BetaTag.vue'
import {
  RESOURCE_CREATION_TYPE_OPTIONS,
  RESOURCE_PAID_MODE_OPTIONS,
  type ResourceCreationType,
  type ResourcePaidMode,
} from '@/shared/resourceCreation'

const creationType = defineModel<ResourceCreationType>('creationType', { required: true })
const paidMode = defineModel<ResourcePaidMode>('paidMode', { required: true })
</script>

<template>
  <section class="dev-upload-block dev-resource-type">
    <header class="dev-card-head">
      <section class="dev-card-head__title-block">
        <h3 class="dev-section-title">资源类型</h3>
      </section>
    </header>

    <div class="dev-segmented" role="group" aria-label="资源类型">
      <button
        v-for="option in RESOURCE_CREATION_TYPE_OPTIONS"
        :key="option.value"
        type="button"
        class="dev-segmented__item"
        :class="{ 'is-active': creationType === option.value }"
        :aria-pressed="creationType === option.value"
        @click="creationType = option.value"
      >
        <span class="dev-segmented__label">{{ option.label }}</span>
        <BetaTag v-if="option.value === 'paid' || option.value === 'api'" />
      </button>
    </div>

    <div v-if="creationType === 'paid'" class="dev-resource-type__paid">
      <span class="dev-resource-type__label">付费方式</span>
      <div class="dev-segmented" role="group" aria-label="付费方式">
        <button
          v-for="option in RESOURCE_PAID_MODE_OPTIONS"
          :key="option.value"
          type="button"
          class="dev-segmented__item"
          :class="{ 'is-active': paidMode === option.value }"
          :aria-pressed="paidMode === option.value"
          @click="paidMode = option.value"
        >
          {{ option.label }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dev-resource-type,
.dev-resource-type__paid {
  display: grid;
  gap: 16px;
}

.dev-resource-type {
  margin-bottom: 18px;
}

/* 资源类型三档铺满整行：它决定下面整张表单的形态，是这一屏的主选择，给足宽度。 */
.dev-resource-type > .dev-segmented {
  display: flex;
  width: 100%;
}

.dev-resource-type > .dev-segmented .dev-segmented__item {
  display: inline-flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
}

.dev-resource-type__paid > .dev-segmented {
  display: flex;
  width: 100%;
}

.dev-resource-type__paid > .dev-segmented .dev-segmented__item {
  flex: 1 1 0;
  min-width: 0;
}

.dev-resource-type__paid {
  grid-template-columns: auto minmax(0, 360px);
  align-items: center;
}

.dev-resource-type__label {
  font-weight: 600;
}

/* 640 档：三档按钮可能挤不下一行「文案 + BETA」，允许换行、不要把标签压出按钮。 */
@media (max-width: 640px) {
  .dev-resource-type__paid {
    grid-template-columns: 1fr;
  }

  .dev-resource-type > .dev-segmented .dev-segmented__item {
    flex-wrap: wrap;
    gap: 2px 6px;
    padding: 6px 4px;
    white-space: normal;
  }
}
</style>
