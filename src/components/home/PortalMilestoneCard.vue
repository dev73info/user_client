<script setup lang="ts">
import type { Component } from 'vue'
import { Files, Finished, Money, User } from 'ui_73info'

import {
  progressPercent,
  type MilestoneStatIcon,
  type PortalMilestoneStat,
} from '@/shared/home/portalDisplay'

/**
 * 首页侧栏「内测里程碑」卡片：入驻 CTA + 四张统计卡（前两张带冷启动进度条）。
 *
 * 统计卡的内容全部由 `shared/home/portalDisplay.ts#buildMilestoneStats` 算好，
 * 纯函数层只给图标 key（`developers` / `resources` / `orders` / `escrow`），
 * 这里映射到 `ui_73info` 的图标组件——纯函数因此不必拖组件引用，日志与单测都好写。
 *
 * 样式仍在全局 `styles/home.css`（`.portal-milestone__*`、`.portal-stat-item*`），本组件不带 `<style>`。
 */
defineProps<{
  stats: PortalMilestoneStat[]
  /** 开发者账号的 CTA 是「发布资源」，普通用户是「立即入驻」 */
  isDeveloperAccount: boolean
}>()

const emit = defineEmits<{ (e: 'open-resource-init'): void }>()

/** 统计卡图标：与 `buildMilestoneStats` 的 `icon` 字段一一对应。 */
const statIcons: Record<MilestoneStatIcon, Component> = {
  developers: User,
  resources: Files,
  orders: Finished,
  escrow: Money,
}
</script>

<template>
  <section id="portal-developers" class="portal-card portal-card--stats">
    <div class="portal-card__header portal-card__header--stats">
      <div class="portal-card__title portal-card__title--stats">
        <span class="portal-stats-head__icon" aria-hidden="true">◉</span>
        <h2>内测里程碑</h2>
      </div>
    </div>
    <div class="portal-milestone__intro">
      <button class="portal-milestone__cta" type="button" @click="emit('open-resource-init')">
        {{ isDeveloperAccount ? '发布资源 →' : '立即入驻 →' }}
      </button>
    </div>
    <div class="portal-stats-grid">
      <article
        v-for="(stat, index) in stats"
        :key="stat.label"
        class="portal-stat-item"
        :class="`portal-stat-item--tone-${index % 4}`"
        :style="{ '--stat-index': String(index) }"
      >
        <span class="portal-stat-item__icon" aria-hidden="true">
          <component :is="statIcons[stat.icon]" />
        </span>
        <div class="portal-stat-item__copy">
          <div class="portal-stat-item__label">
            <span>{{ stat.label }}</span>
            <span v-if="stat.progress" class="portal-stat-item__target">目标</span>
          </div>
          <strong>{{ stat.value }}</strong>
          <span v-if="stat.note" class="portal-stat-item__note">{{ stat.note }}</span>
          <div v-if="stat.progress" class="portal-stat-item__progress">
            <span
              class="portal-stat-item__progress-bar"
              :style="{ width: progressPercent(stat.progress) }"
            ></span>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
