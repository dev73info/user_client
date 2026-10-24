<script setup lang="ts">
import { ref } from 'vue'

import type { TeamRank } from '@/shared/home/portalRanks'

/**
 * 首页侧栏「活跃团队」卡片：按团队聚合的公开资源数前 4 名。
 *
 * 只吃 props + emit：聚合在 `composables/usePortalRanks.ts`，资源由视图传入同一份，
 * 不在这里另起数据源。可见性（无团队时整卡不渲染）由视图的 `v-if` 控制。
 *
 * 头像失败的兜底跟着组件走：失败过的 URL 记在本组件的集合里，模板回落到团队名首字母。
 * 样式仍在全局 `styles/home.css`（`.portal-rank-item*`），本组件不带 `<style>`。
 */
defineProps<{ ranks: TeamRank[] }>()

const emit = defineEmits<{ (e: 'open-team', teamId: number): void }>()

const failedAvatarUrls = ref<Set<string>>(new Set())

function handleAvatarError(team: TeamRank) {
  if (!team.avatarUrl) return

  const next = new Set(failedAvatarUrls.value)
  next.add(team.avatarUrl)
  failedAvatarUrls.value = next
}

/** 失败过的头像给空串，模板据此回落到首字母。 */
function avatarSrc(team: TeamRank): string {
  return failedAvatarUrls.value.has(team.avatarUrl) ? '' : team.avatarUrl
}
</script>

<template>
  <section class="portal-card portal-card--team">
    <div class="portal-card__header">
      <div class="portal-card__title portal-card__title--team">
        <span class="portal-card-title-icon portal-card-title-icon--team" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </span>
        <h2>活跃团队</h2>
      </div>
    </div>
    <ul class="portal-rank-list">
      <li
        v-for="(team, index) in ranks"
        :key="team.teamId"
        class="portal-rank-item"
        :style="{ '--rank-index': String(index) }"
        @click="emit('open-team', team.teamId)"
      >
        <div class="portal-rank-item__avatar">
          <img
            v-if="avatarSrc(team)"
            :src="avatarSrc(team)"
            :alt="`${team.teamName} 的头像`"
            @error="handleAvatarError(team)"
          />
          <span v-else>{{ team.teamName.slice(0, 1) }}</span>
        </div>
        <div class="portal-rank-item__meta">
          <strong>{{ team.teamName }}</strong>
        </div>
        <div class="portal-rank-item__score">
          <strong>{{ team.resourceCount }} 个资源</strong>
        </div>
      </li>
    </ul>
  </section>
</template>
