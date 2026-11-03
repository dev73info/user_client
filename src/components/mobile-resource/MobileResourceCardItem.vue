<script setup lang="ts">
import { computed } from 'vue'
import { TTooltip } from 'ui_73info'

import { isPointsResource, isPricedResource } from '@/shared/resourceSale'
import { formatUpdatedAt, type MobileCard } from '@/components/mobile-resource/mobileResourceModel'

/**
 * 移动端资源列表里的一张卡：封面 / 标题（价格与原创转载标记）/ 简介 / 点赞与标签数 / 作者与更新日期。
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
      <h3 class="card-title">
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
      <div class="card-stats">
        <span class="card-stat">
          <span class="card-stat__heart" aria-hidden="true">♥</span>
          <span class="card-stat__num">{{ props.card.likeCount }}</span>
        </span>
      </div>
      <div v-if="cardTags.length" class="card-tags">
        <span v-for="tag in cardTags" :key="tag" class="card-tag">{{ tag }}</span>
      </div>
      <div class="card-meta">
        <span class="card-meta__author">by {{ props.card.author }}</span>
        <span class="card-meta__dot" aria-hidden="true">·</span>
        <span class="card-meta__date">{{ formatUpdatedAt(props.card.updatedAt) }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped src="./mobile-resource-card.css"></style>
