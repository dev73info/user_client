<script setup lang="ts">
/**
 * 全局资源下载进度浮层：切换路由不中断下载，浮层持续展示进度。
 *
 * 从 `App.vue` 拆出，模板与样式逐节点搬移；进度读数仍取 `stores/download`。
 */
import { useDownloadStore } from '@/stores/download'

const downloadStore = useDownloadStore()
</script>

<template>
  <Transition name="download-pop">
    <div
      v-if="downloadStore.state.active"
      class="global-download-card"
      role="status"
      aria-live="polite"
    >
      <div class="global-download-card__body">
        <div class="global-download-card__row">
          <span class="global-download-card__file">{{ downloadStore.state.fileName }}</span>
          <span class="global-download-card__pct">{{ downloadStore.state.percent }}%</span>
        </div>
        <div class="global-download-card__track">
          <div
            class="global-download-card__bar"
            :style="{ width: `${downloadStore.state.percent}%` }"
          ></div>
        </div>
        <div class="global-download-card__meta">
          <span v-if="downloadStore.loadedBytes > 0">
            {{ downloadStore.formatBytes(downloadStore.loadedBytes) }}
            <template v-if="downloadStore.totalBytes > 0">
              / {{ downloadStore.formatBytes(downloadStore.totalBytes) }}
            </template>
          </span>
          <span v-else>正在下载…</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped src="./app-download-card.css"></style>
