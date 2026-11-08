<script setup lang="ts">
/**
 * 首次进入某个页面的引导提示。
 *
 * 只有该页还没看过、也没提示过（`shouldOffer`）才出现；出现即写 `offered`，
 * 避免用户没点「开始引导」就反复被弹。这里不碰音频——播放必须由用户点击触发。
 */
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { getTour } from './tours'
import { useTour } from './useTour'

/** 路由名 → 引导 key：不在表里的页面不弹首次提示。 */
const TOUR_BY_ROUTE: Record<string, string> = {
  workbench: 'basic',
  'requirement-hall': 'requirement-hall',
  'workbench-requirement-hall': 'requirement-hall',
  'workbench-requirements': 'my-requirements',
  'workbench-signatures': 'signatures',
  'workbench-account': 'account',
}

const route = useRoute()
const { state, start, shouldOffer, markOffered } = useTour()

const tourKey = computed(() => TOUR_BY_ROUTE[String(route.name ?? '')] ?? null)
const visible = ref(false)
const title = computed(() => (tourKey.value ? (getTour(tourKey.value)?.title ?? '语音引导') : ''))

watch(
  [tourKey, () => state.active],
  ([key, active]) => {
    if (!key || active || !shouldOffer(key)) {
      visible.value = false
      return
    }
    visible.value = true
    markOffered(key)
  },
  { immediate: true },
)

function begin() {
  const key = tourKey.value
  if (!key) return
  if (start(key)) visible.value = false
}

function later() {
  visible.value = false
}
</script>

<template>
  <Teleport to="body">
    <aside v-if="visible" class="tour-offer" role="dialog" aria-label="语音引导提示">
      <span class="tour-offer__eyebrow">语音引导</span>
      <strong class="tour-offer__title">{{ title }}</strong>
      <p class="tour-offer__body">用语音带你熟悉本页，随时可以跳过。</p>
      <div class="tour-offer__actions">
        <button class="tour-offer__start" type="button" @click="begin">开始引导</button>
        <button class="tour-offer__later" type="button" @click="later">不用了</button>
      </div>
    </aside>
  </Teleport>
</template>

<style scoped>
.tour-offer {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: calc(var(--73-z-tour) - 1);
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: min(320px, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--73-border);
  border-radius: var(--73-radius-card);
  background: var(--73-surface);
  box-shadow: var(--73-shadow-dialog);
  color: var(--73-ink);
}

.tour-offer__eyebrow {
  font-size: var(--73-font-size-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--73-accent);
}

.tour-offer__title {
  font-size: var(--73-font-size-md);
  font-weight: var(--73-font-weight-bold);
}

.tour-offer__body {
  margin: 0;
  font-size: var(--73-font-size-sm);
  line-height: 1.6;
  color: var(--73-ink-muted);
}

.tour-offer__actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.tour-offer__start,
.tour-offer__later {
  flex: 1;
  min-height: 34px;
  border-radius: var(--73-radius-control);
  font-size: var(--73-font-size-sm);
  cursor: pointer;
}

.tour-offer__start {
  border: 1px solid var(--73-accent);
  background: var(--73-accent);
  color: var(--73-ink-inverse);
  font-weight: var(--73-font-weight-bold);
}

.tour-offer__later {
  border: 1px solid var(--73-border);
  background: var(--73-surface);
  color: var(--73-ink-soft);
}

@media (max-width: 640px) {
  .tour-offer {
    right: 16px;
    bottom: 88px;
  }
}
</style>
