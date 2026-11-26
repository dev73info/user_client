<script setup lang="ts">
import { ref } from 'vue'

import type { UserBadge } from '@/api/invite'
import type { DeveloperRank } from '@/shared/home/portalRanks'

/**
 * 首页侧栏「开发者贡献榜」卡片：前 5 名开发者 + 页脚合计。
 *
 * 只吃 props：榜单聚合在 `composables/usePortalRanks.ts`（资源由视图传入，不在这里请求）。
 * 两处跟渲染强相关的状态留在组件内：
 * - 头像加载失败的 URL 集合（失败后回落首字母，避免碎图）；
 * - 名次修饰类 `portal-contrib-item--rank-${index+1}` 与用户名渐变色 class 都挂在行内元素上，
 *   跟着行一起走，父容器没有额外条件 class，不会出现 CSS 静默失配。
 *
 * 样式仍在全局 `styles/home.css`（`.portal-contrib-*`），本组件不带 `<style>`。
 */
const props = withDefaults(
  defineProps<{
    ranks: DeveloperRank[]
    /** 入榜开发者名下资源数之和（页脚「本周 N 个资源」） */
    totalResources: number
    /** 已佩戴徽章：按用户名索引，由视图统一拉取后传入。 */
    badgesByUsername?: Record<string, UserBadge[]>
  }>(),
  {
    badgesByUsername: () => ({}),
  },
)

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

/** 信用分配色：≥100 绿色，<100 黄色（警示）；缺值保持中性色。 */
function creditClass(rank: DeveloperRank) {
  if (rank.creditScore == null) return ''
  return rank.creditScore >= 100 ? 'is-good' : 'is-warning'
}

function badgesFor(rank: DeveloperRank): UserBadge[] {
  return rank.username ? (props.badgesByUsername[rank.username] ?? []) : []
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
      <span v-if="ranks.length" class="portal-card__chip">本月 TOP {{ ranks.length }}</span>
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
        <span class="portal-contrib-item__avatar">
          <img
            v-if="avatarSrc(developer)"
            :src="avatarSrc(developer)"
            :alt="`${developer.name} 的头像`"
            @error="handleAvatarError(developer)"
          />
          <span v-else>{{ developer.name.slice(0, 1) }}</span>
          <span
            v-if="index < 3"
            class="portal-contrib-item__medal"
            :class="`is-rank-${index + 1}`"
            aria-hidden="true"
          >
            <svg viewBox="0 0 12 12" focusable="false">
              <path
                d="M6 1.2 7.35 4l3.05.44-2.2 2.15.52 3.04L6 8.2l-2.72 1.43.52-3.04L1.6 4.44 4.65 4 6 1.2Z"
              />
            </svg>
          </span>
        </span>
        <div class="portal-contrib-item__meta">
          <div class="portal-contrib-item__identity">
            <div class="portal-contrib-item__name-row">
              <strong
                :class="{ 'username-gradient': developer.gradient && !developer.userColor }"
                :style="developer.userColor ? { color: developer.userColor } : {}"
                >{{ developer.name }}</strong
              >
              <span class="portal-contrib-item__badge">贡献 {{ developer.resourceCount }}</span>
            </div>
            <div v-if="badgesFor(developer).length" class="portal-contrib-item__badges">
              <span
                v-for="badge in badgesFor(developer)"
                :key="badge.code"
                class="portal-contrib-item__user-badge"
                role="img"
                tabindex="0"
                :aria-label="`${badge.name}：${badge.description}`"
              >
                <img
                  v-if="badge.icon.startsWith('badges/')"
                  :src="`/uploads/${badge.icon}`"
                  alt=""
                />
                <span v-else class="portal-contrib-item__user-badge-icon" aria-hidden="true">{{
                  badge.icon
                }}</span>
                <span class="portal-contrib-item__user-badge-tooltip" aria-hidden="true">
                  <strong>{{ badge.name }}</strong>
                  <span>{{ badge.description }}</span>
                </span>
              </span>
            </div>
          </div>
        </div>
        <div class="portal-contrib-item__side">
          <strong class="portal-contrib-item__count" :class="creditClass(developer)">
            信用：{{ developer.creditScore ?? '—' }}
          </strong>
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
