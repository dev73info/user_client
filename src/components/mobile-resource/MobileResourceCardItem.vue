<script setup lang="ts">
import { computed } from 'vue'
import { TTooltip } from 'ui_73info'

import BetaTag from '@/components/BetaTag.vue'
import { isPointsResource, isPricedResource } from '@/shared/resourceSale'
import { titleSizeClass } from '@/components/resource-catalog/resourceCatalogModel'
import { formatUpdatedAt, type MobileCard } from '@/components/mobile-resource/mobileResourceModel'

/**
 * 移动端资源列表里的一张卡：封面 / 标题（价格与原创转载标记）/ 简介 / 标签行 / 点赞、作者与更新日期合并一行。
 *
 * 从 `MobileResourceList.vue` 的模板里整块搬出来，结构与文案未改；点击只把「打开这条」抛给列表，
 * 跳转口径（页内详情态、带着筛选 query）仍由列表决定。
 */
const props = defineProps<{
  card: MobileCard
}>()

const emit = defineEmits<{
  open: []
}>()

const cardTags = computed(() =>
  props.card.tagsText
    .split(' ')
    .map((tag) => tag.trim())
    .filter(Boolean),
)
</script>

<template>
  <article class="mobile-card" @click="emit('open')">
    <div class="card-thumb">
      <img v-if="props.card.img" :src="props.card.img" :alt="props.card.title" />
      <span v-else class="card-thumb-fallback">📦</span>
    </div>
    <div class="card-body">
      <h3 class="card-title" :class="titleSizeClass(props.card.title)">
        {{ props.card.title }}
        <span
          class="card-price-badge"
          :class="{
            'is-paid': isPricedResource(
              props.card.priceFen,
              props.card.pricePoints,
              props.card.minVersionPriceFen,
            ),
            'is-points': isPointsResource(props.card.pricePoints),
          }"
          >{{ props.card.priceLabel }}</span
        >
        <span
          class="card-repost-badge"
          :class="{ 'is-repost': props.card.originType === 'repost' }"
          >{{ props.card.originType === 'repost' ? '转载' : '原创' }}</span
        >
      </h3>
      <TTooltip
        class="card-desc-tooltip"
        :content="props.card.desc"
        placement="top"
        trigger="click"
        :max-width="280"
        @click.stop
      >
        <span class="card-desc">{{ props.card.desc }}</span>
      </TTooltip>
      <div v-if="cardTags.length" class="card-tags">
        <span v-for="tag in cardTags" :key="tag" class="card-tag">{{ tag }}</span>
      </div>
      <!-- 点赞是只读统计，和出处并进同一行，不再单独占一行 -->
      <div class="card-meta">
        <!-- 面板价资源的 BETA 放在标题外的统计行：标题最多两行，标签留在标题里会跟长标题抢行高（判据与桌面卡同一份）。 -->
        <BetaTag
          v-if="
            isPricedResource(
              props.card.priceFen,
              props.card.pricePoints,
              props.card.minVersionPriceFen,
            )
          "
          size="xs"
          class="card-beta-tag"
        />
        <span class="card-stat">
          <svg class="card-stat__heart" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z"
              fill="currentColor"
            />
          </svg>
          <span class="card-stat__num">{{ props.card.likeCount }}</span>
        </span>
        <span class="card-meta__dot" aria-hidden="true">·</span>
        <span class="card-meta__author">
          <span class="card-meta__author-label">作者</span>
          <span class="card-meta__author-name">{{ props.card.author }}</span>
        </span>
        <span class="card-meta__dot" aria-hidden="true">·</span>
        <span class="card-meta__date">{{ formatUpdatedAt(props.card.updatedAt) }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped src="./mobile-resource-card.css"></style>
