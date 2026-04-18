<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import { useAuthStore } from '@/stores/auth'

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

const matrixColumns = ref(Array.from({ length: 64 }, (_, index) => createColumn(index)))
const auth = useAuthStore()

let flickerTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  auth.hydrate()
  void auth.initializeSession().catch(() => {
    auth.logout()
  })

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
})

onUnmounted(() => {
  if (flickerTimer) {
    clearInterval(flickerTimer)
  }
})
</script>

<template>
  <div class="app-shell">
    <div class="code-rain-bg" aria-hidden="true">
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
      <RouterView />
    </div>
  </div>
</template>
