<script setup lang="ts">
import type { PublicMcResourceItem } from '@/api/resources'
import { formatCnDateTime as formatTimeLabel } from '@/shared/requirementDisplay'
import {
  resourceCoverUrl,
  resourceDescription,
  resourceInitials,
  resourcePlatformLabel,
  resourceTags,
} from '@/shared/searchResults'

/**
 * 搜索结果里的一张资源卡片（封面 / 平台与更新时间 / 标题与简介 / 三枚标签 / 作者与赞数）。
 *
 * 卡片只负责摆版面：可搜索文本、副标题与标签的取值口径全在 `shared/searchResults.ts`，
 * 落点（页内详情态）由页面经 `@open` 转给 `useSearchResultNavigation`——本组件不认识路由。
 * 视觉规则在 `styles/portal-search.css`（三支卡片共用一个基座）。
 */
defineProps<{ resource: PublicMcResourceItem }>()
const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <article
    class="portal-page__card portal-search-result-card portal-search-result-card--resource"
    role="button"
    tabindex="0"
    @click="emit('open')"
    @keydown.enter="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <div class="portal-search-result-card__cover">
      <img
        v-if="resourceCoverUrl(resource)"
        :src="resourceCoverUrl(resource)"
        :alt="`${resource.title} 封面`"
      />
      <span v-else>{{ resourceInitials(resource) }}</span>
    </div>
    <div class="portal-search-result-card__body">
      <div class="portal-page__card-topline">
        <span class="portal-page__chip">{{ resourcePlatformLabel(resource) || '资源' }}</span>
        <span class="portal-page__meta">{{ formatTimeLabel(resource.updated_at) }}</span>
      </div>
      <h3>{{ resource.title }}</h3>
      <p>{{ resourceDescription(resource) }}</p>
      <div class="portal-search-result-card__tags">
        <span v-for="tag in resourceTags(resource)" :key="`${resource.id}-${tag}`">{{ tag }}</span>
      </div>
      <div class="portal-page__card-footer">
        <strong>{{ resource.creator || resource.author }}</strong>
        <span>{{ resource.like_count }} 赞</span>
      </div>
    </div>
  </article>
</template>
