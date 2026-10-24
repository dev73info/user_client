<script setup lang="ts">
/**
 * 顶部读数条：四格口径读数 + 右侧「全屏 / 刷新」两个动作；平板档整条被 `WorkbenchBarSlot`
 * 搬进工作台顶栏顶替标题，全屏时留在原地（`disabled` 传 true，看板上读数与退出按钮都得看得见）。
 *
 * 从 `views/DevHomeView.vue` 抽出来。读数、时钟与状态灯的**数值**仍由视图给：四格分档读
 * 接单状态与全屏快照（`statCards`），时钟每秒推进（`useFullscreen`），状态灯看 WebSocket 连接
 * （`useDevDashboardSocket`）——这些口径离开视图就会有两份。组件只画，两个动作 `emit` 出去。
 */
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { Refresh, TButton, TIcon, TLoading } from 'ui_73info'

import type { DevHomeStatCard } from '@/shared/devHomeDisplay'

defineProps<{
  /** 加载中：读数区出骨架，刷新按钮转圈。 */
  loading: boolean
  /** 关掉顶栏搬运、始终原地渲染：全屏看板时读数必须留在全屏区域里。 */
  disabled: boolean
  isFullscreen: boolean
  fullscreenSupported: boolean
  /** 看板时钟：时分秒 + 月日星期，由视图按 `useFullscreen` 的 `now` 算好。 */
  clockTime: string
  clockDate: string
  /** 状态灯：青 / 金 / 灰三档，文案与色调都由视图按连接状态定。 */
  lamp: { tone: 'ok' | 'warn' | 'off'; label: string }
  /** 「更新于 …」里的时间与它 `title` 上的完整快照时间（都没有时是 `—` / 空串）。 */
  updatedText: string
  updatedTitle: string
  /** 四格读数：标签 + 已格式化好的数字。 */
  cards: DevHomeStatCard[]
}>()

const emit = defineEmits<{
  toggle: []
  refresh: []
}>()
</script>

<template>
  <WorkbenchBarSlot :disabled="disabled">
    <TLoading tag="div" class="dev-meta-strip" aria-label="接单与收入概览" :loading="loading">
      <template v-if="isFullscreen">
        <strong class="dev-home__screen-title">工作台总览</strong>
        <!-- 看板挂在平板上常亮：时钟每秒走，状态灯与最后更新时间说明这块屏上的数字是不是活的 -->
        <div class="dev-home__clock" aria-label="当前时间">
          <span class="dev-home__clock-time">{{ clockTime }}</span>
          <span class="dev-home__clock-date">{{ clockDate }}</span>
        </div>
        <div class="dev-home__live-state">
          <span
            class="dev-home__lamp"
            :class="`dev-home__lamp--${lamp.tone}`"
            role="status"
            aria-live="polite"
          >
            <i class="dev-home__lamp-dot" aria-hidden="true" />
            {{ lamp.label }}
          </span>
          <span class="dev-home__updated" :title="updatedTitle">更新于 {{ updatedText }}</span>
        </div>
        <div class="dev-meta-strip__divider dev-home__live-divider" />
      </template>
      <template v-for="(item, index) in cards" :key="item.label">
        <div v-if="index > 0" class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">{{ item.label }}</span>
          <span class="dev-meta-strip__value">{{ item.value }}</span>
        </div>
      </template>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <TButton
          v-if="fullscreenSupported"
          icon-only
          :aria-label="isFullscreen ? '退出全屏' : '全屏查看'"
          :title="isFullscreen ? '退出全屏' : '全屏查看'"
          @click="emit('toggle')"
        >
          <TIcon>
            <svg
              v-if="isFullscreen"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </TIcon>
        </TButton>
        <TButton icon-only :loading="loading" aria-label="刷新概览" @click="emit('refresh')">
          <TIcon>
            <Refresh />
          </TIcon>
        </TButton>
      </div>
    </TLoading>
  </WorkbenchBarSlot>
</template>

<style scoped>
/* 读数条的静态形态（横条、四格、动作槽）在统一层 dev-base.css / dev-responsive.css 里；
   这里只放看板专用的几块：标题、时钟、状态灯。全屏与 900 档的覆盖留在视图的媒体块里——
   `.dev-home--fullscreen` 挂在视图根节点上，且那些规则要用 `:deep()` 才打得到这里。 */
.dev-home__screen-title {
  margin-right: 8px;
  color: var(--dev-ink);
  font-size: 16px;
  font-weight: 800;
  white-space: nowrap;
}

.dev-home__clock {
  display: grid;
  gap: 1px;
}

.dev-home__clock-time {
  color: var(--dev-ink);
  font-size: 24px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}

.dev-home__clock-date,
.dev-home__updated {
  color: var(--dev-muted);
  font-size: 12px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.dev-home__live-state {
  display: grid;
  gap: 3px;
}

.dev-home__lamp {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dev-ink-soft);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.dev-home__lamp-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--dev-muted);
}

.dev-home__lamp--ok {
  color: var(--dev-cyan);
}

.dev-home__lamp--ok .dev-home__lamp-dot {
  background: var(--dev-cyan);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--dev-cyan) 45%, transparent);
  animation: dev-home-lamp-pulse 2s ease-out infinite;
}

.dev-home__lamp--warn {
  color: var(--dev-gold);
}

.dev-home__lamp--warn .dev-home__lamp-dot {
  background: var(--dev-gold);
  animation: dev-home-lamp-blink 1s ease-in-out infinite;
}

.dev-home__lamp--off {
  color: var(--dev-muted);
}

@keyframes dev-home-lamp-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--dev-cyan) 45%, transparent);
  }
  70%,
  100% {
    box-shadow: 0 0 0 7px transparent;
  }
}

@keyframes dev-home-lamp-blink {
  50% {
    opacity: 0.35;
  }
}

/* 减弱动效时状态灯不再呼吸 / 闪烁：常亮也能表达「已连接 / 重连中」 */
@media (prefers-reduced-motion: reduce) {
  .dev-home__lamp-dot {
    animation: none;
  }
}
</style>
