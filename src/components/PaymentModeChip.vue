<script setup lang="ts">
import { computed } from 'vue'

import { requirementPaymentModeLabel } from '@/shared/requirementDisplay'

/**
 * 发布方式标签：电签担保 / 无电签约定。
 *
 * 门户侧（需求大厅、我的需求、搜索结果）与开发者侧（需求大厅表格、我的接单卡片）共用这一份定义：
 * 同一个词在两端的底色必须一样。原先开发者侧用的是 Element 的 `el-tag`，
 * 于是「电签担保」在需求大厅是绿的、到了开发者这边变成琥珀（warning 档），
 * 而「无电签约定」在门户是琥珀、在开发者这边却是灰的——同一枚标签两端两个意思。
 *
 * 底色沿用门户「发布方式胶囊」原有的口径（原 `.portal-page__pay-chip--*`）：
 * 担保 = 绿，自管 = 琥珀，都是浅底 + 深字。
 *
 * 标签只表示发布方式；卡片状态由卡片自己的状态/进度信息表达，不再拼进这枚胶囊。
 */
const props = defineProps<{ mode: string }>()

const label = computed(() => requirementPaymentModeLabel(props.mode))
</script>

<template>
  <span class="pay-mode-chip" :class="`pay-mode-chip--${mode}`">
    {{ label }}<template v-if="$slots.default"> · <slot /></template>
  </span>
</template>

<style scoped>
.pay-mode-chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

.pay-mode-chip--platform_guarantee {
  background: color-mix(in srgb, var(--73-success) 60%, transparent);
  color: var(--73-success);
}

.pay-mode-chip--self_managed {
  background: color-mix(in srgb, var(--73-warning) 55%, transparent);
  color: var(--73-warning-text);
}
</style>
