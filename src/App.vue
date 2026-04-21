<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { useGlobalLoadingScreen } from '@/composables/useGlobalLoadingScreen'

type MatrixColumn = {
  id: number
  left: number
  duration: number
  delay: number
  opacity: number
  fontSize: number
  chars: string[]
}

const glyphPool = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ$#@%&*+-=<>{}[]()'

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickGlyph(): string {
  return glyphPool[randomInt(0, glyphPool.length - 1)] ?? '0'
}

function createColumn(id: number): MatrixColumn {
  const length = randomInt(24, 56)
  const chars = Array.from({ length }, () => pickGlyph())

  return {
    id,
    left: Math.random() * 98,
    duration: randomInt(8, 17),
    delay: -Math.random() * 14,
    opacity: 0.42 + Math.random() * 0.48,
    fontSize: randomInt(12, 17),
    chars,
  }
}

const matrixColumns = ref<MatrixColumn[]>([])
const auth = useAuthStore()
const routeLoadingVisible = ref(false)
const loadingDepth = ref(0)
const { isGlobalLoadingVisible } = useGlobalLoadingScreen()
const overlayVisible = computed(() => routeLoadingVisible.value || isGlobalLoadingVisible.value)

let flickerTimer: ReturnType<typeof setInterval> | null = null

function ensureColumns() {
  if (matrixColumns.value.length > 0) {
    return
  }

  matrixColumns.value = Array.from({ length: 64 }, (_, index) => createColumn(index))
}

function startFlicker() {
  if (flickerTimer) {
    return
  }

  flickerTimer = setInterval(() => {
    const columns = matrixColumns.value
    if (columns.length === 0) {
      return
    }

    const flashes = randomInt(60, 140)
    for (let i = 0; i < flashes; i += 1) {
      const columnIndex = randomInt(0, columns.length - 1)
      const column = columns[columnIndex]
      if (!column || column.chars.length === 0) {
        continue
      }

      const charIndex = randomInt(0, column.chars.length - 1)
      column.chars[charIndex] = pickGlyph()
    }
  }, 24)
}

function showOverlay() {
  ensureColumns()
  startFlicker()
}

function stopFlicker() {
  if (!flickerTimer) {
    return
  }

  clearInterval(flickerTimer)
  flickerTimer = null
}

function beginRouteLoading() {
  loadingDepth.value += 1
  routeLoadingVisible.value = true
}

function endRouteLoading() {
  loadingDepth.value = Math.max(loadingDepth.value - 1, 0)
  if (loadingDepth.value > 0) {
    return
  }

  routeLoadingVisible.value = false
}

watch(
  overlayVisible,
  (visible) => {
    if (visible) {
      showOverlay()
      return
    }

    stopFlicker()
  },
  { immediate: true },
)

onMounted(() => {
  auth.hydrate()
  void auth.initializeSession().catch(() => {
    auth.logout()
  })
})

onUnmounted(() => {
  stopFlicker()
})
</script>

<template>
  <div class="app-shell">
    <div v-if="overlayVisible" class="code-rain-bg" aria-hidden="true">
      <div v-for="column in matrixColumns" :key="column.id" class="matrix-stream" :style="{
        left: `${column.left}%`,
        animationDuration: `${column.duration}s`,
        animationDelay: `${column.delay}s`,
        opacity: column.opacity,
        fontSize: `${column.fontSize}px`,
      }">
        <span v-for="(char, charIndex) in column.chars" :key="`${column.id}-${charIndex}`" class="matrix-char">{{ char
          }}</span>
      </div>
    </div>
    <div class="app-content">
      <el-scrollbar class="app-scrollbar">
        <div class="app-scrollbar__view">
          <RouterView v-slot="{ Component }">
            <Suspense @pending="beginRouteLoading" @resolve="endRouteLoading">
              <component :is="Component" />
            </Suspense>
          </RouterView>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  height: 100vh;
  overflow: hidden;
}

.app-content {
  position: relative;
  z-index: 2;
  height: 100vh;
}

.app-scrollbar {
  height: 100%;
}

.app-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.app-scrollbar :deep(.el-scrollbar__view) {
  min-height: 100%;
}

.app-scrollbar__view {
  min-height: 100vh;
}

.app-scrollbar :deep(.el-scrollbar__bar.is-vertical) {
  width: 6px;
  right: 2px;
}

.app-scrollbar :deep(.el-scrollbar__thumb) {
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.88), rgba(149, 213, 178, 0.92));
}

.app-scrollbar :deep(.el-scrollbar__thumb:hover) {
  background: linear-gradient(180deg, rgba(125, 211, 252, 0.96), rgba(149, 213, 178, 1));
}

@media (max-width: 780px) {

  .app-shell,
  .app-content {
    height: auto;
    min-height: 100vh;
  }

  .app-scrollbar :deep(.el-scrollbar__wrap) {
    overflow: visible;
  }

  .app-scrollbar :deep(.el-scrollbar__bar) {
    display: none;
  }

  .app-scrollbar__view {
    min-height: 100vh;
  }
}
</style>
