<script setup lang="ts">
/**
 * 把页面顶部读数条（.wb-strip / .dev-meta-strip）在移动端搬进工作台顶栏，顶替顶栏标题；
 * 桌面端（以及不在工作台外壳里的页面）原地渲染，不影响原布局。
 * 用 Teleport 的 disabled 切换同一份 DOM，读数条不会渲染两份。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  WORKBENCH_BAR_MEDIA,
  WORKBENCH_BAR_SLOT_ID,
  workbenchBarSlotCount,
} from '@/shared/workbenchBarSlot'

const props = withDefaults(
  defineProps<{
    /** 只在移动端顶栏里出现，桌面端不渲染（页面另有桌面版读数时用） */
    mobileOnly?: boolean
    /** 关掉搬运、始终原地渲染（同一个组件既有内嵌形态又有弹窗形态时，弹窗形态不该进顶栏） */
    disabled?: boolean
  }>(),
  { mobileOnly: false, disabled: false },
)

const isMobile = ref(false)
const hasTarget = ref(false)
let media: MediaQueryList | null = null

function syncMedia() {
  isMobile.value = media?.matches ?? false
}

onMounted(() => {
  hasTarget.value = Boolean(document.getElementById(WORKBENCH_BAR_SLOT_ID))
  // 单测环境（jsdom）没有 matchMedia：按桌面端处理，原地渲染
  if (typeof window.matchMedia !== 'function') return
  media = window.matchMedia(WORKBENCH_BAR_MEDIA)
  syncMedia()
  media.addEventListener('change', syncMedia)
})

const active = computed(() => !props.disabled && isMobile.value && hasTarget.value)

watch(active, (value, previous) => {
  if (value && !previous) workbenchBarSlotCount.value += 1
  else if (!value && previous) workbenchBarSlotCount.value -= 1
})

onBeforeUnmount(() => {
  media?.removeEventListener('change', syncMedia)
  if (active.value) workbenchBarSlotCount.value -= 1
})
</script>

<template>
  <Teleport v-if="!props.mobileOnly || active" defer :to="`#${WORKBENCH_BAR_SLOT_ID}`" :disabled="!active">
    <slot />
  </Teleport>
</template>
