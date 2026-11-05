<script setup lang="ts">
import { computed } from 'vue'

import BetaTag from '@/components/BetaTag.vue'
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
    <BetaTag v-if="mode === 'platform_guarantee'" tone="soon" class="pay-mode-chip__beta" />
  </span>
</template>

<style scoped>
.pay-mode-chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 3px 9px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  white-space: nowrap;
}

/* 浅底 + 深字：底色只做一丝色调，重量交给文字，避免一整块饱和色压在卡头上。
   担保档要多一点绿、且要亮：用「鲜绿」那一档，墨绿在小字号上发灰 */
.pay-mode-chip--platform_guarantee {
  border-color: var(--73-accent-line);
  background: var(--73-accent-soft);
  color: var(--73-accent);
}

.pay-mode-chip--self_managed {
  border-color: var(--73-warning-line);
  background: var(--73-warning-soft);
  color: var(--73-warning-text);
}

/* 胶囊里再塞一枚 BETA：字号与高度各降一档，别把原有胶囊撑高。 */
.pay-mode-chip__beta {
  min-height: 16px;
  margin-left: 6px;
  padding: 0 5px;
  font-size: 10px;
}
</style>
