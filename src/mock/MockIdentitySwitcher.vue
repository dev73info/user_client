<script setup lang="ts">
/**
 * mock 身份切换器（仅开发用）。
 *
 * 挂载在页面左上角边缘：右下角留给页面自身的浮层（下载进度、弹窗等），错开一侧免得互相遮挡。
 *
 * 行为约定：换身份整页刷新（登录态、路由守卫、各页首屏请求都围绕角色展开），
 * 因此这里只负责写身份与提示，不试图在内存里迁移状态。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { mockEnabled, mockSwitcherEnabled } from './env'
import { MOCK_IDENTITIES, MOCK_IDENTITY_PROFILES, currentMockIdentity } from './identity'
import { disableMock, switchMockIdentity } from './index'
import { clearUncoveredEndpoints, uncoveredEndpoints } from './uncovered'

const expanded = ref(false)
const showUncovered = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const fabRef = ref<HTMLButtonElement | null>(null)
const position = ref<{ left: number; top: number } | null>(null)

const available = computed(() => mockEnabled() && mockSwitcherEnabled())
const identity = computed(() => currentMockIdentity())
const profile = computed(() => MOCK_IDENTITY_PROFILES[identity.value])
const uncovered = computed(() => uncoveredEndpoints.value)
const switchStyle = computed(() =>
  position.value
    ? {
        left: `${position.value.left}px`,
        top: `${position.value.top}px`,
        right: 'auto',
        bottom: 'auto',
      }
    : undefined,
)

const DRAG_THRESHOLD = 4
const VIEWPORT_MARGIN = 8
let dragState: {
  pointerId: number
  startX: number
  startY: number
  startLeft: number
  startTop: number
  moved: boolean
} | null = null
let suppressClick = false
let suppressClickTimer: number | undefined

function clampPosition(left: number, top: number) {
  const width = rootRef.value?.offsetWidth ?? 0
  const height = rootRef.value?.offsetHeight ?? 0
  return {
    left: Math.min(
      Math.max(VIEWPORT_MARGIN, left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
    ),
    top: Math.min(
      Math.max(VIEWPORT_MARGIN, top),
      Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN),
    ),
  }
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const root = rootRef.value
  const fab = fabRef.value
  if (!root || !fab) return
  const rect = root.getBoundingClientRect()
  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: rect.left,
    startTop: rect.top,
    moved: false,
  }
  fab.setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!dragState || dragState.pointerId !== event.pointerId) return
  const deltaX = event.clientX - dragState.startX
  const deltaY = event.clientY - dragState.startY
  if (!dragState.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return
  dragState.moved = true
  position.value = clampPosition(dragState.startLeft + deltaX, dragState.startTop + deltaY)
}

function onPointerUp(event: PointerEvent) {
  if (!dragState || dragState.pointerId !== event.pointerId) return
  const moved = dragState.moved
  dragState = null
  if (fabRef.value?.hasPointerCapture?.(event.pointerId)) {
    fabRef.value.releasePointerCapture(event.pointerId)
  }
  if (!moved) return

  suppressClick = true
  if (suppressClickTimer !== undefined) window.clearTimeout(suppressClickTimer)
  suppressClickTimer = window.setTimeout(() => {
    suppressClick = false
    suppressClickTimer = undefined
  }, 0)
}

function toggleExpanded() {
  if (suppressClick) {
    suppressClick = false
    return
  }
  expanded.value = !expanded.value
}

function clampSavedPosition() {
  if (position.value) {
    position.value = clampPosition(position.value.left, position.value.top)
  }
}

onMounted(() => {
  window.addEventListener('resize', clampSavedPosition)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', clampSavedPosition)
  if (suppressClickTimer !== undefined) window.clearTimeout(suppressClickTimer)
})

function selectIdentity(target: (typeof MOCK_IDENTITIES)[number]) {
  if (target === identity.value) {
    expanded.value = false
    return
  }

  switchMockIdentity(target)
}
</script>

<template>
  <div
    v-if="available"
    ref="rootRef"
    class="mock-switch"
    :class="{ 'mock-switch--open': expanded }"
    :style="switchStyle"
  >
    <button
      ref="fabRef"
      class="mock-switch__fab"
      type="button"
      :aria-expanded="expanded"
      :title="`mock 已开启 · 当前身份：${profile.label}`"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @click="toggleExpanded"
    >
      <span class="mock-switch__dot" aria-hidden="true"></span>
      <span class="mock-switch__fab-text">MOCK</span>
      <span class="mock-switch__fab-identity">{{ profile.label }}</span>
      <span
        v-if="uncovered.length"
        class="mock-switch__badge"
        :title="`${uncovered.length} 个接口未实现`"
      >
        {{ uncovered.length }}
      </span>
    </button>

    <section v-if="expanded" class="mock-switch__panel" aria-label="mock 身份切换">
      <header class="mock-switch__head">
        <strong>mock 身份</strong>
        <button
          class="mock-switch__close"
          type="button"
          aria-label="收起"
          @click="expanded = false"
        >
          ×
        </button>
      </header>

      <p class="mock-switch__hint">切换身份会整页刷新，两个身份可以分别开在两个标签页里。</p>

      <div class="mock-switch__identities">
        <button
          v-for="item in MOCK_IDENTITIES"
          :key="item"
          class="mock-switch__identity"
          :class="{ 'mock-switch__identity--active': item === identity }"
          type="button"
          @click="selectIdentity(item)"
        >
          <strong>{{ MOCK_IDENTITY_PROFILES[item].label }}</strong>
          <small>{{ MOCK_IDENTITY_PROFILES[item].description }}</small>
        </button>
      </div>

      <div v-if="expanded" class="mock-switch__section">
        <button
          class="mock-switch__row mock-switch__row--toggle"
          type="button"
          :disabled="!uncovered.length"
          @click="showUncovered = !showUncovered"
        >
          <span>未实现的接口</span>
          <span class="mock-switch__count">{{ uncovered.length }}</span>
        </button>

        <div v-if="showUncovered && uncovered.length" class="mock-switch__list">
          <code v-for="item in uncovered" :key="item">{{ item }}</code>
        </div>

        <div class="mock-switch__actions">
          <button
            v-if="uncovered.length"
            class="mock-switch__link"
            type="button"
            @click="clearUncoveredEndpoints()"
          >
            清空清单
          </button>
          <button
            class="mock-switch__link mock-switch__link--danger"
            type="button"
            @click="disableMock()"
          >
            关闭 mock
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped src="./mock-identity-switcher.css"></style>
