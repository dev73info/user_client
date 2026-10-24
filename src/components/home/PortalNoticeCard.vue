<script setup lang="ts">
import type { PortalNotice } from '@/shared/home/portalDisplay'

/**
 * 首页侧栏「平台公告」卡片：公告 3 条 + 最新成交 / 公开资源 / 需求公告各最多 1 条（共 4 条）。
 *
 * 取数与截断在 `shared/home/portalDisplay.ts#buildPortalNotices`，这里只做渲染：
 * 每条公告的跳转目标（`notice.to`）由纯函数算好，组件只按有没有目标决定可点击样式并回抛事件。
 * 样式仍在全局 `styles/home.css`（`.portal-notice-*`），本组件不带 `<style>`。
 */
withDefaults(defineProps<{ notices: PortalNotice[] }>(), { notices: () => [] })

const emit = defineEmits<{
  (e: 'open-notice', notice: PortalNotice): void
  (e: 'more'): void
}>()
</script>

<template>
  <section class="portal-card portal-card--notice">
    <div class="portal-card__header portal-card__header--notice">
      <div class="portal-card__title portal-card__title--notice">
        <span class="portal-notice-head__icon" aria-hidden="true">◔</span>
        <h2>平台公告</h2>
      </div>
      <button class="portal-link-btn portal-link-btn--notice" type="button" @click="emit('more')">
        更多
        <span aria-hidden="true">›</span>
      </button>
    </div>
    <ul class="portal-notice-list">
      <li
        v-for="(notice, index) in notices"
        :key="`${notice.title}-${notice.date}`"
        class="portal-notice-item"
        :class="{ 'portal-notice-item--clickable': notice.to }"
        :role="notice.to ? 'button' : undefined"
        :tabindex="notice.to ? 0 : undefined"
        :style="{ '--notice-index': String(index) }"
        @click="emit('open-notice', notice)"
        @keydown.enter="emit('open-notice', notice)"
        @keydown.space.prevent="emit('open-notice', notice)"
      >
        <div class="portal-notice-item__main">
          <strong>{{ notice.title }}</strong>
          <span v-if="notice.tag" class="portal-tag">{{ notice.tag }}</span>
        </div>
        <time>{{ notice.date }}</time>
      </li>
    </ul>
  </section>
</template>
