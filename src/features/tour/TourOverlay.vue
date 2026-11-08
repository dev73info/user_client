<script setup lang="ts">
/**
 * 引导浮层：整屏遮罩 + 挖洞高亮 + 步骤卡片。
 *
 * 高亮用超大 `box-shadow` 挖洞，不裁切被高亮元素本身；卡片按 target 四周空间自动翻转，
 * 最后统一 clamp 在视口内。`prefers-reduced-motion` 时关闭过渡，滚动也用即时定位。
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
  type CSSProperties,
} from 'vue'
import { Close, TIcon } from 'ui_73info'

import { useTour } from './useTour'

const GAP = 14
const MARGIN = 16
const CARD_WIDTH_FALLBACK = 360
const CARD_HEIGHT_FALLBACK = 240

const {
  state,
  audio,
  currentTour,
  currentStep,
  totalSteps,
  next,
  prev,
  dismiss,
  setVoice,
  replayNarration,
} = useTour()

const cardRef = ref<HTMLElement | null>(null)
const cardSize = reactive({ width: 0, height: 0 })
const viewport = reactive({
  width: typeof window === 'undefined' ? 1280 : window.innerWidth,
  height: typeof window === 'undefined' ? 800 : window.innerHeight,
})
let previousFocus: HTMLElement | null = null

const visible = computed(() => Boolean(state.active && currentStep.value))
const isLast = computed(() => state.index >= totalSteps.value - 1)
const stepNumber = computed(() => state.index + 1)

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function refreshViewport() {
  viewport.width = window.innerWidth
  viewport.height = window.innerHeight
}

async function refreshCardSize() {
  await nextTick()
  const el = cardRef.value
  if (!el) return
  cardSize.width = el.offsetWidth
  cardSize.height = el.offsetHeight
}

const spotlightStyle = computed<CSSProperties>(() => {
  const rect = state.rect
  if (!rect) return {}
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
})

const cardStyle = computed<CSSProperties>(() => {
  const width = cardSize.width || CARD_WIDTH_FALLBACK
  const height = cardSize.height || CARD_HEIGHT_FALLBACK
  const vw = viewport.width
  const vh = viewport.height
  const rect = state.rect
  if (!rect) {
    return {
      left: `${clamp((vw - width) / 2, MARGIN, vw - width - MARGIN)}px`,
      top: `${clamp((vh - height) / 2, MARGIN, vh - height - MARGIN)}px`,
    }
  }

  const room = {
    top: rect.top - GAP - height - MARGIN,
    bottom: vh - MARGIN - (rect.top + rect.height + GAP + height),
    left: rect.left - GAP - width - MARGIN,
    right: vw - MARGIN - (rect.left + rect.width + GAP + width),
  }
  let placement = currentStep.value?.placement ?? 'bottom'
  if (room[placement] < 0) {
    const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const
    placement =
      room[opposite[placement]] >= 0
        ? opposite[placement]
        : room.bottom >= room.top
          ? 'bottom'
          : 'top'
  }

  if (placement === 'top' || placement === 'bottom') {
    return {
      left: `${clamp(rect.left + rect.width / 2 - width / 2, MARGIN, vw - width - MARGIN)}px`,
      top:
        placement === 'bottom'
          ? `${clamp(rect.top + rect.height + GAP, MARGIN, vh - height - MARGIN)}px`
          : `${clamp(rect.top - GAP - height, MARGIN, vh - height - MARGIN)}px`,
    }
  }
  return {
    left:
      placement === 'right'
        ? `${clamp(rect.left + rect.width + GAP, MARGIN, vw - width - MARGIN)}px`
        : `${clamp(rect.left - GAP - width, MARGIN, vw - width - MARGIN)}px`,
    top: `${clamp(rect.top + rect.height / 2 - height / 2, MARGIN, vh - height - MARGIN)}px`,
  }
})

function handleKeydown(event: KeyboardEvent) {
  if (!state.active) return
  if (event.key === 'Escape') {
    event.preventDefault()
    dismiss()
    return
  }
  const target = event.target instanceof HTMLElement ? event.target : null
  const interactive = Boolean(
    target?.closest('button, a, input, textarea, select, [contenteditable="true"]'),
  )
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    prev()
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    next()
  } else if (event.key === 'Enter' && !interactive) {
    event.preventDefault()
    next()
  }
}

watch(
  () => [state.active, state.index, state.rect] as const,
  async () => {
    await nextTick()
    if (!state.active) return
    refreshViewport()
    await refreshCardSize()
  },
  { deep: true, immediate: true },
)

watch(
  () => state.active,
  async (active) => {
    if (active) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      await nextTick()
      cardRef.value?.focus()
    } else if (previousFocus) {
      const target = previousFocus
      previousFocus = null
      target.focus?.()
    }
  },
)

function handleResize() {
  refreshViewport()
  void refreshCardSize()
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible && currentTour && currentStep" class="tour" role="presentation">
      <div class="tour__scrim" :class="{ 'tour__scrim--solid': !state.rect }" @click="dismiss" />
      <div v-if="state.rect" class="tour__spotlight" :style="spotlightStyle" aria-hidden="true" />

      <section
        ref="cardRef"
        class="tour__card"
        role="dialog"
        aria-modal="true"
        :aria-label="`${currentTour.title}语音引导`"
        tabindex="-1"
        :style="cardStyle"
      >
        <header class="tour__head">
          <span class="tour__progress">第 {{ stepNumber }} / {{ totalSteps }} 步</span>
          <button class="tour__icon-btn" type="button" aria-label="关闭引导" @click="dismiss">
            <TIcon><Close /></TIcon>
          </button>
        </header>

        <h2 class="tour__title">{{ currentStep.title }}</h2>
        <p class="tour__body">{{ currentStep.body }}</p>

        <div class="tour__dots" aria-hidden="true">
          <span
            v-for="step in totalSteps"
            :key="step"
            class="tour__dot"
            :class="{ 'tour__dot--active': step === stepNumber }"
          />
        </div>

        <footer class="tour__foot">
          <div class="tour__tools">
            <button
              class="tour__tool"
              type="button"
              :aria-pressed="state.voiceEnabled"
              @click="setVoice(!state.voiceEnabled)"
            >
              {{ state.voiceEnabled ? '语音：开' : '语音：关' }}
              <span v-if="audio.playing" class="tour__playing" aria-hidden="true" />
            </button>
            <button
              class="tour__tool"
              type="button"
              :disabled="!state.voiceEnabled"
              @click="replayNarration"
            >
              重播
            </button>
          </div>
          <div class="tour__nav">
            <button class="tour__skip" type="button" @click="dismiss">跳过</button>
            <button v-if="state.index > 0" class="tour__nav-btn" type="button" @click="prev">
              上一步
            </button>
            <button class="tour__nav-btn tour__nav-btn--primary" type="button" @click="next">
              {{ isLast ? '完成' : '下一步' }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped src="./tour-overlay.css"></style>
