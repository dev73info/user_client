<script setup lang="ts">
/**
 * BETA 标签：口径见 `shared/betaFeatures.ts`。
 *
 * 蓝色（`open`）＝ 开放测试；灰色（`soon`）＝ 暂不开放测试。
 * 两种 tone 都落在 `ui_73info` 的 `TTag` 上，不另起一套胶囊样式。
 *
 * `size="xs"` 是「塞进既有胶囊 / 角标」那一档：TTag 的 `sm` 是 22px 高，
 * 放进 20px 的需求大厅胶囊或封面角标会撑高父容器，所以在 TTag 的 `sm` 上再收一档
 * （18px 高、11px 字，仍是《设计规范》第四节的标签字号档）。调用方只写定位与间距。
 */
import { computed } from 'vue'
import { TTag } from 'ui_73info'

const props = withDefaults(defineProps<{ tone?: 'open' | 'soon'; size?: 'sm' | 'xs' }>(), {
  tone: 'open',
  size: 'sm',
})

const tagTone = computed(() => (props.tone === 'soon' ? 'neutral' : 'accent'))
</script>

<template>
  <TTag
    class="beta-tag"
    :class="{ 'beta-tag--xs': props.size === 'xs' }"
    :tone="tagTone"
    size="sm"
    variant="outline"
    >BETA</TTag
  >
</template>

<style scoped>
/* 只收高度与左右内边距：字号仍是 TTag `sm` 的 11px 档，不引新字号。 */
.beta-tag--xs {
  min-height: 18px;
  padding: 0 5px;
}
</style>
