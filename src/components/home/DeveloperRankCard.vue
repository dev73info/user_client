<script setup lang="ts">
import { ref } from 'vue'

import type { DeveloperRank, PortalDeveloperBadge } from '@/shared/home/portalRanks'

/**
 * 首页侧栏「开发者贡献榜」卡片：前 4 名开发者 + 已装备徽章 + 页脚合计。
 *
 * 只吃 props：榜单聚合在 `composables/usePortalRanks.ts`（资源由视图传入，不在这里请求）。
 * 两处跟渲染强相关的状态留在组件内：
 * - 头像加载失败的 URL 集合（失败后回落首字母，避免碎图）；
 * - 名次修饰类 `portal-contrib-item--rank-${index+1}` 与用户名渐变色 class 都挂在行内元素上，
 *   跟着行一起走，父容器没有额外条件 class，不会出现 CSS 静默失配。
 *
 * 样式仍在全局 `styles/home.css`（`.portal-contrib-*`），本组件不带 `<style>`。
 */
const props = defineProps<{
  ranks: DeveloperRank[]
  /** 用户名 → 已装备徽章（`usePortalRanks` 取好） */
  badges: Record<string, PortalDeveloperBadge[]>
  /** 入榜开发者名下资源数之和（页脚「本周 N 个资源」） */
  totalResources: number
}>()

const emit = defineEmits<{ (e: 'open-developer', username: string): void }>()

const failedAvatarUrls = ref<Set<string>>(new Set())

function handleAvatarError(rank: DeveloperRank) {
  if (!rank.avatarUrl) return

  const next = new Set(failedAvatarUrls.value)
  next.add(rank.avatarUrl)
  failedAvatarUrls.value = next
}

/** 失败过的头像给空串，模板据此回落到首字母。 */
function avatarSrc(rank: DeveloperRank): string {
  return failedAvatarUrls.value.has(rank.avatarUrl) ? '' : rank.avatarUrl
}

function badgesOf(username: string): PortalDeveloperBadge[] {
  return props.badges[username] ?? []
}
</script>

<template>
  <section class="portal-card portal-card--rank portal-contrib">
    <div class="portal-card__header portal-contrib__header">
      <div class="portal-card__title portal-card__title--rank">
        <span class="portal-card-title-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="8" r="6" />
            <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
          </svg>
        </span>
        <h2>开发者贡献榜</h2>
      </div>
    </div>
    <ol v-if="ranks.length > 0" class="portal-contrib-list">
      <li
        v-for="(developer, index) in ranks"
        :key="developer.username"
        class="portal-contrib-item"
        :class="`portal-contrib-item--rank-${index + 1}`"
        :style="{ '--rank-index': String(index) }"
        @click="emit('open-developer', developer.username)"
      >
        <span class="portal-contrib-item__rank">{{ index + 1 }}</span>
        <span class="portal-contrib-item__avatar">
          <img
            v-if="avatarSrc(developer)"
            :src="avatarSrc(developer)"
            :alt="`${developer.name} 的头像`"
            @error="handleAvatarError(developer)"
          />
          <span v-else>{{ developer.name.slice(0, 1) }}</span>
        </span>
        <div class="portal-contrib-item__meta">
          <strong
            :class="{ 'username-gradient': developer.gradient && !developer.userColor }"
            :style="developer.userColor ? { color: developer.userColor } : {}"
            >{{ developer.name }}</strong
          >
          <div v-if="badgesOf(developer.username).length > 0" class="portal-contrib-item__badges">
            <span
              v-for="badge in badgesOf(developer.username).slice(0, 3)"
              :key="badge.code"
              class="portal-contrib-item__badge"
              :title="`${badge.name}：${badge.description}`"
            >
              <img
                v-if="badge.icon.startsWith('badges/')"
                :src="`/uploads/${badge.icon}`"
                class="portal-contrib-item__badge-img"
                alt=""
              />
              <template v-else>{{ badge.icon }}</template>
            </span>
            <span
              v-if="badgesOf(developer.username).length > 3"
              class="portal-contrib-item__badge-more"
            >
              +{{ badgesOf(developer.username).length - 3 }}
            </span>
          </div>
        </div>
        <div class="portal-contrib-item__side">
          <strong class="portal-contrib-item__count">{{ developer.resourceCount }} 个资源</strong>
        </div>
      </li>
    </ol>
    <div v-else class="portal-empty-state portal-empty-state--compact">
      <strong>暂无公开开发者</strong>
    </div>
    <div v-if="ranks.length > 0" class="portal-contrib-footer">
      本周
      <strong>{{ totalResources }}</strong>
      个资源 ·
      <strong>{{ ranks.length }}</strong>
      位开发者
    </div>
  </section>
</template>
