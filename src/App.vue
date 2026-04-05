<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

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

let flickerTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
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
      <div
        v-for="column in matrixColumns"
        :key="column.id"
        class="matrix-stream"
        :style="{
          left: `${column.left}%`,
          animationDuration: `${column.duration}s`,
          animationDelay: `${column.delay}s`,
          opacity: column.opacity,
          fontSize: `${column.fontSize}px`,
        }"
      >
        <span
          v-for="(char, charIndex) in column.chars"
          :key="`${column.id}-${charIndex}`"
          class="matrix-char"
          >{{ char }}</span
        >
      </div>
    </div>
    <div class="app-content">
      <RouterView />
    </div>
  </div>
</template>

<style>
:root {
  --bg-deep: #07223a;
  --bg-mid: #0e3b5d;
  --bg-soft: #1f6d7f;
  --card-bg: rgba(255, 255, 255, 0.12);
  --card-border: rgba(255, 255, 255, 0.24);
  --text-main: #f3fcff;
  --text-sub: #cbe7ee;
  --accent: #ffd166;
  --success: #95d5b2;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: 'Space Grotesk', 'Noto Sans SC', 'PingFang SC', sans-serif;
  color: var(--text-main);
  background:
    radial-gradient(circle at 12% 15%, rgba(255, 209, 102, 0.16), transparent 32%),
    radial-gradient(circle at 88% 72%, rgba(149, 213, 178, 0.2), transparent 38%),
    linear-gradient(145deg, var(--bg-deep), var(--bg-mid) 44%, var(--bg-soft));
  min-height: 100vh;
}

#app,
.app-shell {
  min-height: 100vh;
}

.app-shell {
  position: relative;
  isolation: isolate;
}

.app-content {
  position: relative;
  z-index: 2;
}

.code-rain-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  padding: 0;
  overflow: hidden;
  pointer-events: none;
  opacity: 0.8;
}

.matrix-stream {
  position: absolute;
  top: -130%;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  line-height: 1.08;
  color: #8bffc0;
  animation-name: rain-fall;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform;
  text-shadow: 0 0 10px rgba(101, 255, 182, 0.34);
}

.matrix-char {
  margin: 0;
  user-select: none;
}

.matrix-char:first-child {
  color: #ecfff4;
  text-shadow: 0 0 16px rgba(186, 255, 224, 0.8);
}

@keyframes rain-fall {
  0% {
    transform: translateY(0);
  }

  100% {
    transform: translateY(260vh);
  }
}

@media (max-width: 780px) {
  .code-rain-bg {
    opacity: 0.66;
  }

  .matrix-stream {
    line-height: 1.04;
  }
}
</style>
