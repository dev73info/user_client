<script setup lang="ts">
import BetaTag from '@/components/BetaTag.vue'
import {
  RESOURCE_CREATION_TYPE_OPTIONS,
  type ResourceCreationType,
} from '@/shared/resourceCreation'

const creationType = defineModel<ResourceCreationType>('creationType', { required: true })
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
        <span>{{ option.label }}</span>
        <BetaTag v-if="option.value === 'api'" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.dev-resource-type {
  display: grid;
  gap: 16px;
  margin-bottom: 18px;
}

/* 资源类型两个选项铺满整行：它决定下面整张表单的形态，是这一屏的主选择，给足宽度。 */
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

/* 640 档：两个按钮可能挤不下一行「文案 + BETA」，允许换行、不要把标签压出按钮。 */
@media (max-width: 640px) {
  .dev-resource-type > .dev-segmented .dev-segmented__item {
    flex-wrap: wrap;
    gap: 2px 6px;
    padding: 6px 4px;
    white-space: normal;
  }
}
</style>
