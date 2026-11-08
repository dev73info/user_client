<script setup lang="ts">
/**
 * 「本页引导」入口：点一下就从第一步开始播，不受 seen 限制（随时可重播）。
 *
 * `compact` 给图标栏那种方形按钮用，只留一个问号；外部的 class / data-tour 会落到根按钮上。
 */
import { useTour } from './useTour'

const props = withDefaults(
  defineProps<{
    tour: string
    label?: string
    compact?: boolean
  }>(),
  { label: '本页引导', compact: false },
)

const { start } = useTour()

function begin() {
  start(props.tour)
}
</script>

<template>
  <button
    class="tour-button"
    :class="{ 'tour-button--compact': compact }"
    type="button"
    :aria-label="label"
    :title="label"
    @click="begin"
  >
    <span class="tour-button__glyph" aria-hidden="true">?</span>
    <span v-if="!compact" class="tour-button__label">{{ label }}</span>
  </button>
</template>

<style scoped>
.tour-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--73-border);
  border-radius: var(--73-radius-control);
  background: var(--73-surface);
  color: var(--73-ink-soft);
  font-size: var(--73-font-size-sm);
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    color 140ms ease;
}

.tour-button:hover {
  border-color: var(--73-accent);
  color: var(--73-accent);
}

.tour-button--compact {
  width: 44px;
  height: 44px;
  min-height: 44px;
  padding: 0;
  border-color: transparent;
  background: transparent;
}

.tour-button__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid currentcolor;
  border-radius: var(--73-radius-pill);
  font-size: var(--73-font-size-xs);
  font-weight: var(--73-font-weight-bold);
  line-height: 1;
}
</style>
