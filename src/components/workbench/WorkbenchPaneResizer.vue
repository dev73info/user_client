<script setup lang="ts">
/**
 * 工作台中栏的拖拽条：消息中心（会话列表）与分组导航共用这一个组件，
 * 命中区 12px、竖线 2px、悬停/聚焦转主色，交互与外观完全一致。
 *
 * 纯展示 + 事件转发：宽度计算、上下限、持久化都在各自页面（两处可拖范围不同）。
 */
defineProps<{
  /** 无障碍名称，如「调整会话列表宽度」 */
  label: string
  valueMin: number
  valueMax: number
  valueNow: number
}>()

const emit = defineEmits<{
  reset: []
  keydown: [event: KeyboardEvent]
  pointerdown: [event: PointerEvent]
  pointermove: [event: PointerEvent]
  pointerup: [event: PointerEvent]
  pointercancel: [event: PointerEvent]
}>()
</script>

<template>
  <div
    class="workbench-pane-resizer"
    role="separator"
    :aria-label="label"
    aria-orientation="vertical"
    :aria-valuemin="valueMin"
    :aria-valuemax="valueMax"
    :aria-valuenow="valueNow"
    tabindex="0"
    @dblclick="emit('reset')"
    @keydown="emit('keydown', $event)"
    @pointerdown.prevent="emit('pointerdown', $event)"
    @pointermove.prevent="emit('pointermove', $event)"
    @pointerup="emit('pointerup', $event)"
    @pointercancel="emit('pointercancel', $event)"
  />
</template>

<style scoped src="./workbench-pane-resizer.css"></style>
