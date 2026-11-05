<script setup lang="ts">
/**
 * BETA 标签：口径见 `shared/betaFeatures.ts`。
 *
 * 蓝色（`open`）＝ 开放测试；灰色（`soon`）＝ 暂不开放测试。
 * 两种 tone 都落在 `ui_73info` 的 `TTag` 上，不另起一套胶囊样式。
 */
import { computed } from 'vue'
import { TTag } from 'ui_73info'

const props = withDefaults(defineProps<{ tone?: 'open' | 'soon' }>(), { tone: 'open' })

const tagTone = computed(() => (props.tone === 'soon' ? 'neutral' : 'accent'))
</script>

<template>
  <TTag class="beta-tag" :tone="tagTone" size="sm" variant="outline">BETA</TTag>
</template>
