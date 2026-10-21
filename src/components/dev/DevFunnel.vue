<script setup lang="ts">
/**
 * 接单漏斗：五个在途状态 + 本月完成，一格一档，底部细条按在途里最多的一档等比。
 *
 * 从 `views/DevHomeView.vue` 抽出来。这里只画：档位口径（哪五个状态、每档什么色调、
 * 「本月完成」独占一格）都在视图的 `funnelCells` 里算好——它读的是全屏快照 `pipeline`，
 * 与读数条「进行中项目」共用同一份 `PIPELINE_STAGES`，组件不再自己数一遍。
 */
type DevFunnelTone = 'blue' | 'gold' | 'cyan' | 'muted'

/** 一格：档位键、状态文案、单数、色调，以及细条长度占比与「是不是收尾那一格」。 */
type DevFunnelCell = {
  key: string
  label: string
  value: number
  tone: DevFunnelTone
  share: number
  done: boolean
}

defineProps<{ cells: DevFunnelCell[] }>()
</script>

<template>
  <section class="dev-home__funnel" aria-label="接单漏斗">
    <div
      v-for="cell in cells"
      :key="cell.key"
      class="dev-home__funnel-cell"
      :class="[`dev-home__funnel-cell--${cell.tone}`, { 'is-done': cell.done }]"
    >
      <span class="dev-home__funnel-label">{{ cell.label }}</span>
      <strong class="dev-home__funnel-value">{{ cell.value }}<small>单</small></strong>
      <span class="dev-home__funnel-bar" aria-hidden="true">
        <span :style="{ width: `${Math.round(cell.share * 100)}%` }" />
      </span>
    </div>
  </section>
</template>

<style scoped>
/* 漏斗：六格一排，数字是主角；底部细条按在途五档里最多的一档等比，看得出单子堆在哪一步。
   窄档（980 / 640）的覆盖留在视图的媒体块里（`:deep()` 只能在持有子组件那一层写），
   断点档位不许在这里另起一套。 */
.dev-home__funnel {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr)) minmax(0, 1.1fr);
  gap: 10px;
}

.dev-home__funnel-cell {
  --funnel-tone: var(--dev-blue);
  position: relative;
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 12px 14px 10px;
  border: 1px solid var(--dev-line);
  border-radius: var(--dev-radius-inner);
  background: var(--dev-surface-strong);
}

/* 在途五格之间的流向箭头：一个旋转的小方角，落在格与格的缝里 */
.dev-home__funnel-cell:not(.is-done):not(:nth-last-child(2))::after {
  content: '';
  position: absolute;
  top: 50%;
  right: -9px;
  z-index: 1;
  width: 8px;
  height: 8px;
  border-top: 2px solid var(--dev-line);
  border-right: 2px solid var(--dev-line);
  transform: translateY(-50%) rotate(45deg);
}

.dev-home__funnel-cell--gold {
  --funnel-tone: var(--dev-gold);
}

.dev-home__funnel-cell--cyan {
  --funnel-tone: var(--dev-cyan);
}

.dev-home__funnel-cell.is-done {
  border-color: color-mix(in srgb, var(--dev-cyan) 30%, transparent);
  background:
    linear-gradient(150deg, color-mix(in srgb, var(--dev-cyan) 12%, transparent), transparent 70%),
    var(--dev-surface-strong);
}

.dev-home__funnel-label {
  overflow: hidden;
  color: var(--dev-muted);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dev-home__funnel-value {
  color: var(--funnel-tone);
  font-size: 30px;
  font-weight: 800;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
}

.dev-home__funnel-value small {
  margin-left: 3px;
  color: var(--dev-muted);
  font-size: 12px;
  font-weight: 600;
}

.dev-home__funnel-bar {
  display: block;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dev-muted) 16%, transparent);
  overflow: hidden;
}

.dev-home__funnel-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--funnel-tone);
  transition: width 0.4s ease;
}
</style>
