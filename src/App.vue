<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { useGlobalLoadingScreen } from '@/composables/useGlobalLoadingScreen'
import BetaNoticeModal from '@/components/BetaNoticeModal.vue'

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
const currentYear = new Date().getFullYear()
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
    <BetaNoticeModal />
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
        <div class="app-view-container">
          <RouterView v-slot="{ Component }">
            <Suspense @pending="beginRouteLoading" @resolve="endRouteLoading">
              <component :is="Component" />
            </Suspense>
          </RouterView>

          <div class="site-footer-host">
            <footer class="site-footer" aria-label="网站基础信息">
              <div class="site-footer-grid">
                <div class="site-footer-block">
                  <h3>网站信息</h3>
                  <p>平台名称：柒叁信息（73info）</p>
                  <p>主体类型：企业服务平台（备案办理中）</p>
                  <p>联系邮箱：fanbo@73info.cn</p>
                  <p>联系地址：上海市浦东新区（示例，待替换）</p>
                </div>
                <div class="site-footer-block">
                  <h3>备案与合规</h3>
                  <p>
                    ICP备案号：
                    <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">滇ICP备2026006119号</a>
                  </p>
                  <p>公安备案号：备案申请中</p>
                  <p>增值电信业务许可：按业务开展后补充</p>
                </div>
                <div class="site-footer-block">
                  <h3>服务说明</h3>
                  <p><router-link to="/terms">用户协议</router-link></p>
                  <p><router-link to="/privacy">隐私政策</router-link></p>
                  <p><router-link to="/payment-refund">支付与退款说明</router-link></p>
                </div>
              </div>
              <p class="site-footer-copy">© {{ currentYear }} 柒叁信息 73Info. All rights reserved.</p>
            </footer>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  height: auto;
  overflow: visible;
}

.app-content {
  position: relative;
  z-index: 2;
  min-height: 100vh;
}

.app-scrollbar {
  height: 100vh;
}

.app-view-container {
  padding: 0 0 22px;
}

.site-footer-host {
  width: min(1050px, calc(100% - 48px));
  margin: 0 auto;
}

@media (max-width: 780px) {

  .app-shell,
  .app-content {
    min-height: 100vh;
    height: auto;
  }

  .site-footer-host {
    width: calc(100% - 20px);
  }
}
</style>

<style>
html {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

html::-webkit-scrollbar {
  width: 4px;
}

html::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

html::-webkit-scrollbar-track {
  background: transparent;
}

html::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.22);
  border-radius: 999px;
}

html::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.42);
}

@media (max-width: 780px) {
  html::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
}

/* el-scrollbar 滑块样式 */
.app-scrollbar .el-scrollbar__bar.is-vertical .el-scrollbar__thumb {
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.7), rgba(149, 213, 178, 0.8));
  border-radius: 999px;
}

.app-scrollbar .el-scrollbar__bar.is-vertical .el-scrollbar__thumb:hover {
  background: linear-gradient(180deg, rgba(125, 211, 252, 0.9), rgba(149, 213, 178, 1));
}

.app-scrollbar .el-scrollbar__bar.is-vertical {
  width: 8px;
  right: 0;
}
</style>
