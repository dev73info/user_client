<script setup lang="ts">
import { ArrowRight, TIcon } from 'ui_73info'

import type { PortalQuickPanel } from '@/shared/home/portalSections'

/**
 * 门户首页两张快捷卡（免费资源 / 需求大厅）（R047 从 `views/HomeView.vue` 拆出）。
 *
 * 纯展示组件：两个图标是内联 SVG（`tone` 决定用哪一套），点击与回车 / 空格都只回抛
 * `open(panel)`，跳到哪个路由由视图决定。样式仍在全局 `styles/home.css`
 * （`.portal-quick-*` / `.portal-inline-action`），本组件不带 `<style>`。
 */
withDefaults(defineProps<{ panels: readonly PortalQuickPanel[] }>(), { panels: () => [] })

const emit = defineEmits<{ (e: 'open', panel: PortalQuickPanel): void }>()
</script>

<template>
  <section class="portal-quick-grid">
    <article
      v-for="panel in panels"
      :key="panel.title"
      class="portal-quick-card"
      :class="`portal-quick-card--${panel.tone}`"
      role="button"
      tabindex="0"
      @click="emit('open', panel)"
      @keydown.enter="emit('open', panel)"
      @keydown.space.prevent="emit('open', panel)"
    >
      <div class="portal-quick-card__icon" aria-hidden="true">
        <svg
          v-if="panel.tone === 'gift'"
          class="portal-quick-card__svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          focusable="false"
        >
          <path d="m7.5 4.27 9 5.15" />
          <path
            d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"
          />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
        <svg
          v-else
          class="portal-quick-card__svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          focusable="false"
        >
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </svg>
      </div>
      <div class="portal-quick-card__copy">
        <h3>{{ panel.title }}</h3>
        <p>{{ panel.summary }}</p>
      </div>
      <span class="portal-inline-action">
        {{ panel.action }}
        <TIcon>
          <ArrowRight />
        </TIcon>
      </span>
    </article>
  </section>
</template>
