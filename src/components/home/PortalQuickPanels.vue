<script setup lang="ts">
import { ArrowRight, TIcon } from 'ui_73info'

import type { PortalQuickPanel } from '@/shared/home/portalSections'

/**
 * 门户首页两张快捷卡（免费资源 / 社区交流）（R047 从 `views/HomeView.vue` 拆出）。
 *
 * 纯展示组件：两个大图标是内联 SVG（`tone` 决定用哪一套），点击与回车 / 空格都只回抛
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
          viewBox="0 0 96 96"
          focusable="false"
        >
          <defs>
            <linearGradient id="quickGiftRed" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stop-color="#ff8c5a" />
              <stop offset="100%" stop-color="#ef3f5f" />
            </linearGradient>
            <linearGradient id="quickGiftYellow" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stop-color="#ffd75f" />
              <stop offset="100%" stop-color="#ff9f1c" />
            </linearGradient>
            <filter id="quickIconShadow" x="-30%" y="-20%" width="160%" height="160%">
              <feDropShadow
                dx="0"
                dy="9"
                stdDeviation="7"
                flood-color="#ef4444"
                flood-opacity="0.22"
              />
            </filter>
          </defs>
          <g filter="url(#quickIconShadow)">
            <path fill="url(#quickGiftRed)" d="M17 38h62v39a7 7 0 0 1-7 7H24a7 7 0 0 1-7-7V38Z" />
            <path fill="#d9274a" d="M17 38h62v16H17z" opacity="0.45" />
            <path fill="url(#quickGiftYellow)" d="M43 38h10v46H43zM12 28h72v16H12z" />
            <path
              fill="url(#quickGiftRed)"
              d="M24 14c10-5 20 8 24 17-12 2-27 1-30-6-2-4 1-8 6-11Zm48 0c-10-5-20 8-24 17 12 2 27 1 30-6 2-4-1-8-6-11Z"
            />
            <path fill="url(#quickGiftYellow)" d="M42 20h12l-6 18-6-18Z" />
          </g>
        </svg>
        <svg v-else class="portal-quick-card__svg" viewBox="0 0 96 96" focusable="false">
          <defs>
            <linearGradient id="quickCaseOrange" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stop-color="#ffb15c" />
              <stop offset="100%" stop-color="#f97316" />
            </linearGradient>
            <filter id="quickCaseShadow" x="-30%" y="-20%" width="160%" height="160%">
              <feDropShadow
                dx="0"
                dy="9"
                stdDeviation="7"
                flood-color="#f97316"
                flood-opacity="0.2"
              />
            </filter>
          </defs>
          <g filter="url(#quickCaseShadow)">
            <path
              fill="url(#quickCaseOrange)"
              d="M20 30a12 12 0 0 1 12-12h32a12 12 0 0 1 12 12v22a12 12 0 0 1-12 12H44l-14 10v-10h-6a12 12 0 0 1-4-23z"
            />
            <circle cx="36" cy="44" r="4" fill="#fff7ed" />
            <circle cx="48" cy="44" r="4" fill="#fff7ed" />
            <circle cx="60" cy="44" r="4" fill="#fff7ed" />
          </g>
        </svg>
      </div>
      <div class="portal-quick-card__copy">
        <h3>{{ panel.title }}</h3>
        <p>{{ panel.summary }}</p>
        <span class="portal-inline-action">
          {{ panel.action }}
          <TIcon>
            <ArrowRight />
          </TIcon>
        </span>
      </div>
    </article>
  </section>
</template>
